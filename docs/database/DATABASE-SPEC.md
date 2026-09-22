# DATABASE SPECIFICATION (DATABASE-SPEC)
## BlackTecCom Production & Distribution Management System (MAKARON)
**Статус:** Базовая спецификация (IndexedDB Actual + PostgreSQL/SQLite Target)  
**Версия:** 1.0.0  
**Дата:** 22.09.2026

---

## 1. Общие принципы организации схемы

1. **Первичные ключи (Primary Keys):** Во всех таблицах используются строковые UUID v4 (`string` / `uuid`), генерируемые на клиенте или сервере, что обеспечивает безопасное автономное создание сущностей в офлайн-режиме без риска коллизий автоинкрементных ID.
2. **Метки времени (Timestamps):** Все даты и время сохраняются в формате ISO 8601 UTC (`YYYY-MM-DDTHH:mm:ss.sssZ`).
3. **Неизменяемость аудита:** Таблицы `order_versions` и `audit_logs` функционируют в режиме Append-Only (запрет `UPDATE` и `DELETE`).

---

## 2. Спецификация таблиц

### 2.1. Таблица: `users`
- **Назначение:** Учетные записи сотрудников и клиентов предприятия.
- **Поля:**
  - `id` (PK, string/uuid, NOT NULL)
  - `role` (string, NOT NULL, Index) — `ADMIN`, `POINT`, `AGENT`, `SUPERVISOR`, `ZAVSKLAD`, `WORKER`, `TAXSIMOT`, `DIRECTOR`, `AUDITOR`
  - `username` (string, NOT NULL, UNIQUE, Index)
  - `password_hash` (string, NULLABLE в демо, NOT NULL в prod)
  - `full_name` (string, NOT NULL)
  - `phone` (string, NOT NULL)
  - `region_id` (string, NOT NULL)
  - `warehouse_id` (FK $\to$ `warehouses.id`, NULLABLE)
  - `point_id` (FK $\to$ `company_points.id`, NULLABLE)
  - `avatar_url` (string, NULLABLE)
  - `is_active` (boolean, NOT NULL, DEFAULT true)
- **Индексы Dexie:** `id, role, username, warehouseId, pointId`

### 2.2. Таблица: `warehouses`
- **Назначение:** Производственные склады и распределительные центры.
- **Поля:**
  - `id` (PK, string/uuid, NOT NULL)
  - `code` (string, NOT NULL, UNIQUE, Index) — e.g. `WH-MAIN-01`
  - `name` (string, NOT NULL)
  - `address` (string, NOT NULL)
  - `geo_lat` (decimal, NOT NULL)
  - `geo_lng` (decimal, NOT NULL)
  - `manager_user_id` (FK $\to$ `users.id`, NOT NULL)
  - `manager_name` (string, NULLABLE)
  - `is_active` (boolean, NOT NULL, DEFAULT true)

### 2.3. Таблица: `company_points`
- **Назначение:** Фирменные торговые точки собственной розничной сети (Режим №1).
- **Поля:**
  - `id` (PK, string/uuid, NOT NULL)
  - `warehouse_id` (FK $\to$ `warehouses.id`, NOT NULL, Index)
  - `point_code` (string, NOT NULL, UNIQUE, Index) — e.g. `POINT-004`
  - `name` (string, NOT NULL)
  - `address` (string, NOT NULL)
  - `geo_lat` (decimal, NOT NULL)
  - `geo_lng` (decimal, NOT NULL)
  - `contact_name` (string, NOT NULL)
  - `contact_phone` (string, NOT NULL)
  - `is_active` (boolean, NOT NULL, DEFAULT true)

### 2.4. Таблица: `shops`
- **Назначение:** Внешние розничные торговые точки и магазины (Режим №2).
- **Поля:**
  - `id` (PK, string/uuid, NOT NULL)
  - `registered_by_agent_id` (FK $\to$ `users.id`, NOT NULL, Index)
  - `registered_by_agent_name` (string, NULLABLE)
  - `name` (string, NOT NULL)
  - `shop_type` (string, NOT NULL) — `Мини-маркет`, `Продуктовый магазин`, `Оптовая точка`, `Супермаркет`
  - `address` (string, NOT NULL)
  - `geo_lat` (decimal, NOT NULL)
  - `geo_lng` (decimal, NOT NULL)
  - `owner_name` (string, NOT NULL)
  - `phone` (string, NOT NULL)
  - `storefront_photo_url` (text, NULLABLE)
  - `opening_hours` (string, NOT NULL)
  - `status` (string, NOT NULL, Index) — `ACTIVE`, `PENDING_REVIEW`, `BLOCKED`
  - `created_at` (timestamptz, NOT NULL)

