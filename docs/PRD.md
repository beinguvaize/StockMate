# LedgrPro — Product Requirements Document

**Version:** 1.0
**Status:** Draft
**Owner:** Uvaize
**Last updated:** 2026-05-29

---

## 1. Summary

LedgrPro is a multi-tenant inventory, sales, billing, and GST-compliant business management suite for Indian small and medium businesses (SMBs). It ships as three coordinated surfaces — a web app, an Electron desktop app, and a Flutter mobile app — backed by a single Supabase (Postgres + RLS + Edge Functions) tenancy.

The product targets retailers, wholesalers, distributors, and field-sales (van) operations that need GST-compliant invoicing, real-time stock control, and an offline-first cashier surface that keeps working when the internet does not.

---

## 2. Problem

Indian SMBs sit between two unsatisfying choices:

1. **Legacy desktop software** (Tally, Marg, BUSY) — accurate but offline-only, single-machine, no mobile, no real-time, no GSTR e-filing automation.
2. **Cloud-only SaaS** (Vyapar Web, Zoho Books, QuickBooks) — modern UI but breaks the moment connectivity drops, which is daily in Tier 2/3 cities, on delivery vans, or in basement shops.

Most SMBs also juggle **separate apps** for billing, inventory, expenses, payroll, GSTR-1/3B filing, and field sales. Data sits in silos. Stock counts drift. Reconciliations take days.

### What LedgrPro solves
- Single source of truth across web, desktop, mobile, and van-sale operations.
- **Offline-first** desktop and mobile: queue every write locally, sync when online.
- GST-native: CGST/SGST/IGST, HSN summaries, GSTR-1/3B export, IRN generation via NIC e-invoice API.
- FIFO costing with batch-level traceability and bill-wise profit reports.
- Multi-location inventory + vehicle stock + route dispatch.
- Tenancy + RBAC + plan-gated features so the same codebase serves Starter, Pro, and Enterprise tiers.

---

## 3. Target users

| Persona | Need | Surface |
|---|---|---|
| **Owner** | P&L, GSTR exports, multi-location view, staff control | Web + Desktop |
| **Cashier** | Fast POS, no internet hiccups, barcode scan, print invoice | Desktop (offline-first) |
| **Field salesperson / driver** | Van stock, route stops, on-the-go invoicing, mobile data only | Mobile |
| **Accountant** | GSTR-1, GSTR-3B, audit log, bill-wise profit, AP/AR aging | Web |
| **Global admin** (us) | Tenant provisioning, plan changes, suspension, impersonation | Web `/nexus-hq` |

---

## 4. Goals (next 6 months)

### Business goals
- **G1.** First 100 paying tenants on Professional plan (₹1,499/mo).
- **G2.** ≥ 80% monthly active rate among trial signups in days 1–60.
- **G3.** ≤ 5 min from sign-up to first invoice issued.
- **G4.** Sub-₹100 effective COGS per tenant per month (infra + support).

### Product goals
- **P1.** Cashier can ring a sale offline → see it on the owner's web dashboard within 60 s of reconnect.
- **P2.** No data loss when a desktop or mobile install is updated, force-quit, or runs out of battery.
- **P3.** GSTR-1 export accepted by GST portal first try, every time.
- **P4.** One-click recovery path when a sync queue is stuck (no ADB or admin SQL).

---

## 5. Non-goals

- Full accounting suite (T-accounts, double-entry, balance sheet at GAAP level). We do P&L + GST. Tally still does the rest.
- Payroll compliance for jurisdictions outside India.
- E-commerce storefront. We feed POS-style channels, not a public catalog.
- Manufacturing ERP (we have a Phase-2 lite version, not full BOM/MRP).

---

## 6. Architecture overview

```
                        ┌─────────────────────────┐
                        │  Supabase (Postgres)    │
                        │  - RLS multi-tenant     │
                        │  - PL/pgSQL RPCs        │
                        │  - Edge Functions       │
                        │  - Realtime publication │
                        └────────────┬────────────┘
                                     │
        ┌──────────────────┬─────────┼──────────────────┐
        ▼                  ▼         ▼                  ▼
  React + Vite       Electron 42   Flutter +        Edge worker
  BrowserRouter      HashRouter     Riverpod        - irn-worker
  (web)              + IDB outbox   + Drift outbox  - create-tenant
                     (offline)      (offline)       - dynamic-service
```

### Data layer
- **Postgres + RLS:** every table scoped by `tenant_id`. Policies enforced at row level so a misconfigured client can never leak data.
- **RPCs (PL/pgSQL):** `process_sale`, `process_purchase`, `process_sale_return`, `settle_supplier_payment`, etc. Sole write path for stock-mutating ops. Idempotent on primary key.
- **FIFO costing:** `product_batches` + `sale_batch_consumption` tables. `process_sale` consumes oldest batch first; `BillWiseProfitReport` reads `sale_batch_consumption` for accurate margin.
- **Realtime publication:** trimmed to 14 essential tables to keep WAL write IO inside free-tier limits.

