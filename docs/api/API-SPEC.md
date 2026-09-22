# REST API & WebSocket Specification v1.0
## BlackTecCom Production & Distribution Management System (MAKARON)
**Document Version:** 1.0.0  
**Normative Reference:** FTD-v1.0 (Chapters 14, 21, 23, 24, 26, 28)  
**Status:** APPROVED / NORMATIVE SPECIFICATION  
**Protocols:** HTTP/1.1, HTTP/2 (TLS 1.3), WebSockets (WSS)  
**Base URL:** `https://api.makaron.blackteccom.internal/api/v1`  
**WebSocket URL:** `wss://api.makaron.blackteccom.internal/ws/v1`  

---

## 1. Общие принципы API (General Principles)

### 1.1 Архитектурный стиль
API построено в соответствии со стандартами REST (Representational State Transfer) с семантическим использованием HTTP-методов:
- `GET` — получение данных или списков (идемпотентный, безопасный).
- `POST` — создание новых сущностей, запуск транзакций или пакетных операций.
- `PUT` — полная замена/обновление сущности в статусе DRAFT.
- `PATCH` — частичное обновление или переход по конечному автомату (FSM transitions).
- `DELETE` — логическое удаление (Soft Delete: проставление `is_deleted = true` и `deleted_at`).

### 1.2 Обязательные HTTP-заголовки
| Заголовок | Обязательность | Описание |
|---|---|---|
| `Authorization` | Обязателен (кроме `/auth/login`) | `Bearer <JWT_ACCESS_TOKEN>` |
| `Content-Type` | Обязателен для POST/PUT/PATCH | `application/json` (или `multipart/form-data` для фото) |
| `Accept` | Обязателен | `application/json` |
| `X-Device-Id` | Обязателен | Уникальный UUID клиентского устройства/браузера |
| `X-Idempotency-Key` | Обязателен для мутирующих POST | UUIDv4 для защиты от повторного применения офлайн-запросов |
| `X-Client-Timestamp` | Обязателен | ISO 8601 время генерации транзакции на клиенте |
| `X-Request-Id` | Опционален (генерируется) | Трассировочный идентификатор запроса (Trace ID) |

### 1.3 Стандартные форматы ответов
#### Успешный ответ (Single Entity):
```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "timestamp": "2026-09-22T20:30:00.000Z",
    "requestId": "req-9876-abcd-1234"
  }
}
```

#### Успешный ответ со списком и пагинацией:
```json
{
  "success": true,
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "pageSize": 50,
    "totalItems": 342,
    "totalPages": 7,
    "hasNext": true,
    "hasPrev": false
  },
  "meta": {
    "timestamp": "2026-09-22T20:30:00.000Z",
    "requestId": "req-9876-abcd-1235"
  }
}
```

#### Ответ с ошибкой (RFC 7807 Compliant):
```json
{
  "success": false,
  "error": {
    "code": "LOADING_MISMATCH_DETECTED",
    "message": "Расхождение веса погрузки превышает допустимый порог: склад 500.00 кг, водитель 480.00 кг (дельта -20.00 кг). Старт рейса заблокирован.",
    "status": 422,
    "details": [
      {
        "field": "total_weight_driver_kg",
        "expected": 500.0,
        "actual": 480.0,
        "delta": -20.0,
        "tolerance": 0.5
      }
    ],
    "timestamp": "2026-09-22T20:30:00.000Z",
    "requestId": "req-9876-abcd-1236"
  }
}
```

---

## 2. Аутентификация и RBAC-авторизация

### 2.1 JWT-токены
- **Access Token:** Срок жизни 60 минут, подпись RS256/HS256. Включает:
  ```json
  {
    "sub": "usr-uuid-001",
    "username": "zavsklad_alim",
    "role": "ZAVSKLAD",
    "warehouse_id": "wh-main-01",
    "point_id": null,
    "agent_id": null,
    "permissions": ["orders:read", "loading:verify", "stock:manage"],
    "iat": 1758571200,
    "exp": 1758574800
  }
  ```