### 2.5. Таблица: `product_categories`
- **Назначение:** Категории готовой продукции.
- **Поля:**
  - `id` (PK, string/uuid, NOT NULL)
  - `code` (string, NOT NULL, UNIQUE, Index) — e.g. `PASTA-PREMIUM`
  - `name` (string, NOT NULL) — e.g. `Макаронные изделия высшего сорта`
  - `sort_order` (int, NOT NULL, DEFAULT 1)

### 2.6. Таблица: `products`
- **Назначение:** Наименования изделий.
- **Поля:**
  - `id` (PK, string/uuid, NOT NULL)
  - `category_id` (FK $\to$ `product_categories.id`, NOT NULL, Index)
  - `sku` (string, NOT NULL, UNIQUE, Index) — e.g. `MAK-VERM`
  - `name` (string, NOT NULL) — e.g. `Вермишель`, `Макароны`, `Лапша`
  - `description` (text, NULLABLE)

### 2.7. Таблица: `product_packages`
- **Назначение:** Весовые фасовки готовой продукции (5, 10, 15, 23, 25, 50 кг).
- **Поля:**
  - `id` (PK, string/uuid, NOT NULL)
  - `product_id` (FK $\to$ `products.id`, NOT NULL, Index)
  - `product_name` (string, NOT NULL)
  - `package_weight_kg` (decimal, NOT NULL, Index) — 5.0, 10.0, 15.0, 23.0, 25.0, 50.0
  - `unit_type` (string, NOT NULL) — `мешок`, `пачка`, `коробка`
  - `barcode` (string, NULLABLE)
  - `is_active` (boolean, NOT NULL, DEFAULT true)

### 2.8. Таблица: `stock`
- **Назначение:** Складские физические, резервные остатки и пороги безопасности.
- **Поля:**
  - `id` (PK, string/uuid, NOT NULL)
  - `warehouse_id` (FK $\to$ `warehouses.id`, NOT NULL, Index)
  - `product_package_id` (FK $\to$ `product_packages.id`, NOT NULL, Index)
  - `product_name` (string, NOT NULL)
  - `package_weight_kg` (decimal, NOT NULL)
  - `quantity_physical` (int, NOT NULL, DEFAULT 0)
  - `quantity_reserved` (int, NOT NULL, DEFAULT 0)
  - `min_critical_level` (int, NOT NULL, DEFAULT 30) — Safety Stock
  - `updated_at` (timestamptz, NOT NULL)

### 2.9. Таблица: `orders`
- **Назначение:** Сводные заголовки заявок (Режим №1 и Режим №2).
- **Поля:**
  - `id` (PK, string/uuid, NOT NULL)
  - `order_number` (string, NOT NULL, UNIQUE, Index) — e.g. `#000152`
  - `mode` (string, NOT NULL, Index) — `MODE_1_DIRECT`, `MODE_2_AGENT`
  - `status` (string, NOT NULL, Index) — `DRAFT`, `SUBMITTED`, `SUPERVISOR_REVIEW`, `WAREHOUSE_REVIEW`, `PARTIALLY_APPROVED`, `APPROVED`, `PICKING`, `READY_FOR_LOADING`, `LOADED`, `IN_TRANSIT`, `ARRIVED`, `DELIVERED`, `CONFIRMED`, `COMPLETED`, `PROBLEM`
  - `point_id` (FK $\to$ `company_points.id`, NULLABLE, Index)
  - `shop_id` (FK $\to$ `shops.id`, NULLABLE, Index)
  - `destination_name` (string, NOT NULL)
  - `destination_address` (string, NOT NULL)
  - `destination_lat` (decimal, NOT NULL)
  - `destination_lng` (decimal, NOT NULL)
  - `created_by_user_id` (FK $\to$ `users.id`, NOT NULL, Index)
  - `created_by_name` (string, NOT NULL)
  - `created_by_role` (string, NOT NULL)
  - `supervisor_user_id` (FK, NULLABLE)
  - `supervisor_name` (string, NULLABLE)
  - `zavsklad_user_id` (FK, NULLABLE)
  - `zavsklad_name` (string, NULLABLE)
  - `total_weight_kg` (decimal, NOT NULL)
  - `total_items_count` (int, NOT NULL)
  - `client_uuid` (string, NOT NULL, UNIQUE)
  - `items` (jsonb array, NOT NULL)
  - `history` (jsonb array, NOT NULL)
  - `comments` (jsonb array, NOT NULL)
  - `created_at` (timestamptz, NOT NULL, Index)
  - `updated_at` (timestamptz, NOT NULL)

