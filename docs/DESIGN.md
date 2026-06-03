# StockMate / LedgrPro — Design System

The single source of truth for the app's look & feel. **Amber + mono**, light, professional, enterprise-grade. Web · Desktop (Electron) · Mobile (Flutter) should all read as one product.

---

## 1. Brand

- **Accent:** Amber. Warm, confident, financial.
- **Tone:** clean, dense, professional. Numbers are first-class citizens.
- **Feel:** a modern ledger — generous whitespace, hairline borders, monospace figures, one strong accent.

---

## 2. Color

### 2.1 Brand accent (token-driven)
The accent is a CSS token so the whole app re-themes from one place. Default = amber.

```css
/* src/index.css — default @theme / :root */
--color-accent-signature:        #D97706;  /* amber-600 — primary accent  */
--color-accent-signature-hover:  #B45309;  /* amber-700 — hover/active     */
--color-button-text:             #FFFFFF;  /* text on accent surfaces      */
```

Consume via the `accent-signature` Tailwind color (`bg-accent-signature`, `text-accent-signature`, `border-accent-signature`, `ring-accent-signature`) — **never hardcode `#D97706`** in components. Hardcoded indigo/violet/blue have all been migrated to amber; keep it that way.

### 2.2 Amber scale (utility, for fixed-amber surfaces)
Use Tailwind `amber-*` for surfaces that should stay amber regardless of theme (POS, Expenses, Inventory accents):

| Token | Hex | Use |
|---|---|---|
| `amber-400` | `#FBBF24` | currency symbol `₹`, muted accent marks |
| `amber-500` | `#F59E0B` | share bars, dots, focus ring tint |
| `amber-600` | `#D97706` | **primary** — buttons, active chips/tabs, links |
| `amber-700` | `#B45309` | hover, dark-on-amber text |
| `amber-50` / `amber-100` | tints | chip backgrounds, badge fills, hover rows |

Row hover on amber surfaces: `hover:bg-amber-500/[0.04]`.

### 2.3 Ink & surface
| Token | Hex | Use |
|---|---|---|
| `--color-ink-primary` | `#1E1B2E` | headings, primary text, dark cards |
| `--color-canvas` | `#F8F9FC` | page background |
| `--color-surface` / white | `#FFFFFF` | cards, panels, tables |
| gray-400 | — | labels, muted meta |
| gray-300 | — | placeholders, separators |
| Borders | `border-black/[0.06]`–`/10` | hairline dividers |

### 2.4 Semantic (status only — NOT decoration)
Color carries **meaning** here, never used for variety:

| Meaning | Color | Examples |
|---|---|---|
| Positive / paid / in-stock | `emerald-*` | PAID badge, receipts, "Balanced" |
| Warning / low / partial | `amber-*` | low stock, PARTIAL, discount |
| Negative / out / overdue | `red-` / `rose-*` | out of stock, PENDING, deductions |
| Neutral | `gray-*` / `stone-*` | inactive, cash, defaults |

> **Rule:** no "rainbow" category colors. Categories are neutral gray; only status uses color.

---

## 3. Typography

Three families, each with a job:

| Family | Class | Use |
|---|---|---|
| **Sora** | `font-sora` / `.font-display` | page titles, headings, KPI labels |
| **Inter** | default body | UI text, labels, descriptions |
| **JetBrains Mono** | `font-mono` | **all numbers** — amounts, dates, counts, codes, SKUs |

Loaded in `src/index.css`. 

> **Rule:** every figure (money, qty, date, %, code) is `font-mono tabular-nums`. This is the signature of the system — monospace numerals line up in columns.

Title pattern: `Heading` + amber period:
```jsx
<h1 className="font-sora font-black text-2xl text-ink-primary">Inventory<span className="text-amber-500">.</span></h1>
```

Mono command eyebrow (over titles / table headers):
```jsx
<span className="font-mono text-[10px] font-bold uppercase tracking-widest text-amber-600">$ inventory --all</span>
```

---

## 4. Shape, spacing, elevation

| Token | Value | Use |
|---|---|---|
| Radius — control | `rounded-xl` (12px) | buttons, inputs, small cards |
| Radius — panel | `rounded-2xl` (16px) | cards, tables, toolbars |
| Radius — pill | `rounded-pill` / `rounded-full` | chips, badges, period buttons |
| Shadow — card | `shadow-sm` | default panels |
| Shadow — accent btn | `shadow-md shadow-amber-600/25` | primary buttons |
| Hairline | `border border-black/[0.06]` | every panel/divider |

Density: tables `py-2.5`–`py-3`; cards `p-4`–`p-5`. Tight but breathable.

---

## 5. Components

### 5.1 Buttons
```jsx
/* Primary (amber) */
<button className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 shadow-md shadow-amber-600/25 transition-colors">…</button>

/* Secondary (white, hairline) */
<button className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white border border-black/[0.08] text-ink-primary text-xs font-bold hover:bg-black/[0.03] hover:border-black/15 transition-colors">…</button>
```
Shared `<Button>` has an `amber` variant. Icons left, muted gray on secondaries.

### 5.2 KPI stat strip
The standard metric row across pages: one bordered container, **hairline-divided cells** (not floating fat cards).
```jsx
<div className="grid grid-cols-2 lg:grid-cols-6 gap-px bg-black/[0.07] rounded-2xl overflow-hidden border border-black/[0.07] shadow-sm">
  <div className="bg-white px-4 py-3.5 flex flex-col gap-1.5 hover:bg-amber-500/[0.03]">
    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400"><Icon/>Label</div>
    <div className="font-mono text-xl font-bold tabular-nums text-ink-primary">
      <span className="text-amber-400 text-sm mr-0.5">₹</span>12,345
    </div>
  </div>
</div>
```
Money cells: amber `₹` + mono. Warn cells turn `amber-600` (low) / `red-600` (critical). **No big faded corner icons.**