- **Refresh Token:** Срок жизни 30 дней, хранится в защищенной HTTP-Only cookie или зашифрованном локальном хранилище.

### 2.2 Матрица ролевого доступа (RBAC Matrix)
| Модуль / Эндпоинт | ADMIN | POINT | AGENT | SUPERVISOR | ZAVSKLAD | WORKER | TAXSIMOT | DIRECTOR | AUDITOR |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `POST /auth/login` | + | + | + | + | + | + | + | + | + |
| `GET /orders` | + | Своя точка | Свои магазины | Своя зона | Все | - | Назначенные рейсы | Все | Все (Read) |
| `POST /orders` (Режим 1) | + | + | - | - | - | - | - | - | - |
| `POST /orders` (Режим 2) | + | - | + | + | - | - | - | - | - |
| `POST /orders/{id}/confirm-delivery` | + | + | - | + | - | - | + | - | - |
| `POST /loadings` | + | - | - | + | + | - | + | - | - |
| `POST /loadings/{id}/warehouse-verify`| + | - | - | - | + | - | - | - | - |
| `POST /loadings/{id}/driver-verify` | + | - | - | - | - | - | + | - | - |
| `POST /loadings/{id}/start-route` | + | - | - | - | - | - | + (при MATCH)| - | - |
| `POST /production/piecework-logs` | + | - | - | - | + | + | - | - | - |
| `GET /audit/logs` | + | - | - | - | - | - | - | + | + |

---

## 3. Спецификация эндпоинтов

### 3.1 Модуль авторизации (Authentication)

#### 3.1.1 Вход в систему
`POST /api/v1/auth/login`
- **Доступ:** Публичный
- **Тело запроса:**
  ```json
  {
    "username": "agent_bahrom",
    "password": "SecurePassword2026!",
    "device_info": {
      "device_id": "pwa-galaxy-tab-01",
      "model": "Samsung Galaxy Tab Active 4 Pro",
      "app_version": "1.0.0",
      "os": "Android 14"
    }
  }
  ```
- **Успешный ответ (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "access_token": "eyJhbGciOi...",
      "refresh_token": "rf_987654...",
      "expires_in": 3600,
      "user": {
        "id": "usr-agent-01",
        "username": "agent_bahrom",
        "full_name": "Бахром Умаров",
        "role": "AGENT",
        "phone": "+992900000003",
        "agent_id": "ag-01",
        "supervisor_id": "usr-sup-01"
      }
    }
  }
  ```

#### 3.1.2 Обновление токена
`POST /api/v1/auth/refresh`
- **Тело запроса:** `{ "refresh_token": "rf_987654..." }`
- **Ответ (200 OK):** Новая пара access/refresh токенов.

---

### 3.2 Модуль заказов (Orders Management)

#### 3.2.1 Список заказов
`GET /api/v1/orders`
- **Параметры фильтрации (Query):**
  - `supply_mode`: `MODE_1_POINT` | `MODE_2_SHOP`
  - `status`: `DRAFT`, `CONFIRMED`, `COLLECTING`, `COLLECTED`, `LOADING`, `DELIVERING`, `DELIVERED`, `REJECTED`, `CANCELLED`
  - `point_id`: UUID собственной точки (Режим 1)
  - `shop_id`: UUID внешнего магазина (Режим 2)
  - `agent_id`: UUID торгового представителя
  - `date_from`: ISO Date
  - `date_to`: ISO Date
  - `limit`: default 50, max 200
  - `offset`: default 0

#### 3.2.2 Создание заказа
`POST /api/v1/orders`
- **Заголовки:** `X-Idempotency-Key: <UUIDv4>`
- **Тело запроса (Режим 1 — Точка):**
  ```json
  {
    "supply_mode": "MODE_1_POINT",
    "point_id": "pt-01",
    "delivery_date_requested": "2026-09-23",
    "items": [
      {
        "product_id": "prod-01",
        "product_name": "Спагетти Экстра 400г",
        "quantity": 100,
        "price": 12.50,
        "weight_per_unit_kg": 0.40
      },
      {
        "product_id": "prod-02",
        "product_name": "Рожки Традиционные 1кг",
        "quantity": 50,
        "price": 28.00,
        "weight_per_unit_kg": 1.00
      }
    ],
    "notes": "Поставка к утреннему открытию"
  }
  ```
- **Серверные инварианты при создании:**
  - `total_weight_kg` рассчитывается строго: $\sum (q_i \times w_i) = 100 \times 0.40 + 50 \times 1.00 = 90.00$ кг.
  - `total_sum` рассчитывается строго: $\sum (q_i \times p_i) = 100 \times 12.50 + 50 \times 28.00 = 2650.00$ TJS.
  - Статус инициализируется как `CONFIRMED` (для точек) или `DRAFT`/`CONFIRMED` (для агентов по лимиту задолженности магазина).
- **Успешный ответ (201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "id": "ord-2026-00452",
      "order_number": "ORD-00452",
      "supply_mode": "MODE_1_POINT",
      "point_id": "pt-01",
      "status": "CONFIRMED",
      "total_weight_kg": 90.00,
      "total_sum": 2650.00,
      "created_at": "2026-09-22T20:35:00.000Z",
      "version": 1
    }
  }
  ```