### 2.10. Таблица: `picking_tasks`
- **Назначение:** Сборочные задания складским комплектовщикам.
- **Поля:**
  - `id` (PK, string/uuid, NOT NULL)
  - `order_id` (FK $\to$ `orders.id`, NOT NULL, Index)
  - `order_number` (string, NOT NULL)
  - `destination_name` (string, NOT NULL)
  - `warehouse_id` (FK, NOT NULL)
  - `status` (string, NOT NULL, Index) — `ASSIGNED`, `IN_PROGRESS`, `COMPLETED`
  - `assigned_worker_ids` (array of strings, NOT NULL)
  - `assigned_worker_names` (array of strings, NOT NULL)
  - `items` (jsonb array, NOT NULL)
  - `created_at` (timestamptz, NOT NULL)
  - `completed_at` (timestamptz, NULLABLE)

### 2.11. Таблица: `workers`
- **Назначение:** Работники склада (комплектовщики, грузчики, карщики).
- **Поля:**
  - `id` (PK, string/uuid, NOT NULL)
  - `warehouse_id` (FK, NOT NULL, Index)
  - `full_name` (string, NOT NULL)
  - `position` (string, NOT NULL) — `Комплектовщик`, `Грузчик`
  - `phone` (string, NOT NULL)
  - `hire_date` (date, NOT NULL)
  - `is_active` (boolean, NOT NULL, DEFAULT true, Index)

### 2.12. Таблица: `worker_attendance`
- **Назначение:** Ежедневный табель явки и учет отсутствий.
- **Поля:**
  - `id` (PK, string/uuid, NOT NULL)
  - `worker_id` (FK $\to$ `workers.id`, NOT NULL, Index)
  - `worker_name` (string, NOT NULL)
  - `date` (string/date, NOT NULL, Index) — `YYYY-MM-DD`
  - `status` (string, NOT NULL, Index) — `PRESENT`, `SICK`, `VACATION`, `DAY_OFF`, `ABSENT`
  - `reason` (string, NULLABLE)
  - `recorded_by_user_id` (FK, NOT NULL)
  - `recorded_by_name` (string, NOT NULL)
  - `recorded_at` (timestamptz, NOT NULL)

### 2.13. Таблица: `worker_work_logs`
- **Назначение:** Журнал сдельного объема выполненных работ (кг).
- **Поля:**
  - `id` (PK, string/uuid, NOT NULL)
  - `worker_id` (FK $\to$ `workers.id`, NOT NULL, Index)
  - `worker_name` (string, NOT NULL)
  - `date` (string/date, NOT NULL, Index)
  - `operation_type` (string, NOT NULL) — `Комплектация`, `Погрузка`
  - `volume_kg` (decimal, NOT NULL)
  - `tariff_rate_per_kg` (decimal, NOT NULL) — e.g. `0.15`
  - `calculated_amount` (decimal, NOT NULL) — `volume_kg * tariff_rate_per_kg`
  - `recorded_by_user_id` (FK, NOT NULL)
  - `recorded_by_name` (string, NOT NULL)
  - `created_at` (timestamptz, NOT NULL)

### 2.14. Таблица: `loading_operations`
- **Назначение:** Акты погрузки и взаимной двухсторонней сверки перед выездом.
- **Поля:**
  - `id` (PK, string/uuid, NOT NULL)
  - `route_id` (FK $\to$ `routes.id`, NOT NULL, Index)
  - `route_number` (string, NOT NULL)
  - `warehouse_id` (FK, NOT NULL)
  - `vehicle_id` (FK, NOT NULL)
  - `vehicle_name` (string, NOT NULL)
  - `driver_user_id` (FK, NOT NULL)
  - `driver_name` (string, NOT NULL)
  - `zavsklad_user_id` (FK, NOT NULL)
  - `zavsklad_name` (string, NOT NULL)
  - `total_packages_count` (int, NOT NULL)
  - `total_weight_kg` (decimal, NOT NULL)
  - `warehouse_weight_kg` (decimal, NOT NULL)
  - `driver_weight_kg` (decimal, NOT NULL)
  - `status` (string, NOT NULL, Index) — `PREPARING`, `WAITING_DRIVER_CONFIRM`, `LOCKED_DISCREPANCY`, `CONFIRMED_READY`
  - `zavsklad_confirmed_at` (timestamptz, NULLABLE)
  - `driver_confirmed_at` (timestamptz, NULLABLE)
  - `is_discrepancy` (boolean, NOT NULL, DEFAULT false)
  - `discrepancy_weight_kg` (decimal, NOT NULL, DEFAULT 0)
  - `discrepancy_notes` (text, NULLABLE)

