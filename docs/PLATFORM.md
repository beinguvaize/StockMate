# LedgrPro — Platform Architecture & Multi-Vertical Plan

> Status: PLAN (no implementation yet). This is the locked decision record we
> build against so we don't re-debate or re-architect. India-first.

---

## 0. Core decision

**One platform — one backend, one core, one billing, one Nexus.** Verticals
(Retail → Restaurant → Professional Services → …) are **modules that plug into
the shared core**, not separate products. Only the *frontend experience* is
split where UX genuinely diverges (e.g. restaurant table POS, kitchen display).

Why: each new vertical reuses ~70% of what already exists (clients, invoicing +
GST, payments/dues ledger, expenses, reports, BOM/recipe, multi-branch). A
separate product would duplicate the ledger, billing, auth and Nexus — double
maintenance, drift, double bugs. Industry precedent: Square / Toast / Petpooja
= one platform, vertical-tuned frontends.

**Never duplicate:** database, billing/subscription, auth/roles/tenant, Nexus
HQ, finance/ledger.

**May split (frontend only, same backend):** restaurant UI bundle, KDS
(kitchen display) app.

Full-separate product is justified ONLY if: totally different data model +
different team/release cadence + different brand/pricing. None true today → no.

---

## 1. Platform core (build once, rarely touched)

The "build it right once" layer. Get this solid → verticals are additions, not
migrations.

1. **Tenant + identity** — `business_type`, module flags, roles/permissions,
   tenant context. (Mostly exists.)
2. **Terminology layer** — one central map, swap labels per vertical
   (Product→Dish→Service, Inventory→Menu, Customer→Guest). Build once → never
   rename in code again.
3. **Shared spine** — clients, invoicing + GST, payments/dues ledger, expenses,
   reports, multi-branch. (Exists — the moat.)
4. **Billing/subscription core** — Razorpay subscriptions + webhooks + access
   gating + Nexus controls. Every vertical billed the same. (See §4.)
5. **Extensibility** — `custom_fields` (exists), per-module tables, jsonb config.
   New module = new table + nav flag, not a schema rewrite.
6. **Scaling baseline** — `tenant_id` indexes, pooled connections. (See §6.)

### 1.1 Vertical model
- `tenant.business_type` enum: `RETAIL | RESTAURANT | SERVICES` (extensible).
- `tenant.modules` jsonb feature flags, e.g.
  `{ pos:true, tables:false, kot:false, modifiers:false, recipe_deduct:false,
     appointments:false, channels:false }`.
  Nav + routes + POS mode gate off this.
- Terminology map keyed by `business_type`.
- Existing tenants → backfill `business_type = RETAIL` (one safe migration).

### 1.2 Industry vs sales-mode (keep separate axes)
- **Industry** (what they are): Retail · Restaurant · Services — chosen at register.
- **Sales mode** (how they sell): POS counter · B2B credit · B2C · dine-in ·
  takeaway · delivery — toggles inside, not an industry.
- POS is a *capability/mode*, not a vertical. Same POS component, `mode` switch.

---

## 2. Registration / onboarding

1. Step 1: pick **industry** (3 cards + icons).
2. Step 2: plan (ties to billing).
3. Onboarding seeds: modules + nav + terminology + sample data for that type.
4. Store `business_type`; provision workspace (current `/welcome` flow).

---

## 3. Restaurant vertical (first expansion)

Closest fit to current app. Reuses POS (discount, hold/park, fulfillment),
invoice+GST as the bill, dues ledger as table tabs, and **Manufacturing BOM as
recipe costing** (already built).

### 3.1 Gap → build (cheap → heavy, each ships usable)
| Phase | Feature | Notes |
|---|---|---|
| R1 | **Menu** | product→dish semantics, veg flag, course/category, station. Light. |
| R2 | **Table POS** | floor/table grid, running tab per table (extend park/hold to be table-keyed), `DINE_IN` type. |
| R3 | **KOT** | kitchen order ticket, print/screen, by station. |
| R4 | **Modifiers** | add-ons/variations ("no onion", size) → flow into KOT + bill. |
| R5 | **Recipe deduction** | wire existing BOM → auto-deduct ingredients on sale + food-cost reports. |
| R6 | **Polish** | split/merge bill, service charge, table transfer. |
| R7+ | **Aggregator channels** | see §5. |

### 3.2 POS rule
Do NOT fork POS. Add `mode` (retail vs table) to the same component, gated by
`business_type`. Promote restaurant to its own frontend bundle + a **KDS app**
(same backend) only if/when table UX outgrows the shared shell.

---

## 4. Billing / subscription (recurring, India)

Additive subsystem. **Do not build a billing engine or store card data.**

- **Gateway: Razorpay** (India-native recurring: UPI Autopay + card e-mandate/
  eNACH, auto-retry, dunning, RBI-compliant pre-debit notices). Stripe is
  hampered by RBI e-mandate rules; Cashfree = backup.
- **PCI/RBI:** never store card numbers. Gateway tokenizes. Show only
  `•••• last4 + brand`. Method updates happen on **gateway-hosted UI**, never
  our form.

### 4.1 Schema (mirror — gateway is source of truth)
`subscriptions(tenant_id, gateway_sub_id, plan, status, current_period_end,
pm_last4, pm_brand, ...)`
`status: trial | active | past_due | cancelled`