### Surfaces
- **Web:** React 19 + Vite 7 + Tailwind 4 + react-router 7. Direct supabase calls. No offline.
- **Desktop:** Electron 42 wraps the web bundle. Adds IndexedDB outbox, 7-day offline grace, subscription gate, auto-updater (`electron-updater` → GitHub Releases), `HashRouter`.
- **Mobile:** Flutter + `supabase_flutter` + `drift` + `ota_update`. Outbox pattern w/ exponential backoff. Biometric unlock. APK auto-update via GitHub Releases.

### Offline contract (desktop + mobile, identical mental model)
1. First sign-in: **must** be online. Server validates credentials + subscription.
2. After success: cache a **bootstrap snapshot** (`userId`, `tenantId`, `subscription`, `validatedAt`).
3. While offline: writes go into a local outbox; reads fall back to a cached snapshot of each table.
4. Re-online: outbox auto-flushes (connectivity listener + interval). RPC idempotency guarantees safe replays.
5. Offline grace: 7 days. After that, the client is forced back to sign-in. Cached `subscription.status = SUSPENDED` also blocks.

---

## 7. Feature inventory

### 7.1 Core (all plans)
- Dashboard (KPIs: today sales, AR, AP, top SKUs).
- Inventory (products, categories, locations, stock movements, low-stock alerts).
- Sales (POS, credit sales, walk-in vs registered clients).
- GST invoice generation (CGST/SGST/IGST split, HSN summary, IRN via NIC).
- Clients & client payments.
- Expenses + day book.

### 7.2 Professional (₹1,499/mo)
- Purchases & suppliers + supplier payments.
- Vehicles & routes (van sale).
- Payroll (basic India compliance).
- GSTR-1 / GSTR-3B export.
- WAC + FIFO costing reports.
- Price lists & B2B credit terms.
- Up to 10 users.

### 7.3 Enterprise (₹3,499/mo)
- Multi-location inventory + inter-location transfers.
- User management with granular per-module permissions.
- Audit log.
- API access.
- White label (custom domain + brand mark).
- Unlimited users.

### 7.4 Cross-surface features
- **Offline-first** cashier on desktop + mobile.
- **Sync Diagnostics**: list pending/failed outbox jobs w/ `last_error`, Retry All, per-job Replay, Export JSON. Available on both desktop (`/<tenant>/sync-diagnostics`) and mobile (`Settings → Sync Diagnostics`).
- **Auto-update**: desktop via `electron-updater`, mobile via `ota_update`. Both poll `github.com/beinguvaize/StockMate/releases/latest`.
- **Biometric unlock** (mobile only — desktop relies on OS user account).
- **Trial:** 60-day free trial on every plan. No credit card required at signup.

---

## 8. User journeys

### 8.1 New tenant signup
1. Owner opens `/register` (desktop or web).
2. Email + password + name → `supabase.auth.signUp`.
3. If email confirmation enabled → "Check your inbox" prompt. Otherwise → `/welcome`.
4. Pick plan (Starter / Professional / Enterprise) → confirm 60-day trial.
5. Enter business legal name → `create-tenant` edge function (service role) provisions: `tenants` row, `business_profile` row, default `inventory_locations`, slug.
6. Redirect to `/<slug>/onboarding` → tax setup → first product → ready.

### 8.2 Cashier offline POS
1. Internet drops mid-shift.
2. Cashier rings sale → `placeSale` calls `process_sale` RPC.
3. Network fails → `isOfflineError` catches → `queueMutation` puts payload in IndexedDB outbox → `decrementCachedStock` updates local cache → UI shows sale in history immediately.
4. Internet returns → `OfflineContext` fires `syncNow()` → outbox flushes oldest-first → supabase RPC succeeds (idempotent on `p_id`) → row removed from outbox → pending count drops to 0.

### 8.3 Stuck queue recovery (no admin SQL needed)
1. Owner sees "3 PENDING" badge that won't clear.
2. Clicks Sync Status → **View Diagnostics**.
3. Sees each job, its `lastError`, payload.
4. Either fixes root cause server-side and clicks **Retry All**, or **Exports** the queue as JSON and forwards to support.

---

## 9. Non-functional requirements

| NFR | Target |
|---|---|
| Cashier POS round-trip | < 800 ms online; instant offline |
| Sync flush after reconnect | < 60 s for queues ≤ 100 ops |
| Desktop cold-start | < 4 s to first interactive |
| Cached read fallback | ≤ 3 s when supabase unreachable |
| RLS coverage | 100% of tenant-scoped tables |
| Test coverage | Critical RPCs (`process_sale`, `process_purchase`) — happy path + idempotency + tenant isolation |
| Supabase free-tier IO | Daily Disk IO budget < 80% peak |
| Auto-update lag | < 24 h after release publish |

---

## 10. Security & compliance