### 2.15. Таблица: `routes`
- **Назначение:** Маршрутные рейсы доставки.
- **Поля:**
  - `id` (PK, string/uuid, NOT NULL)
  - `route_number` (string, NOT NULL, UNIQUE, Index) — e.g. `Рейс #00521`
  - `vehicle_id` (FK, NOT NULL)
  - `vehicle_name` (string, NOT NULL)
  - `driver_user_id` (FK $\to$ `users.id`, NOT NULL, Index)
  - `driver_name` (string, NOT NULL)
  - `supervisor_user_id` (FK $\to$ `users.id`, NOT NULL)
  - `supervisor_name` (string, NOT NULL)
  - `date` (string/date, NOT NULL, Index)
  - `status` (string, NOT NULL, Index) — `PLANNED`, `LOCKED`, `IN_TRANSIT`, `COMPLETED`
  - `current_version` (int, NOT NULL, DEFAULT 1)
  - `locked_at` (timestamptz, NULLABLE)
  - `started_at` (timestamptz, NULLABLE)
  - `completed_at` (timestamptz, NULLABLE)
  - `points` (jsonb array, NOT NULL)
  - `history` (jsonb array, NOT NULL)

### 2.16. Таблица: `deliveries`
- **Назначение:** Акты передачи товара с подписями и фото.
- **Поля:**
  - `id` (PK, string/uuid, NOT NULL)
  - `route_point_id` (string, NOT NULL, Index)
  - `order_id` (FK $\to$ `orders.id`, NOT NULL, Index)
  - `order_number` (string, NOT NULL)
  - `target_name` (string, NOT NULL)
  - `confirmation_type` (string, NOT NULL) — `E_BUTTON`, `SIGNATURE`, `PHOTO`, `COMBO`
  - `receiver_name` (string, NOT NULL)
  - `confirmed_at` (timestamptz, NOT NULL)
  - `geo_lat` (decimal, NOT NULL)
  - `geo_lng` (decimal, NOT NULL)
  - `device_fingerprint` (string, NOT NULL)
  - `signature_data_url` (text, NULLABLE)
  - `photo_url` (text, NULLABLE)

### 2.17. Таблица: `returns`
- **Назначение:** Акты возврата бракованной или непринятой продукции.
- **Поля:**
  - `id` (PK, string/uuid, NOT NULL)
  - `order_id` (FK, NOT NULL, Index)
  - `order_number` (string, NOT NULL)
  - `delivery_id` (FK, NOT NULL)
  - `target_name` (string, NOT NULL)
  - `product_package_id` (FK, NOT NULL)
  - `product_name` (string, NOT NULL)
  - `package_weight_kg` (decimal, NOT NULL)
  - `return_qty` (int, NOT NULL)
  - `reason_code` (string, NOT NULL) — `DAMAGED_PACKAGE`, `DEFECT`, `SHOP_REFUSED`
  - `reason_text` (text, NOT NULL)
  - `warehouse_receipt_status` (string, NOT NULL, Index) — `IN_TRANSIT`, `ACCEPTED_INTO_STOCK`
  - `created_at` (timestamptz, NOT NULL)

### 2.18. Таблица: `audit_logs`
- **Назначение:** Неизменяемый системный журнал действий (Audit Trail).
- **Поля:**
  - `id` (PK, string/uuid, NOT NULL)
  - `user_id` (FK, NOT NULL, Index)
  - `user_name` (string, NOT NULL)
  - `role_code` (string, NOT NULL, Index)
  - `action_type` (string, NOT NULL, Index)
  - `entity_name` (string, NOT NULL)
  - `entity_id` (string, NOT NULL)
  - `old_values_json` (jsonb, NULLABLE)
  - `new_values_json` (jsonb, NULLABLE)
  - `diff_summary` (text, NOT NULL)
  - `reason` (text, NULLABLE)
  - `ip_address` (string, NOT NULL)
  - `device_info` (string, NOT NULL)
  - `geo_lat` (decimal, NULLABLE)
  - `geo_lng` (decimal, NULLABLE)
  - `timestamp` (timestamptz, NOT NULL, Index)

### 2.19. Таблица: `sync_queue`
- **Назначение:** Очередь мутаций автономного режима (Offline-First Queue).
- **Поля:**
  - `uuid` (PK, string/uuid, NOT NULL)
  - `entity_type` (string, NOT NULL, Index) — `order`, `shop`, `attendance`, `loading`, `delivery`
  - `action` (string, NOT NULL) — `CREATE`, `UPDATE`, `CONFIRM`
  - `payload` (jsonb, NOT NULL)
  - `client_timestamp` (timestamptz, NOT NULL, Index)
  - `device_id` (string, NOT NULL)
  - `sync_status` (string, NOT NULL, Index) — `LOCAL`, `QUEUED`, `SYNCING`, `SYNCED`, `CONFLICT`
  - `retry_count` (int, NOT NULL, DEFAULT 0)
  - `error` (text, NULLABLE)
