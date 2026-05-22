# StockMate — Complete Feature Report (Web · Desktop · Mobile)

Generated 2026-05-22. Covers the full feature set across all three platforms.

---

## 1. Platforms & Architecture

| Platform | Stack | Notes |
|---|---|---|
| **Web** | React 19 + Vite + Tailwind + Supabase | Primary app. Deployed on Vercel (`ledgrpro-prod.vercel.app`). |
| **Desktop** | Electron wrapper of the web build | Windows + macOS. Same React code as web → identical features. Adds: auto-update (GitHub Releases), offline-capable shell. |
| **Mobile** | Flutter + Riverpod + Supabase | Separate codebase (`mobile_app/`). Field-focused (sales, van, deliveries). Subset of web features. |
| **Backend** | Supabase — Postgres + RLS + RPCs + Auth + Storage | Multi-tenant. Project `lmviftlynuhopzmvaxeu`. 79 tables, all RLS-enabled (one gap: `item_units`). |

**Key principle:** Desktop = Web (Electron shell). Differences below are **Web/Desktop vs Mobile**.

---

## 2. Authentication & Tenancy

| Feature | Web/Desktop | Mobile |
|---|---|---|
| Email/password login | ✅ | ✅ |
| Google / SSO login | ✅ | — |
| Biometric unlock | — | ✅ (local_auth) |
| Multi-tenant workspaces (slug-based) | ✅ | ✅ |
| Tenant setup / onboarding flow | ✅ | ✅ |
| Super-admin portal (Nexus HQ) | ✅ | — |
| Session resilience (timeout-guarded init) | ✅ | ✅ |

RBAC roles (identical matrix on all platforms): **GLOBAL_ADMIN, OWNER, STAFF, SALES, INVENTORY, DRIVER, CUSTOM** (granular per-module `view`/`edit` permissions). Enforced in UI on all platforms; **Supabase RLS** is the real server-side boundary.

---

## 3. Core Business Modules

### Dashboard
- **Web/Desktop:** KPI cards, revenue trend chart, quick actions, activity feed.
- **Mobile:** Today's revenue, expenses, outstanding, products, low-stock; weekly sales chart; New Sale / Add Expense quick actions; pull-to-refresh + resume-refresh.

### Inventory
| | Web/Desktop | Mobile |
|---|---|---|
| Product list / search | ✅ | ✅ |
| Add / edit product (cost, sell price, tax, min-margin, image) | ✅ | ✅ |
| Categories, units | ✅ | ✅ |
| Stock levels (multi-location via `inventory_balances`) | ✅ | ✅ |
| Product batches (FIFO cost) | ✅ | partial |
| Low-stock alerts | ✅ | ✅ |

### Sales (POS)
| | Web/Desktop | Mobile |
|---|---|---|
| POS invoice builder (cart, client picker, payment) | ✅ `InvoiceBuilder` | ✅ `add_sale_screen` |
| Cash / UPI / Card / Bank / Credit | ✅ | ✅ |
| Pickup vs Delivery fulfillment | ✅ | ✅ |
| Barcode scan | ✅ | ✅ (mobile_scanner) |
| Sales history | ✅ | ✅ |
| Sales returns | ✅ | ✅ |
| Receipt print / share | ✅ | ✅ (pdf/printing) |

### Van Sales & Fleet / Logistics
| | Web/Desktop | Mobile |
|---|---|---|
| Vehicle CRUD | ✅ | ✅ |
| Load Van (warehouse→vehicle, premium picker) | ✅ `VanLoadBuilder` | ✅ `load_van_screen` |
| Van Sale (POS from van stock) | ✅ `VanSalePage` | ✅ `van_sale_screen` |
| Dispatch route (vehicle+driver+invoices) | ✅ | ✅ `dispatch_route_screen` |
| Driver route / stops | ✅ | ✅ `driver_route_screen` |
| Mark delivered (+ proof) / failed (+ reason) | ✅ | ✅ |
| Reconcile / end trip (odometer + cash) | ✅ | ✅ |
| Per-van stock view | ✅ Van Stock tab | ✅ `van_stock_screen` |
| All-vehicle stock overview | ✅ | ✅ `fleet_stock_screen` |
| Fleet map (last-known location) | ✅ `VehicleLiveMap` | ✅ `fleet_map_screen` |

> **Note:** A richer van-stock ledger backend exists (`van_trip_stock_log`, `vehicle_stock_movements`, `van_damage_records`, RPCs `record_van_damage`/`submit_van_eod`) but is **dormant** — see separate van-stock research brief.