- **RLS-first** — no service role used in the web bundle. All write paths use RPCs that re-derive tenant from `auth.uid()`.
- **Edge functions** use `verify_jwt: true` where they touch tenant data; admin ops (tenant suspend, plan change) require `GLOBAL_ADMIN` role.
- **Desktop session security** — supabase JWT in `localStorage` today; safeStorage encryption planned (defense in depth).
- **Project URL guard** — at boot, the supabase client wipes its session blob if `VITE_SUPABASE_URL` changed since last launch (prevents JWT-for-prod being sent to dev or vice versa).
- **Subscription gate** at sign-in: any `SUSPENDED` / `CANCELLED` / `EXPIRED` tenant is signed back out immediately.
- **GST IRN** generated via NIC e-invoice API, stored in `invoices.irn`, signed QR stored alongside.
- **GDPR-style hard-delete** — soft-delete by default (`deleted_at`), hard-delete only via global admin.

---

## 11. Telemetry & success metrics

| Metric | Source | Why |
|---|---|---|
| **Daily active tenants** | `sales` rows / day | Engagement |
| **Time to first invoice** | `created_at` of first `invoices` row vs `tenants.created_at` | Onboarding friction |
| **Offline POS share** | `sales.source_app` × `created_at` lag vs server timestamp | Justifies offline work |
| **Sync queue size p95** | `outbox` count by tenant | Catches stuck queues |
| **Failed RPC rate** | edge-function 4xx logs | Stability |
| **Auto-update adoption** | version count in `tenants.metadata.last_seen_version` | Patch velocity |

---

## 12. Pricing & packaging

| Plan | ₹/month | Key gates |
|---|---|---|
| Starter | 499 | Dashboard, Inventory, POS, GST Invoices, Clients, Expenses, 500 invoices/mo, 2 users |
| Professional | 1,499 | Starter + Purchases & Suppliers, Vehicles & Routes, Payroll, GSTR Export, Price Lists, WAC Costing, 10 users |
| Enterprise | 3,499 | Pro + Multi-Location, User Management, Audit Log, API Access, White Label, unlimited users |

All plans include a **60-day free trial**, no card required. Trial badge shown in window title, plan picker, and post-signup banner — copy must stay consistent across all three surfaces.

---

## 13. Roadmap

### Now (in flight)
- Desktop Sync Diagnostics screen (shipped v1.3.1 — needs telemetry).
- Web/desktop offline write coverage (sales, expenses, clients, suppliers, purchases — shipped).
- Mobile biometric unlock (shipped v1.3.3).

### Next (Q3 2026)
- Apple Developer + Windows EV code signing → kill the "unknown developer" warning.
- Conflict resolution beyond last-write-wins on `outbox` replays (especially clients with overlapping edits).
- Sale returns UI on mobile.
- Item-wise tax report (Vyapar parity).
- Mobile report parity with web.

### Later (Q4 2026 +)
- Hetzner-hosted self-hosted Supabase option (cost: €4.51/mo vs Supabase Pro $25/mo).
- Multi-currency invoicing.
- WhatsApp invoice delivery via Twilio.
- Vendor portal (suppliers can submit POs).
- Loyalty / store credit module.
- **Razorpay UPI auto-confirmation (Approach 2)** — trigger when tenant count is high enough to justify gateway fees.
  Settings → Connect Razorpay → enter key_id + key_secret. New edge function `razorpay-create-qr` generates dynamic QR
  per sale; webhook `razorpay-webhook` flips `paymentStatus = PAID` automatically and emits a Supabase realtime event so
  the cashier UI advances with no human reconciliation. Parked while we are in dev phase; revisit once paying customers > ~50.

---

## 14. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Supabase free-tier IO budget exhausted | DB read errors mid-shift | Trimmed realtime publication; planning Hetzner migration if scale demands |
| Offline cache drift on multi-device tenant | Owner web shows different stock than cashier desktop | Local stock decrement is best-effort; reconciles on next sync |
| Stale-session JWT after URL switch (dev↔prod) | 401 on edge functions | Project URL guard in supabase init (shipped v1.3.4) |
| Sideloaded APK without "Install unknown apps" perm | Auto-update appears to silently fail | In-app hint added to update dialog (shipped mobile v1.3.4) |
| NIC e-invoice API rate limits | IRN generation lag | `irn-worker` edge function with retry + audit table |

---

## 15. Open questions

1. **Trial length consistency** — 3-month vs 60-day copy still in conflict (Login CTA vs plan picker). Pick one, replace everywhere.
2. **Web offline scope** — currently web is online-only. Do we want Service Worker–backed PWA offline parity, or is "use the desktop app for offline" the position?
3. **Hard-delete side effects audit** — when a client is soft-deleted, their existing sales still link back; UI falls back to "Walk-in" silently. Should we surface a "Deleted: SOUMYA STORE" label instead?
4. **Subscription billing rails** — Razorpay vs Stripe IN. Decision blocks paid conversions.
5. **GST e-way bill** — in scope for Pro, or Enterprise-only?

---

## 16. References

- Auto-update flow: `mobile_app/lib/core/update/auto_updater.dart`, `electron/main.cjs`
- Outbox: `src/lib/offline/outbox.js`, `mobile_app/lib/core/database/sync_service.dart`
- Offline auth: `src/lib/offline/authGuard.js`
- Edge functions: `supabase/functions/{create-tenant,dynamic-service,irn-worker}/index.ts`
- Tenancy + plan gates: `src/lib/tenancy.js`
