# CURRENT SYSTEM ARCHITECTURE
## BlackTecCom Production & Distribution Management System (MAKARON)
**Документ:** Архитектурное описание текущего состояния  
**Версия:** 1.0.0  
**Дата:** 22.09.2026

---

## 1. Топология текущей реализации

На текущем этапе система развернута как высокопроизводительное **Offline-First Progressive Web Application (PWA)**:

```mermaid
graph TD
    User["Пользователь (Браузер / Телефон / Планшет)"]
    ViteServer["Vite Dev/Prod Server (Port 3000, Host: 0.0.0.0)"]
    
    subgraph BrowserApp ["Клиентский контейнер браузера"]
        ReactApp["React 19 + TypeScript + Tailwind v4"]
        RoleRouter["Динамический ролевой маршрутизатор (App.tsx)"]
        
        subgraph Cabinets ["Ролевые кабинеты"]
            PointUI["Кабинет Точки (Режим 1)"]
            AgentUI["Кабинет Агента (Режим 2)"]
            SupUI["Кабинет Супервайзера"]
            ZavUI["Кабинет Завсклада"]
            WorkUI["Терминал Комплектовщика"]
            TaxUI["Кабинет Таксимота"]
            DirUI["Дашборд Директора"]
            AdmUI["Панель Администратора"]
            AudUI["Кабинет Аудитора"]
        end
        
        subgraph Services ["Сервисный слой"]
            SyncServ["syncEngine.ts (Очередь мутаций)"]
            AuditServ["auditService.ts (Неизменяемый логгер)"]
        end
        
        subgraph ClientDB ["Локальная БД IndexedDB"]
            DexieDB["Dexie.js (BlackTecComMakaronDB)"]
            Tables["22 таблицы: orders, stock, workers, routes, syncQueue..."]
        end
    end
    
    User --> ViteServer
    ViteServer --> ReactApp
    ReactApp --> RoleRouter
    RoleRouter --> Cabinets
    Cabinets <--> Services
    Services <--> DexieDB
    DexieDB --- Tables
```

---

## 2. Иерархия компонентов и структура каталогов

```text
F:\ANTIGRAVITY\MAKARON\
├── docs/
│   ├── FTD/                      # Официальные нормативные документы FTD v1.0
│   ├── audit/                    # Отчеты аудита текущего состояния и анализ пробелов
│   ├── architecture/             # Архитектурная документация
│   ├── database/                 # Спецификация схемы БД
│   ├── api/                      # Спецификация REST API и WebSocket
│   └── offline/                  # Спецификация Offline-First протокола
├── src/
│   ├── components/               # Переиспользуемые UI компоненты
│   │   ├── Header.tsx            # Шапка с селектором ролей и индикатором сети
│   │   ├── InteractiveMap.tsx    # Интерактивная карта Leaflet (точки, полилинии)
│   │   ├── SignaturePad.tsx      # Сенсорное полотно Canvas для цифровой подписи
│   │   └── CameraPhotoModal.tsx  # Фотофиксация с водяными знаками (GPS, время)
│   ├── db/
│   │   └── database.ts           # Схема Dexie (22 таблицы) и начальный сидинг
│   ├── services/
│   │   ├── syncEngine.ts         # Движок автономности и очереди мутаций
│   │   └── auditService.ts       # Сервис сквозного аудита (Audit Trail)
│   ├── types/
│   │   └── index.ts              # Строгие TypeScript типы данных всех сущностей
│   ├── views/                    # Ролевые кабинеты системы
│   │   ├── AdminView.tsx         # Панель администратора
│   │   ├── AgentView.tsx         # Мобильный кабинет торгового агента
│   │   ├── AuditorView.tsx       # Кабинет ревизора / аудитора
│   │   ├── DirectorView.tsx      # Ситуационный центр генерального директора
│   │   ├── PointView.tsx         # Кабинет собственной торговой точки
│   │   ├── SupervisorView.tsx    # Кабинет супервайзера и конструктор маршрутов
│   │   ├── TaxsimotView.tsx      # Мобильный кабинет водителя-экспедитора
│   │   ├── WorkerView.tsx        # Сенсорный терминал комплектовщика
│   │   └── ZavskladView.tsx      # Кабинет начальника склада готовой продукции
│   ├── App.tsx                   # Корневой контейнер и ролевая маршрутизация
│   ├── main.tsx                  # Входная точка приложения
│   └── index.css                 # Стили Tailwind CSS v4 и Leaflet
├── package.json                  # Зависимости и скрипты
├── tsconfig.json                 # Конфигурация TypeScript
└── vite.config.ts                # Конфигурация сборщика Vite 6
```

---

## 3. Модель потоков данных (Data Flow)

1. **Создание транзакции (Заказ / Подпись / Отметка / Смена):**
   - Пользователь инициирует действие в UI;
   - Данные валидируются валидаторами интерфейса;
   - Генерируется клиентский UUID v4;
   - Запись сохраняется в локальное хранилище Dexie.js (Optimistic UI);
   - Параллельно формируется запись в `db.auditLogs` с фиксацией автора, времени, дельты и IP/устройства;
   - Мутация помещается в очередь `db.syncQueue` со статусом `QUEUED` (или `SYNCED` при наличии сети).
2. **Сквозная цепочка согласования (End-to-End State Machine):**
   - Каждое изменение статуса сопровождается добавлением записи в массив `order.history` с неизменяемым снимком состояния.
   - Никакие исторические значения не стираются из памяти.