#### 3.2.3 Подтверждение доставки заказа (3 метода фиксации)
`POST /api/v1/orders/{id}/confirm-delivery`
- **Тело запроса (Method A: Электронная кнопка):**
  ```json
  {
    "confirmation_method": "E_BUTTON",
    "geo_lat": 38.56012,
    "geo_lng": 68.77543,
    "geo_accuracy_meters": 4.5,
    "recipient_name": "Каримов Ш.",
    "delivered_at": "2026-09-23T11:15:20.000Z"
  }
  ```
- **Тело запроса (Method B: Цифровая подпись):**
  ```json
  {
    "confirmation_method": "CANVAS_SIGNATURE",
    "signature_base64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "recipient_name": "Мухаммадиев А. (Управляющий)",
    "geo_lat": 38.56012,
    "geo_lng": 68.77543,
    "geo_accuracy_meters": 5.0,
    "delivered_at": "2026-09-23T11:18:00.000Z"
  }
  ```
- **Тело запроса (Method C: Фото-доказательство):**
  ```json
  {
    "confirmation_method": "PHOTO_PROOF",
    "photo_url": "https://storage.makaron.internal/proofs/2026-09/ord-452.jpg",
    "watermark_meta": {
      "timestamp": "2026-09-23 11:20:04",
      "geo_lat": 38.56012,
      "geo_lng": 68.77543,
      "order_number": "ORD-00452",
      "driver_name": "Рустам Водитель"
    },
    "geo_lat": 38.56012,
    "geo_lng": 68.77543,
    "delivered_at": "2026-09-23T11:20:04.000Z"
  }
  ```

---

### 3.3 Модуль двухэтапной сверки погрузки (2-Step Loading Reconciliation)

#### 3.3.1 Шаг 1: Фиксация погрузки складом (Завсклад)
`POST /api/v1/loadings/{id}/warehouse-verify`
- **Тело запроса:**
  ```json
  {
    "warehouse_user_id": "usr-zavsklad-01",
    "verified_items": [
      { "order_id": "ord-001", "product_id": "prod-01", "quantity": 50, "scanned_barcode": "476001234501" },
      { "order_id": "ord-002", "product_id": "prod-02", "quantity": 100, "scanned_barcode": "476001234502" }
    ],
    "total_packages": 150,
    "total_weight_kg": 500.00,
    "notes": "Сформировано на паллете №4"
  }
  ```