### Invoices
- **Web/Desktop:** GST invoice list, create/convert, settlement, e-invoice IRN, print.
- **Mobile:** Invoice list + detail.

### Purchases & Suppliers
| | Web/Desktop | Mobile |
|---|---|---|
| Purchase entry / list | ✅ | ✅ |
| Purchase returns | ✅ | ✅ |
| Supplier CRUD | ✅ | ✅ |
| Supplier ledger | ✅ | ✅ (supplier detail) |

### Clients / CRM
| | Web/Desktop | Mobile |
|---|---|---|
| Client CRUD | ✅ | ✅ |
| Outstanding balance tracking | ✅ | ✅ |
| Client settlement / payments | ✅ | ✅ |
| Client statement / aging | ✅ (reports) | ✅ `client_aging`, `client_statement` |

### Expenses & Finance
- **Web/Desktop:** Expense entry, categories, finance views.
- **Mobile:** Finance screen, add expense.

### Day Book
- Daily cash ledger — opening/closing balance, transactions. **Web/Desktop + Mobile** (with history).

### Payroll & HR
- Employee CRUD, payroll runs. **Web/Desktop** full; **Mobile** HR screen + add employee.

### Orders / Pipeline
- Sales-order pipeline. **Web/Desktop** (`Orders`). Mobile: partial.

---

## 4. Reports

### Web / Desktop — 3 groups (~25 reports)
**Operational:** Business Report (unified), Inventory, Product Margins, Deliveries, Clients, Expenses, Client Statement, Bill Profit, Low Stock, Sales by Party, Party Profit, Category Profit, All Transactions, Item × Party.
**Accounting:** Balance Sheet, Trial Balance, General Ledger, Cash Flow, Customer Aging (AR), Supplier Aging (AP), Budget vs Actual, Year Comparison, Profit & Loss.
**Compliance (India GST):** GSTR-1, GSTR-3B.

### Mobile — 9 reports
Sales Summary, Inventory, Expenses, Purchases, AR Aging, AP Aging, GSTR-1, GSTR-3B, reports hub.

> **Gap:** Mobile lacks the full accounting suite (Balance Sheet, Trial Balance, General Ledger, Cash Flow, Budget vs Actual, Year Comparison) and the newer operational reports (Business Report, Client Statement, Bill Profit, Party/Category Profit, etc.).

---

## 5. Platform / Admin

| Feature | Web/Desktop | Mobile |
|---|---|---|
| Settings / workspace config | ✅ | ✅ |
| User / staff management + RBAC | ✅ | view via menu |
| Audit log | ✅ | — |
| Data tools — import / export (CSV/JSON) | ✅ | — |
| Super-admin portal (cross-tenant) | ✅ | — |
| Maintenance mode | ✅ | — |

---

## 6. Cross-Platform Parity Summary

**Mobile is missing vs Web/Desktop:**
- Full accounting report suite + newer operational reports
- Audit log, Data tools (import/export), Super-admin portal
- Orders/Pipeline (partial)
- Google/SSO login

**Mobile has that Web doesn't:** biometric unlock.

**Desktop = Web** (Electron) — plus auto-update + offline shell.

---

## 7. Infrastructure / Recent Work

- **Offline sync (Web)** — Phase 1a: IndexedDB cache + write outbox + 5-min sync engine + sync-status indicator. Foundation only; write paths not yet routed through the outbox.
- **Phase 0 DB** — `updated_at` + `deleted_at` + delta-sync index added to all 79 tables (sync-readiness).
- **Desktop** — Electron wrapper, app icon, GitHub-Releases auto-update, CI release workflow (Win + Mac).
- **RBAC** — full role matrix ported to mobile (nav, drawer, screens).

---

## 8. Tech Stack

- **Web:** React 19, Vite 7, Tailwind 4, react-router 7, recharts, zod, Supabase JS.
- **Desktop:** Electron 42, electron-builder, electron-updater.
- **Mobile:** Flutter, Riverpod, supabase_flutter, drift (local DB), geolocator, flutter_map, fl_chart, pdf/printing.
- **Backend:** Supabase Postgres, RLS, PL/pgSQL RPCs, Auth, Storage, Edge Functions.

---

## 9. Known Gaps / Improvement Areas

1. Van stock — dormant ledger system (see van-stock research brief).
2. Mobile report parity — missing accounting suite + new operational reports.
3. Offline — write paths not yet offline-queued (Phase 1b pending).
4. `item_units` table — RLS disabled (security gap).
5. Live map — last-known only; no real-time GPS pipeline.
6. Code signing — desktop installers unsigned.