### 5.3 Tables
- Header: `font-mono text-[10px] font-bold uppercase tracking-widest text-gray-400`, hairline bottom border, sticky if scrollable.
- Rows: `py-2.5`–`3`, `hover:bg-amber-500/[0.04]`, divider `border-black/[0.04]`.
- Money/qty cells: `font-mono tabular-nums`, amber `₹`.
- Optional per-row **share bar** (amber) under amounts.
- Description column: `max-w-0 w-full` + `truncate`; right columns `whitespace-nowrap` so they never get pushed off.
- Category-grouped tables: section header row (`bg-black/[0.025]`, count + subtotal), indented rows, group subtotal, section total.
- Row actions on hover: `opacity-0 group-hover:opacity-100`, icon buttons (adjust / view / delete) with amber/neutral/red hovers.

### 5.4 Toolbar (filter panel)
One panel: search + period segmented + date range, divider, category chips.
```jsx
<div className="rounded-2xl border border-black/8 bg-white shadow-sm p-3.5">
  <div className="flex items-center justify-between gap-3 flex-wrap">
    {/* search: rounded-xl bg-black/[0.03], amber ⌕ */}
    {/* period segmented: p-1 rounded-xl bg-black/[0.04]; active = bg-amber-600 text-white */}
    {/* date range chip / inputs (font-mono) */}
  </div>
  <div className="mt-3 pt-3 border-t border-black/[0.06]">{/* Category chips */}</div>
</div>
```
Period presets everywhere: **Today / This Week / This Month / Quarter / This Year / Custom**.

### 5.5 Chips & badges
- Filter chip: `rounded-full border`, active `bg-amber-600 text-white border-amber-600`, idle `bg-white border-black/10 text-gray-500`.
- Status badge: pill, semantic bg/text (emerald/amber/rose/gray) + uppercase `text-[9px]–[10px]` label.

### 5.6 Modals
- `.glass-modal` / `.modal-overlay`. Header: icon tile (`bg-amber-500/10 text-amber-500`) + Sora title + muted subtitle + close.
- Inputs: `rounded-xl border-black/10`, focus `border-amber-400 ring-2 ring-amber-500/15`.
- Hero amount (POS/expense): `font-mono text-4xl`, amber `₹`.
- Primary action: amber button, full-width footer.
- **All modal accents inherit the token** — they go amber automatically.

### 5.7 Navigation
Existing horizontal top nav kept. Active pill = amber (`bg-amber-600 text-white`), idle gray. Logo tile amber, PRO badge `bg-amber-100 text-amber-700`, avatar `bg-amber-100 text-amber-700`.

### 5.8 Charts
Series color = amber `#D97706` (primary), `#10B981` (compare/positive), `#EF4444` (negative). Donut palette = amber tints. Gridlines `rgba(0,0,0,0.05)`, axis ticks gray. No indigo/blue series.

### 5.9 Reports
- **`ReportFrame`** — title + mono subtitle (period) + **Export menu** (Excel `.xlsx` / letterhead PDF / CSV). Wrap any report.
- **`PremiumReportView`** — rich shell (KPIs + chart + table + tabs); export menu built in.
- **`StatementTable`** — classical financial statements (Balance Sheet, P&L): grouped sections with accent bar, indented lines, group subtotals, section totals, grand total. Two-column Particulars · Amount (mono).
- **Export** (`src/lib/reportExport.js`): `exportExcel` (xlsx), `printReport` (A4 letterhead PDF — company name/GSTIN/address, generated-on, footer), `exportToCSV`.

---

## 6. Patterns & rules

1. **One accent.** Amber via token. Never hardcode the accent hex; never reintroduce indigo/violet/blue chrome.
2. **Numbers are mono.** Every figure: `font-mono tabular-nums`. Amber `₹`.
3. **Color = meaning.** Status only (emerald/amber/rose/gray). Categories stay neutral.
4. **Hairlines, not heavy borders.** `border-black/[0.06]`.
5. **KPI = connected strip**, not fat cards with faded icons.
6. **Period filter** on every data view: Today/Week/Month/Quarter/Year/Custom.
7. **Tables don't overflow:** description `max-w-0 w-full truncate`, numeric cols `whitespace-nowrap`.
8. **Dev-first.** Build on `develop`, review, then merge `main`. Migrations applied dev → prod (after confirm).
9. **`.no-print`** on chrome/controls so PDF/print output stays clean.

---

## 7. Theme switching

Per-tenant theme lives in `businessProfile.theme`; default = amber. Other named themes (`signature`, `ocean`, `rose`, `slate`, `dark`) remain selectable in Settings via `useTheme` / `ThemePicker`, applied through `[data-theme]` on `<html>`. Token-based components re-theme automatically; hardcoded `amber-*` utility surfaces stay amber.

---

## 8. Files

| Concern | Path |
|---|---|
| Tokens + theme blocks | `src/index.css` |
| Theme switch | `src/hooks/useTheme.js`, `src/components/ThemePicker.jsx` |
| Buttons | `src/shared/Button.jsx` |
| Report frame / export | `src/components/reports/ReportFrame.jsx`, `src/lib/reportExport.js` |
| Statement renderer | `src/components/reports/StatementTable.jsx` |
| Reference pages (theme exemplars) | `src/pages/Expenses.jsx`, `src/pages/inventory/`, `src/pages/Dashboard.jsx`, `src/pages/sales/components/InvoiceBuilder.jsx` |
