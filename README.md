# BlackTecCom Production & Distribution Management System (MAKARON)

[![Build & Auto Release](https://github.com/blackteccom/makaron/actions/workflows/release.yml/badge.svg)](https://github.com/blackteccom/makaron/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20-green.svg)](https://nodejs.org/)
[![Vitest](https://img.shields.io/badge/Vitest-100%25%20Passed-brightgreen.svg)](https://vitest.dev/)
[![Offline-First](https://img.shields.io/badge/Storage-IndexedDB%20%2B%20Dexie-orange.svg)](https://dexie.org/)

Единая цифровая платформа для управления производством, готовой продукцией, складами, заявками, комплектованием, распределением, маршрутами и доставкой с поддержкой полноценного **Offline-First** режима.

---

## 🎯 Архитектурная цепочка (End-to-End Pipeline)

```
Точка / Магазин ──> Агент / Supervisor ──> Завсклад ──> Комплектовщик ──> Погрузка ──> Сверка (MATCH) ──> Таксимот ──> Доставка ──> Подпись / Фото ──> Аналитика
```

---

## 🌟 Ключевые возможности

1. **Два сквозных режима поставок:**
   - **Режим №1 (Собственные точки):** Прямые заказы по весовым категориям (5, 10, 15, 23, 25, 50 кг), согласование складом, комплектация, выезд.
   - **Режим №2 (Полевые продажи через Агента):** Регистрация магазина с GPS и фото вывески, оформление черновика, согласование супервайзером, проверка кредитного лимита.
2. **10 специализированных рабочих кабинетов (RBAC):**
   - 🛡️ **Admin:** Управление учетными записями, филиалами, системными журналами.
   - 📊 **Director:** Ситуационный центр предприятия за сутки, сводка ФОТ, KPI, выручки.
   - 🧭 **Supervisor:** Валидация заявок, конструктор маршрутов с Drag & Drop, версионирование $v1 \to v2$.
   - 🏬 **Zavsklad:** Учет остатков ($Available = Physical - Reserved$), частичное согласование с Delta (100 $\to$ 60, дельта $-40$).
   - 📦 **Picker (Комплектовщик):** Сенсорный тачскрин-терминал с крупными кнопками (10/10, 20/20) и фиксацией проблем сборки.
   - 👷 **Worker:** Сдельный учет выработки ($\text{Объем (кг)} \times \text{Тариф} = \text{Сумма}$) и табель смен.
   - 🚚 **Taxsimot (Водитель):** Мобильный интерфейс, навигация, порядок остановок, фиксация отклонений.
   - 🏪 **Company Point:** Быстрое формирование заявок с авторасчетом суммарного веса.
   - 🔍 **Auditor:** Неизменяемый аудит-лог (Audit Trail) с контролем изменений, IP и гео-координат.
3. **Двухсторонняя блокирующая сверка погрузки (2-Step Reconciliation):**
   - Склад подтверждает вес, Водитель подтверждает принятый вес.
   - При расхождении веса выезд **жестко блокируется** (HTTP 422 `START_ROUTE_BLOCKED`) до устранения или санкционированного снятия расхождения супервайзером.
4. **3 метода подтверждения вручения товара:**
   - Электронное подтверждение точкой в системе (`E_BUTTON`).
   - Графическая подпись получателя на сенсорном Canvas (`CANVAS_SIGNATURE`).
   - Фотофиксация разгрузки с водяным знаком даты/времени/GPS (`PHOTO_PROOF`).
5. **Рекламации и возвратные накладные:**
   - Оформление возврата брака с фотоотчетом и автогенерацией номера возвратной накладной (`RET-...`).
6. **Единый цифровой паспорт поставки (Digital Passport):**
   - Сквозной мониторинг всех 17 контрольных этапов заказа.
7. **Offline-First архитектура:**
   - Локальная база данных IndexedDB (Dexie 4.4), очередь мутаций с UUIDv4, автоматический Push/Pull при появлении сети, защита от повторных списаний (идемпотентность).

---

## 🚀 Быстрый старт (Local Development)

### 1. Установка зависимостей
```bash
npm install
```

### 2. Запуск в режиме разработки
```bash
# Запуск фронтенда (порт 3000)
npm run dev

# Запуск Enterprise Backend API (порт 3001)
npm run server
```

### 3. Автоматизированные тесты
```bash
npm test
```

### 4. Продакшн сборка
```bash
npm run build
```

---

## 🛠️ Стек технологий

- **Frontend:** React 19, TypeScript, Vite 6, Tailwind CSS v4, Lucide React, Leaflet & OpenStreetMap, SheetJS (XLSX).
- **Offline Data:** Dexie.js (IndexedDB 3.0), Service Worker.
- **Backend:** Node.js, Express, TypeScript, WebSockets (`ws`), File-based Relational Store with ACID transactions.
- **Testing:** Vitest (7 test suites, 20 tests).
- **CI/CD:** GitHub Actions (автоматический запуск тестов, сборка и публикация релиза с прикреплением zip-архива).

---

## 📜 Лицензия
(c) 2026 BlackTecCom Enterprise. All rights reserved.
