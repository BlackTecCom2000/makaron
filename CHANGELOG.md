# CHANGELOG — BlackTecCom Production & Distribution Management System (MAKARON)

All notable changes to the architecture, documentation, specifications, data models, and codebase are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), adhering to Semantic Versioning.

---

## [1.1.0] - 2026-09-22
### Added
- **Full Compliance with all 129 Chapters of Technical Specification**:
  - **Picker Role (`PICKER`) & Terminal View** (`src/views/PickerView.tsx`):
    - Dedicated touchscreen interface for warehouse pickers with 10/10, 20/20 large buttons, 1-tap increment (+1, +5, all), picking problem reporting (`PICKING_PROBLEM`), and completion transition to `READY_FOR_LOADING`.
    - Backend picking routes (`server/src/routes/picking.ts`) for task assignment, start, item status, problem reporting, and completion.
  - **Universal Digital Passport (`src/components/DigitalPassportModal.tsx`)**:
    - Complete visual audit trail tracking all 17 milestones from order creation to delivery, warehouse adjustments, reconciliation status, signature data, and return waybills.
    - Accessible from any cabinet across all roles.
    - Server endpoint: `GET /api/v1/orders/:id/digital-passport`.
  - **Warehouse Partial Adjustments with Delta Tracking** (`server/src/routes/warehouse.ts`):
    - Dedicated endpoint `POST /api/v1/warehouse/orders/:id/partial` creating `warehouseAdjustments` ($100 \to 60$, delta $-40$), `orderVersions`, and reserving inventory without destroying original requested amounts.
  - **Inventory Stock Reservations & Overdraft Protection** (`server/src/db.ts`, `server/src/routes/warehouse.ts`):
    - Formal implementation of $Available = Physical - Reserved$.
    - Automated stock reservation upon order approval, stock deductions upon dispatch.
    - Overdraft protection throwing 422 `INSUFFICIENT_STOCK` when requested amount exceeds available stock.
    - Production receipt endpoint `POST /api/v1/warehouse/stock/receipt` and movements journal.
  - **Route Versioning $v1 \to v2$** (`server/src/routes/routes.ts`):
    - Enforced mandatory modification reason when editing an approved route.
    - Route version snapshots saved in `routeVersions`.
  - **Returns & Return Waybill Generation** (`server/src/routes/deliveries.ts`):
    - Registration of damaged/rejected goods with photo evidence and automated generation of Return Waybill (`RET-...`).
  - **Backup & Disaster Recovery Subsystem** (`server/src/routes/backup.ts`):
    - Snapshots with SHA-256 checksums (`POST /api/v1/system/backup`).
    - Integrity-verified database restore (`POST /api/v1/system/restore`).
  - **Global System Search** (`src/components/GlobalSearchModal.tsx`):
    - Multi-entity instant search modal for orders, shops, products, phones, agents, and routes (Section 102).
  - **Comprehensive Automated Test Suites (Vitest)**:
    - `tests/e2e-scenarios.test.ts`: E2E Scenario A (Direct Point), Scenario B (Agent & Return Waybill), Scenario C (Offline-First Sync).
    - `tests/stock-reservation.test.ts`: Formula verification, reservation, and overdraft protection.
    - `tests/backup-recovery.test.ts`: Backup creation, SHA-256 integrity check, and restore verification.
    - Total: 7 test files, 20 tests passed (100% pass rate).

---

## [1.0.1] - 2026-09-22
### Added
- **Normative REST & WebSocket API Specification**: `docs/api/API-SPEC.md`
  - Fully declared contracts for 9 roles, RFC 7807 error format, idempotency keys, JWT auth, and live WSS events.
  - Mutual loading reconciliation endpoints (`/warehouse-verify`, `/driver-verify`, `/reconcile`).
  - Worker piecework and timesheet logging endpoints (`/clock-in`, `/clock-out`, `/piecework-logs`).
  - Offline push/pull synchronization contracts (`/sync/push`, `/sync/pull`).
- **Normative Offline-First Specification**: `docs/offline/OFFLINE-SYNC-SPEC.md`
  - High-resilience Dexie 4.4 IndexedDB persistence architecture.
  - Push/pull protocol with idempotency keys (`X-Idempotency-Key`, `UUIDv4`), exponential backoff retry jitter.
  - Conflict resolution matrix (Client-proof wins for delivery, Mismatch trigger for loadings, UUID deduplication).
  - Canvas signature and photo proof compression with GPS/time watermarks.
- **Server Implementation & Persistence Layer** (`server/`):
  - Lightweight Express TypeScript backend server on drive `F:`.
  - Relational database persistence layer for master data, audit logs, and mutations.
  - Live REST endpoints for Auth, Orders, Loadings, Piecework, and Sync Push/Pull.
  - Real-time WebSocket server (`ws`) on port 3001 for live multi-terminal events.
- **Automated Test Suite (Vitest)**:
  - Unit tests for order calculations, weight summation, and supply mode invariant enforcement.
  - Integration tests for 2-step loading reconciliation blocking logic (500 kg vs 480 kg = BLOCKED).
  - Piecework tariff computation verification ($V \times T = \text{Amount}$).
  - Sync idempotency and conflict resolution tests.

---

## [1.0.0] - 2026-09-22
### Added
- **Baseline Business Plan Integration (75 Chapters)**:
  - Mode 1 (Direct company points) and Mode 2 (Retail shops via agents & supervisors).
  - Enterprise Roles: Admin, Point Manager, Agent, Supervisor, Zavsklad, Worker, Taxsimot (Driver/Delivery), Director, Auditor.
- **Engineering Audit & Gap Analysis**:
  - `docs/audit/CURRENT_STATE_REPORT.md` (audit of actual vs declared system state).
  - `docs/audit/GAP_ANALYSIS.md` (identification of GAP-01 through GAP-10).
- **Core Architecture & Specifications**:
  - `docs/architecture/CURRENT_ARCHITECTURE.md` (system topology, data flow, component layout).
  - `docs/FTD/FTD-v1.0.md` (normative specification across all 32 FTD chapters).
  - `docs/FTD/FTD-CHANGELOG.md` (FTD-specific change log).
  - `docs/database/DATABASE-SPEC.md` (22+ tables schema, indexes, constraints, migrations).
- **Frontend SPA Implementation (`src/`)**:
  - React 19, TypeScript 7, Vite 6, Tailwind CSS v4, Dexie 4.4 IndexedDB.
  - Role-specific cabinets with realistic business workflows.
  - 2-Step mutual loading reconciliation interface with mismatch blocking UI.
  - 3 delivery confirmation methods: e-button, canvas signature, and camera/photo with geo/time watermark.
  - Interactive Leaflet map with colored route pins and polyline visualization.
  - Piecework calculation and timesheet logging interface for factory workers.
  - Client-side offline sync queue engine with simulated network toggle.
