# PROJECT SNAPSHOT v1.0.1
## BlackTecCom Production & Distribution Management System (MAKARON)
**Timestamp:** 2026-09-22T23:40:00+03:00  
**Baseline Version:** 1.0.1-ENTERPRISE  
**Disk Location:** Strict `F:\ANTIGRAVITY\MAKARON\`  
**Compliance Mandate:** Chapter 120 of Technical Specification  

---

## 1. Состояние проекта (Current Project State)
- **Frontend SPA / PWA:**
  - React 19, TypeScript 7, Vite 6, Tailwind CSS v4, Dexie 4.4 IndexedDB, Leaflet 1.9, Lucide React, SheetJS (XLSX).
  - Работает на порту `3000` (Task ID: `task-124`).
  - 9 ролевых экранов (`AdminView`, `DirectorView`, `SupervisorView`, `ZavskladView`, `WorkerView`, `AgentView`, `TaxsimotView`, `PointView`, `AuditorView`).
- **Backend API & Persistence:**
  - Node.js v20.18.0, Express 5, TypeScript (tsx), WebSockets (`ws`).
  - Работает на порту `3001` (Task ID: `task-198`).
  - Файловое реляционное хранилище `server/data/master_db.json` с атомарными записями.
  - JWT RS256/HS256 аутентификация и RBAC.
  - Эндпоинты `/api/v1/auth`, `/api/v1/orders`, `/api/v1/loadings`, `/api/v1/production`, `/api/v1/sync`, `/api/v1/audit`, `/api/v1/health`.
- **Автоматизированное тестирование:**
  - Vitest 4.1.11, 4 сьюта, 10 тестов успешно пройдены.
- **Нормативная документация:**
  - `FTD-v1.0.md`, `CURRENT_ARCHITECTURE.md`, `DATABASE-SPEC.md`, `API-SPEC.md`, `OFFLINE-SYNC-SPEC.md`, `GAP_ANALYSIS.md`, `CHANGELOG.md`.

---

## 2. Структура репозитория (Directory Tree)
```
F:\ANTIGRAVITY\MAKARON\
├── CHANGELOG.md
├── docs\
│   ├── FTD\
│   │   ├── FTD-v1.0.md
│   │   └── FTD-CHANGELOG.md
│   ├── architecture\
│   │   └── CURRENT_ARCHITECTURE.md
│   ├── audit\
│   │   ├── CURRENT_STATE_REPORT.md
│   │   ├── GAP_ANALYSIS.md
│   │   └── PROJECT_SNAPSHOT_v1.0.1.md
│   ├── database\
│   │   └── DATABASE-SPEC.md
│   ├── api\
│   │   └── API-SPEC.md
│   └── offline\
│       └── OFFLINE-SYNC-SPEC.md
├── package.json
├── server\
│   ├── data\
│   │   └── master_db.json
│   └── src\
│       ├── auth.ts
│       ├── db.ts
│       ├── index.ts
│       ├── websocket.ts
│       └── routes\
│           ├── audit.ts
│           ├── auth.ts
│           ├── health.ts
│           ├── loadings.ts
│           ├── orders.ts
│           ├── piecework.ts
│           └── sync.ts
├── src\
│   ├── App.tsx
│   ├── components\
│   ├── db\
│   ├── services\
│   ├── types\
│   └── views\
└── tests\
    ├── loading-reconciliation.test.ts
    ├── orders.test.ts
    ├── piecework.test.ts
    └── sync-idempotency.test.ts
```

---

## 3. Выявленные расхождения со 129 разделами ТЗ (Known Gaps to be Implemented)
1. **Роль «Picker / Комплектовщик» (п. 5, 21, 22, 64, 65, 83):**
   - Требуется выделить `PICKER` в полноправную роль RBAC и создать специализированный сенсорный экран `PickerView.tsx` с крупными кнопками подтверждения сборки (10/10, 20/20) и фиксацией проблем сборки (`PICKING_PROBLEM`).
   - На сервере требуются эндпоинты `/api/v1/picking/tasks` и `/api/v1/picking/items/:id`.
2. **Цифровой паспорт поставки (Digital Passport) (п. 9, 129):**
   - Требуется универсальный визуальный компонент `DigitalPassportModal.tsx`, отображающий все 17 контрольных точек от создания до завершения с фиксацией авторов, GPS, времени, причин изменений, фото и подписей, доступный для просмотра из любого кабинета (Директор, Завсклад, Аудитор, Супервайзер).
3. **Частичное утверждение заказа с Delta и причинами (п. 18.2, 19, 63, 82, 114):**
   - Выделенный эндпоинт `POST /api/v1/warehouse/orders/:id/partial` с атомарной фиксацией записи `warehouse_adjustments`, созданием новой версии `order_versions` и неизменяемого `audit_logs` без перезаписи первоначального `requested_quantity`.
4. **Складской учет остатков и резервирование (п. 58, 59, 115, 116, 117):**
   - Таблица `stock` с формулой $Available = Physical - Reserved$.
   - Таблица `stock_movements` (типы: RECEIPT, ISSUE, TRANSFER, RESERVE, RELEASE, ADJUSTMENT, RETURN).
   - Защита от перерасхода (отсечение резерва при превышении доступного остатка).
   - Эндпоинты: `/api/v1/warehouse/stock`, `/api/v1/warehouse/movements`.
5. **Версионирование маршрутов v1 -> v2 (п. 30, 31, 32, 70, 71, 72, 84):**
   - Эндпоинт `/api/v1/routes/:id/versions` с обязательной фиксацией причины модификации утвержденного рейса.
6. **Возвраты и возвратная накладная (п. 41, 76, 86):**
   - Эндпоинт `POST /api/v1/deliveries/:id/return` с генерацией номера возвратной накладной и возвратом позиций в статус ожидания оприходования на склад.
7. **Система резервного копирования и восстановления (п. 96, 121):**
   - Эндпоинты `POST /api/v1/system/backup` и `POST /api/v1/system/restore` с проверкой целостности восстановления данных.
8. **Система уведомлений (п. 51, 77, 103):**
   - Эндпоинты `GET /api/v1/notifications` и `PATCH /api/v1/notifications/:id/read`.
9. **Глобальный поиск (п. 102):**
   - Компонент быстрого поиска по номеру заказа, магазину, товару, телефону, агенту, маршруту.
10. **Автоматизированные тесты для E2E Сценариев A, B, C (п. 106, 107, 108, 109, 127):**
    - Написать E2E-тесты в Vitest, покрывающие сквозные цепочки A, B, C.
