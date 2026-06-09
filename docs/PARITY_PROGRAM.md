# Vyapar-Parity Program — Orchestrator Plan

Map-to-existing mode. Single sources of truth (do NOT recreate):
- **SPEC** → `docs/PLATFORM.md`
- **ARCHITECTURE** → `src/lib/tenancy.js` (PLANS), `src/lib/verticals.js` (modules/terms), Supabase schema + RLS helpers `current_tenant_id()` / `is_global_admin()`
- **DESIGN_SYSTEM** → Tailwind `@theme` tokens (amber `#D97706`, Manrope + JetBrains Mono, mono `tabular-nums` for figures, rounded-xl/2xl, `modal-overlay`/`glass-modal`, segmented pills)

Subagent roles map to spawnable types: db/backend/architect/reviewer/test → `general-purpose`; designer/ux-flow/Plan → `Plan`; broad reads → `Explore`.

## Status of the 7
| # | Feature | State |
|---|---|---|
| 1 | WhatsApp share | ✅ shipped |
| 2 | Estimates | ✅ shipped |
| 6 | Payment reminders (Twilio) | ✅ shipped — BLOCKED on Twilio secrets |
| 3 | Loyalty points | ⬜ unblocked — build now |
| 4 | e-invoice (IRN) | ⬜ BLOCKED on GSP creds (cols + `enqueueIrn` exist) |
| 5 | e-way bill | ⬜ BLOCKED on GSP creds (depends on #4 auth layer) |
| 7 | Online store | ⬜ unblocked (net-new public surface) |

## SPEC deltas

### #3 Loyalty
- Accrue points on PAID sale; redeem as checkout discount. Per-tenant earn rate + redeem value. Off by default.

### #4 e-invoice (IRN)
- For B2B GST invoices, register IRN with IRP via GSP → store IRN, signed QR, ack no/date. Show status + QR on invoice/print. Cancel within window.

### #5 e-way bill
- Generate EWB for goods movement ≥ threshold. Capture transporter + vehicle + distance. Store EWB no + validity.

### #7 Online store
- Per-tenant public storefront (`/store/:slug`): catalog (available products), product detail, cart, checkout (name/phone/address) → creates an online order. Merchant sees orders, converts to sale. No login for shopper.

## ARCHITECTURE contracts (interfaces only)

### Loyalty
- DB: `clients.loyalty_points numeric default 0`; `business_profile`: `loyalty_enabled bool`, `loyalty_earn_per_100 numeric` (pts per ₹100 spent), `loyalty_redeem_value numeric` (₹ per pt).
- Lib `loyalty.js`: `earnPoints(total, cfg) -> int`; `redeemToAmount(pts, cfg) -> ₹`; `maxRedeemable(pts, total, cfg) -> ₹`.
- Accrue: client-side after successful `addSale` → bump `clients.loyalty_points`. Redeem: pass discount into existing sale discount path (no RPC change).

### e-invoice / e-way (shared GSP layer)
- Secrets (Supabase): `GSP_BASE_URL`, `GSP_API_KEY`, `GSP_GSTIN`, `GSP_USERNAME`, `GSP_PASSWORD`.
- Edge fn `einvoice-generate` `{ invoice_id }` → `{ irn, signed_qr, ack_no, ack_date }` (writes invoices.*; verify_jwt).
- Edge fn `eway-generate` `{ invoice_id, transport }` → `{ eway_no, eway_date, valid_until }`.
- DB add to invoices: `eway_no text, eway_date text, eway_valid_until text, transporter_id text, transport_mode text, vehicle_no text, distance_km int`.

### Online store
- DB: `store_settings(tenant_id pk, slug unique, enabled bool, theme jsonb, about text, whatsapp text)`; `online_orders(id, tenant_id, slug, customer_name, customer_phone, address, items jsonb, total, status, created_at)`.
- Public RLS: `store_settings` + a products **view** selectable by anon WHERE `enabled` and `is_available` (no tenant leak beyond catalog fields). `online_orders` anon INSERT only (no select).
- Edge fn `store-order` (public, no JWT) validates + inserts order → returns order id. Merchant UI lists via tenant RLS; "Convert to sale" reuses Estimates→POS handoff pattern (sessionStorage → POS cart).

## DESIGN deltas (token reuse — designer defines ONCE)
- Storefront = public theme: same amber brand, Manrope, but lighter chrome. New components: `ProductCard`, `CartDrawer`, `CheckoutForm`, `OrderConfirm`. All states (default/hover/focus/disabled/loading/empty/error) declared before scaling.
- e-invoice: status chip (`PENDING`/`GENERATED`/`CANCELLED`), QR block. Loyalty: points badge on client card, redeem field in POS.

## UX flows (screens + states)
- Loyalty: POS checkout → "Redeem N pts (−₹X)" toggle; client card shows balance; Settings → loyalty card (enable + rates). Empty: 0 pts hides redeem.
- e-invoice: invoice row → "Generate e-invoice" (PENDING→spinner→GENERATED chip + QR) ; error toast on GSP fail. Print includes IRN+QR.
- e-way: invoice → "e-Way bill" form (transport) → number + validity. 
- Store (shopper): catalog → product → add to cart → cart drawer → checkout form → order confirm. Empty cart, out-of-stock, submit-loading, success/error.
- Store (merchant): Orders list → order detail → Convert to sale / mark fulfilled.

## Task DAG (delegation)

```
[D0 designer: storefront tokens+component specs] ─┐         (once)
                                                  v
TRACK A (unblocked, parallel):
  A1 db: loyalty cols+settings ──> A2 backend: loyalty.js lib ──> A3 ui-builder: POS redeem + client badge + settings card ──> A4 reviewer
TRACK B (unblocked, parallel):
  B1 db: store_settings+online_orders+public RLS/view ──> B2 backend: store-order edge fn ──> B3 ui-builder(storefront, needs D0): catalog/product/cart/checkout ──> B4 ux-flow verify ──> B5 a11y-review ──> B6 reviewer
TRACK C (BLOCKED on GSP creds):
  C1 architect: GSP contract ──> C2 db: eway cols ──> C3 backend: einvoice-generate + eway-generate edge fns ──> C4 ui-builder: gen buttons + chips + QR ──> C5 reviewer
```

Parallelizable: A and B and D0 now. C waits on GSP creds (+ #6 waits on Twilio secrets).

## Integrity gates (every task)
contract/spec match · inputs validated + loading/empty/error states · tokens only (no hardcoded color/spacing) · a11y (contrast/keyboard/focus/labels) · zero secret exposure (creds only in Supabase secrets) · build passes crash-guard.