### 4.2 Components
1. Razorpay plans + Subscriptions; mandate captured at trial-end.
2. **Webhook = Supabase Edge Function** (verify signature) → update mirror on
   every event (charged / failed / cancelled).
3. **Access gating** — middleware reads `subscription.status`:
   `past_due` → grace + in-app banner; expired → read-only/lock.
4. **Billing tab (My Account)** — plan, next charge date + amount, invoice
   history, payment method (last4), update method (→ gateway), upgrade/cancel.
5. **Nexus HQ billing view** — all tenants + status, **failed/overdue list**,
   manual actions: retry, extend trial, comp/discount, suspend, reactivate.
6. **GST** — issue 18% GST invoice for the subscription fee (reuse existing
   invoice+GST engine).

### 4.3 Flow
trial (30d) → ends → require mandate → auto-debit each cycle → webhook syncs
status → declined → gateway auto-retries → final fail → `past_due` → banner +
grace → unpaid → restrict. Nexus sees + manages all.

---

## 5. Delivery aggregator channels (Restaurant R7+)

### 5.1 Geography reality
- **Uber Eats: exited India (2020). DoorDash: US/Canada only.**
- **India = Swiggy + Zomato** (+ ONDC emerging).
- Build generic **channel layer** now for Swiggy/Zomato; Uber Eats/DoorDash plug
  in later *if* US expansion. Don't hardcode per-aggregator.

### 5.2 Approach — middleware, not direct
- Partner APIs are gated (per-platform onboarding + legal). Each differs.
- Use **order-aggregation middleware** (UrbanPiper / Petpooja / Rista — India;
  Olo/Otter — US): one integration → all channels normalized + they handle
  partner approvals.

### 5.3 Components
1. `channels` — SWIGGY, ZOMATO, OWN (+ future). Per-tenant enable + creds.
2. **Menu sync** — dish→channel-item map (price, availability, modifiers) + 86'ing.
3. **Order ingestion** — channel order → webhook (edge fn) → sale `channel=…` →
   fire KOT → accept/reject → push status.
4. **Order-type dimension** — extend fulfillment:
   `DINE_IN | TAKEAWAY | DELIVERY_OWN | SWIGGY | ZOMATO`.
5. **Reconciliation** — commission + payouts vs orders → finance report (reuse
   ledger). High value to restaurants.

### 5.4 Dependencies (non-code, start early in parallel)
- Middleware vendor selection + contract, OR direct Swiggy/Zomato POS-partner
  onboarding (slower). Weeks of business/legal.

---

## 6. Scaling

Managed stack — we don't run load balancers ourselves.

- **Frontend (Vercel):** static on global edge CDN — auto-scaled, no action.
- **Backend (Supabase Postgres):** single primary = the real bottleneck.
  Levers (cheap → big):
  1. **Connection pooling** — supabase-js → PostgREST (pooled). Direct
     connections (migrations/edge fns) use Supavisor `:6543`.
  2. **Indexes** — every tenant-scoped query indexed on `tenant_id`. Audit done
     (see §6.1).
  3. **Vertical scale** — bump Supabase compute tier.
  4. **Read replicas** (paid) — route reads (reports/lists) to replica.
  5. **Cache** — materialized views for heavy reports; client cache (exists).
  6. **Shard tenants across DBs** — far future, 10k+ tenants, rarely needed.
- **Realtime:** subscribe only to what needs live updates. Offline outbox
  already batches writes → fewer hits.
- **Don't pre-optimize:** pooler + indexes now; replicas only when reads dominate.

### 6.1 Index audit (dev, run 2026-06)
~55 hot tables correctly indexed on `tenant_id` (sales, invoices, products,
clients, gl_*, expenses, purchases…). **10 transactional tables missing a
`tenant_id` index** — add before scale (CONCURRENTLY, safe):
`linked_payments, loan_transactions, loyalty_transactions, stock_transfers,
warehouse_stock, client_notes, attachments, service_reminders,
van_damage_records, vehicle_locations`.
(Plus ~7 config/small tables — low priority.)

---

## 7. Roadmap (stages, each ships usable)

**Stage A — Foundation (build once):**
1. `business_type` + `modules` + terminology layer
2. Billing core (Razorpay subs + webhook + gating + Nexus billing) + GST invoice
3. Scaling baseline (apply missing `tenant_id` indexes)

**Stage B — Restaurant vertical:** R1 Menu → R2 Table POS → R3 KOT →
R4 Modifiers → R5 Recipe-deduct → R6 Polish → R7 Aggregator channels.

**Stage C — Professional Services:** appointments + service catalog (no stock).

**Stage D — future verticals / US channels:** cheap, same pattern.

Principle: **foundation complete → verticals incremental.** Don't build every
feature before launch (build-forever trap); build the *core* right, ship
verticals one at a time.

---

## 8. Risks / guardrails
- **Scope creep** — don't build R3–R7 before R1–R2 live with a real restaurant.
- **POS fork** — never; one component, `mode` flag.
- **Sparse columns** — vertical data in own tables + jsonb, not wide columns on
  `products`/`sales`.
- **Terminology debt** — do the terminology layer in Stage A or retrofitting hurts.
- **Mobile/desktop parity** — each module = 2–3 builds (web/Electron/Flutter).
- **Migration safety** — backfill existing tenants → `RETAIL` carefully.
- **Billing security** — raw card/UPI creds never touch our app; gateway-hosted only.