- **Ответ (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "loading_id": "load-101",
      "status": "WAREHOUSE_VERIFIED",
      "warehouse_verified_at": "2026-09-23T07:15:00.000Z",
      "total_weight_warehouse_kg": 500.00
    }
  }
  ```

#### 3.3.2 Шаг 2: Приемка и сканирование водителем (Таксимот)
`POST /api/v1/loadings/{id}/driver-verify`
- **Тело запроса:**
  ```json
  {
    "driver_user_id": "usr-driver-01",
    "verified_items": [
      { "order_id": "ord-001", "product_id": "prod-01", "quantity": 50 },
      { "order_id": "ord-002", "product_id": "prod-02", "quantity": 96 }
    ],
    "total_packages": 146,
    "total_weight_kg": 480.00,
    "driver_notes": "Не хватает 4 упаковок по заказу ord-002"
  }
  ```

#### 3.3.3 Системная сверка и блокировка старта рейса
`POST /api/v1/loadings/{id}/reconcile`
- **Бизнес-правило:**
  - Если $|\text{weight}_{\text{wh}} - \text{weight}_{\text{driver}}| \le 0.5\text{ кг}$ И $\text{packages}_{\text{wh}} == \text{packages}_{\text{driver}}$:
    - Статус: `MATCH`. Водитель получает допуск к старту рейса (`can_start_route = true`).
  - Иначе:
    - Статус: `MISMATCH`. Старт рейса блокируется (`can_start_route = false`).
- **Ответ при расхождении (422 Unprocessable Entity):**
  ```json
  {
    "success": false,
    "error": {
      "code": "LOADING_MISMATCH_BLOCKING",
      "message": "Расхождение погрузки: склад 500.00 кг, водитель 480.00 кг (дельта -20.00 кг, -4 уп.). Старт рейса заблокирован.",
      "status": 422,
      "discrepancy": {
        "weight_delta_kg": -20.00,
        "package_delta": -4,
        "affected_order_ids": ["ord-002"],
        "resolution_required": "SUPERVISOR_OR_ZAVSKLAD_OVERRIDE"
      }
    }
  }
  ```

#### 3.3.4 Разрешение расхождения (Supervisor / Zavsklad Override)
`POST /api/v1/loadings/{id}/resolve-discrepancy`
- **Требуемая роль:** `SUPERVISOR`, `ZAVSKLAD`, `ADMIN`
- **Тело запроса:**
  ```json
  {
    "resolution_type": "REPACK_AND_REVERIFY",
    "final_weight_kg": 500.00,
    "final_packages": 150,
    "comment": "Догружены недостающие 4 упаковки со склада, пересканировано водителем",
    "supervisor_signature": "data:image/png;base64,..."
  }
  ```
- **Результат:** Статус переводится в `MATCH`, формируется запись в `audit_logs`, блокировка снимается.

---

### 3.4 Модуль сдельной оплаты труда работников (Worker Piecework & Timesheet)

#### 3.4.1 Регистрация смены (Табель учета)
`POST /api/v1/production/shifts/clock-in`
- **Тело запроса:** `{ "worker_id": "wrk-01", "station_id": "LINE-PACKAGING-01" }`

`POST /api/v1/production/shifts/clock-out`
- **Тело запроса:** `{ "shift_id": "shf-8891", "notes": "Смена завершена штатно" }`

#### 3.4.2 Фиксация сдельной выработки
`POST /api/v1/production/piecework-logs`
- **Формула расчета:** $\text{Сумма} = \text{Объем (кг)} \times \text{Тариф за кг}$
- **Тело запроса:**
  ```json
  {
    "worker_id": "wrk-01",
    "batch_id": "batch-2026-09-001",
    "operation_type": "PACKING",
    "volume_kg": 450.00,
    "tariff_per_kg": 0.35,
    "shift_id": "shf-8891"
  }
  ```
- **Серверный инвариант:** Поле `total_amount` рассчитывается строго сервером: $450.00 \times 0.35 = 157.50$ TJS.
- **Ответ (201 Created):**
  ```json
  {
    "success": true,
    "data": {
      "id": "pw-log-5501",
      "worker_id": "wrk-01",
      "operation_type": "PACKING",
      "volume_kg": 450.00,
      "tariff_per_kg": 0.35,
      "total_amount": 157.50,
      "currency": "TJS",
      "created_at": "2026-09-22T20:40:00.000Z"
    }
  }
  ```

---

### 3.5 Модуль офлайн-синхронизации (Offline-First Sync Protocol)

#### 3.5.1 Пакетная отправка изменений с клиента (Push Mutations)
`POST /api/v1/sync/push`
- **Заголовок:** `X-Device-Id: <client-device-uuid>`
- **Тело запроса:**
  ```json
  {
    "device_id": "pwa-driver-tab-01",
    "client_batch_id": "batch-sync-10023",
    "client_timestamp": "2026-09-22T20:45:00.000Z",
    "mutations": [
      {
        "uuid": "mut-7711a",
        "entity_type": "orders",
        "action": "UPDATE_STATUS",
        "client_timestamp": "2026-09-22T20:42:10.000Z",
        "payload": {
          "order_id": "ord-001",
          "status": "DELIVERED",
          "confirmation_method": "CANVAS_SIGNATURE",
          "geo_lat": 38.56012,
          "geo_lng": 68.77543,
          "signature_url": "data:image/png;base64,..."
        }
      },
      {
        "uuid": "mut-7712b",
        "entity_type": "route_points",
        "action": "RECORD_DEVIATION",
        "client_timestamp": "2026-09-22T20:44:00.000Z",
        "payload": {
          "route_id": "rt-101",
          "deviation_reason": "Дорожный затор / ремонт полотна ул. Рудаки",
          "geo_lat": 38.55800,
          "geo_lng": 68.78010
        }
      }
    ]
  }
  ```
- **Ответ сервера (200 OK):**
  ```json
  {
    "success": true,
    "processed": 2,
    "results": [
      { "uuid": "mut-7711a", "status": "APPLIED", "server_id": "ord-001", "server_version": 4 },
      { "uuid": "mut-7712b", "status": "APPLIED", "server_id": "dev-902", "server_version": 1 }
    ],
    "conflicts": [],
    "server_timestamp": "2026-09-22T20:45:01.120Z"
  }
  ```

#### 3.5.2 Получение серверных обновлений (Pull Delta)
`POST /api/v1/sync/pull`
- **Тело запроса:**
  ```json
  {
    "device_id": "pwa-driver-tab-01",
    "last_synced_at": "2026-09-22T19:00:00.000Z",
    "subscribed_entities": ["orders", "loadings", "routes", "products"]
  }
  ```
- **Ответ сервера (200 OK):**
  ```json
  {
    "success": true,
    "server_timestamp": "2026-09-22T20:45:02.000Z",
    "has_more": false,
    "changes": {
      "orders": [ ... ],
      "loadings": [ ... ],
      "routes": [ ... ],
      "products": []
    },
    "deletions": {
      "orders": ["ord-cancelled-99"]
    }
  }
  ```

---

### 3.7 Кассовый модуль (Cash Operations API)

#### 3.7.1 Получение текущего баланса кассы
`GET /api/v1/cash/balance`
- **Роли:** `ADMIN`, `DIRECTOR`, `AUDITOR`
- **Успешный ответ (200 OK):**
  ```json
  {
    "success": true,
    "data": {
      "accountId": "cash-main-01",
      "code": "CASH-MAIN-01",
      "name": "Главная операционная касса BlackTecCom",
      "openingBalance": 25000.00,
      "totalIncome": 18500.00,
      "totalExpense": 9200.00,
      "currentBalance": 34300.00,
      "currency": "TJS",
      "updatedAt": "2026-09-22T21:00:00.000Z"
    }
  }
  ```

#### 3.7.2 Реестр кассовых операций
`GET /api/v1/cash/transactions`
- **Параметры запроса:** `limit=50`, `type=INCOME|EXPENSE`, `startDate`, `endDate`
- **Успешный ответ (200 OK):** Массив проводок со связанными документами и контрольным остатком.

#### 3.7.3 Проведение приходного/расходного кассового ордера
`POST /api/v1/cash/transactions`
- **Тело запроса:**
  ```json
  {
    "type": "INCOME",
    "category": "POINT_CASH_COLLECTION",
    "amount": 2600.00,
    "referenceEntity": "ORDER",
    "referenceId": "ord-001",
    "description": "Инкассация выручки с Собственной Точки №1 за заказ ORD-2026-001"
  }
  ```
- **Серверные инварианты:**
  - $Amount > 0$.
  - При `type = 'EXPENSE'`: проверка $Amount \le CurrentBalance$, иначе HTTP 422 `INSUFFICIENT_FUNDS`.
  - Автоматическая запись в `audit_logs` и генерация события WebSocket `CASH_TRANSACTION_CREATED`.

---

### 3.8 Производственный модуль со сменами (Production API)

#### 3.8.1 Реестр производственных партий по сменам
`GET /api/v1/production/operations`
- **Параметры:** `date`, `shift=SHIFT_1|SHIFT_2`
- **Успешный ответ (200 OK):** Массив выработанных партий, суммарный вес и список задействованных рабочих.

#### 3.8.2 Регистрация выпуска партии готовой продукции
`POST /api/v1/production/operations`
- **Тело запроса:**
  ```json
  {
    "date": "2026-09-23",
    "shift": "SHIFT_1",
    "lineId": "LINE-01",
    "productPackageId": "prod-03",
    "quantity": 50,
    "workerIds": ["usr-wrk-1"]
  }
  ```
- **Серверные инварианты:**
  - Сервер находит фасовку: `prod-03` $\to$ `packageWeightKg = 23`.
  - Расчет суммарного веса: $50 \times 23 = 1150$ кг.
  - Автоматическое создание складского движения: `type = 'PRODUCTION_RECEIPT'`, `deltaQuantity = +50`.
  - Увеличение физического и доступного остатка на складе на 50 мешков (1150 кг).

#### 3.8.3 Версионируемые тарифы сдельной оплаты
`GET /api/v1/production/rates` и `POST /api/v1/production/rates`
- Управление версионируемыми ставками (например, `PACKING` = 0.35 TJS/кг) с датами вступления в силу.

#### 3.8.4 Табель выходов персонала
`GET /api/v1/production/attendance` и `POST /api/v1/production/attendance`
- Фиксация статусов `PRESENT`, `SICK`, `VACATION`, `OFF`, `ABSENT`.

---

## 4. Спецификация WebSockets (Real-time WSS Protocol)

### 4.1 Соединение и рукопожатие
- **URL:** `wss://api.makaron.blackteccom.internal/ws/v1?token=<JWT_ACCESS_TOKEN>`
- При успешной валидации токена сервер отправляет:
  ```json
  {
    "event": "CONNECTED",
    "data": {
      "socket_id": "sock-9912a",
      "user_id": "usr-driver-01",
      "subscribed_channels": ["orders:driver:usr-driver-01", "loadings:global"]
    }
  }
  ```

### 4.2 Исходящие серверные события (Server-to-Client)
1. `ORDER_UPDATED`:
   ```json
   {
     "event": "ORDER_UPDATED",
     "channel": "orders",
     "data": {
       "order_id": "ord-001",
       "status": "COLLECTED",
       "updated_at": "2026-09-22T20:46:00.000Z"
     }
   }
   ```
2. `LOADING_STATUS_CHANGED`:
   ```json
   {
     "event": "LOADING_STATUS_CHANGED",
     "channel": "loadings",
     "data": {
       "loading_id": "load-101",
       "status": "MISMATCH",
       "weight_delta_kg": -20.00
     }
   }
   ```
3. `DISPATCH_LOCATION_BROADCAST`:
   ```json
   {
     "event": "DRIVER_TELEMETRY",
     "channel": "telemetry",
     "data": {
       "driver_id": "usr-driver-01",
       "route_id": "rt-101",
       "geo_lat": 38.56100,
       "geo_lng": 68.77600,
       "speed_kmh": 34.5,
       "recorded_at": "2026-09-22T20:46:15.000Z"
     }
   }
   ```
