// The card every client draws without per-question code, built from the figures
// and shared/ai_chat/strings.json. Labels and sentences arrive in the chosen
// language; clients only format a value for its `kind`, and never compute one.
//
// Order on screen: hero, AI text, rows, table, rows_after, note, footnote.
// `headline` stays for clients built against the first contract.

export type Kind = "money" | "count" | "qty" | "percent" | "date" | "days" | "text";
type Row = { label: string; value: unknown; kind: Kind; tone?: "total" };

const inr = (n: number) =>
  `${n < 0 ? "-" : ""}₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const count = (n: number) => Number(n ?? 0).toLocaleString("en-IN");
const fill = (t: string, vars: Record<string, unknown>) =>
  t.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
const parts = (iso: string) => String(iso).slice(0, 10).split("-").map(Number);

/**
 * May the gst_collected card name the gaps with GSTR-3B and their cause? Only
 * when they are what rounding can explain: the check read the same GST as the
 * card, the GST gap is at most 2 paise a bill, and unrecorded rounding at most
 * 50 paise a bill. Returns the checks that failed; empty means all hold.
 */
export function gstScreenChecks(f: Record<string, any>): string[] {
  const failed: string[] = [];
  const bills = Number(f.gstr3b_bill_count ?? 0);
  const books = Number(f.gstr3b_books_gst);
  if (!Number.isFinite(books) || Math.abs(books - Number(f.output_gst)) > 0.01) failed.push("books_gst_matches_card");
  if (!(Math.abs(Number(f.gstr3b_gst) - books) <= 0.02 * bills + 1e-9)) failed.push("screen_gap_within_rounding");
  if (!(Math.abs(Number(f.bill_rounding ?? 0)) <= 0.5 * bills + 1e-9)) failed.push("bill_rounding_within_limit");
  return failed;
}

/**
 * One row per staff member, as the Attendance tab lists them: a daily-wage row
 * has its Days, wage earned, paid and still due; a monthly row its fixed salary
 * and what was paid, with no days and nothing due (the tab shows none).
 */
function staffTable(staff: any[], L: Record<string, string>, col: (k: string, kind: Kind, right?: boolean) => any) {
  if (!staff?.length) return null;
  return {
    columns: [col("staff", "text", false), col("staff_days", "text"), col("staff_earned_or_salary", "money"), col("staff_paid", "money"), col("staff_due", "money")],
    rows: staff.map((s: any) => s.pay_type === "MONTHLY"
      ? [s.name, L.staff_monthly, s.salary, s.paid, null]
      : [s.name, count(Number(s.days)), s.earned, s.paid, s.due]),
  };
}

export function buildCard(id: string, f: Record<string, any>, strings: any, empty = false) {
  const L = strings.card as Record<string, string>;
  const H = strings.hero[id] ?? {};
  const day = (iso: string) => { const [, m, d] = parts(iso); return `${d} ${strings.months_short[m - 1]}`; };
  // "16 to 18 Nov": the first date drops a month the second one repeats.
  const lead = (a: string, b: string) => { const [, m1, d1] = parts(a); const [, m2] = parts(b); return m1 === m2 ? String(d1) : day(a); };
  const span = (a: string, b: string) => {
    const [, m1, d1] = parts(a); const [, m2] = parts(b);
    return m1 === m2 ? `${d1}–${day(b)}` : `${day(a)}–${day(b)}`;
  };
  const row = (key: string, value: unknown, kind: Kind, tone?: "total"): Row =>
    ({ label: L[key], value, kind, ...(tone ? { tone } : {}) });
  const method = (m: string) => strings.methods[m] ?? m;
  const change = (pct: number) => `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}%`;
  const compare = (vars: Record<string, unknown>) =>
    fill(f.change_pct === null || f.change_pct === undefined ? H.plain : H.compare,
      { ...vars, change: f.change_pct === null || f.change_pct === undefined ? "" : change(f.change_pct) });
  const qty = (n: unknown, unit?: string | null) => `${count(Number(n))}${unit ? ` ${unit}` : ""}`;
  const col = (key: string, kind: Kind, right = true) => ({ label: L[key], kind, align: right ? "right" : "left" });
  const foot = (vars: Record<string, unknown> = {}) => fill(strings.footnotes[id] ?? "", vars) || null;

  let value: unknown = 0;
  let kind: Kind = "money";
  let unit: string | null = null;
  let caption = "";
  let detail: string | null = null;
  let rows: Row[] = [];
  let rowsAfter: Row[] = [];
  let table: any = null;
  let footnote: string | null = null;
  let note: string | null = strings.notes[id] ?? null;

  switch (id) {
    case "sales_today": {
      value = f.gross_sales;
      caption = fill(H.caption, { bills: count(f.bill_count) });
      const [y, m, d] = parts(f.period_from);
      detail = compare({ prev: inr(f.previous_gross_sales), weekday: strings.weekdays[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] });
      rows = [...f.by_method.map((x: any) => ({ label: method(x.method), value: x.amount, kind: "money" as Kind })),
        row("total_sold", f.gross_sales, "money", "total"), row("average_bill", f.average_bill, "money"), row("returns", f.returns_amount, "money")];
      break;
    }
    case "profit_month":
      value = f.net_profit;
      caption = fill(H.caption, { from: lead(f.period_from, f.period_to), to: day(f.period_to) });
      detail = compare({ prev: inr(f.previous_net_profit), pfrom: lead(f.previous_from, f.previous_to), pto: day(f.previous_to) });
      rows = [row("sales_after_returns", f.revenue_net, "money"), row("cogs", f.cogs, "money"), row("gross_profit", f.gross_profit, "money", "total"),
        row("expenses", f.expenses, "money"), row("net_profit", f.net_profit, "money", "total"), row("returns", f.returns_total, "money")];
      break;
    case "top_items": {
      const top = f.items[0];
      value = top?.sales_value ?? 0;
      caption = top ? fill(H.caption, { name: top.product_name }) : "";
      table = { columns: [col("item", "text", false), col("sold", "text"), col("bills", "count"), col("value", "money")],
        rows: f.items.map((i: any) => [i.product_name, qty(i.qty_sold, i.unit), i.bill_count, i.sales_value]) };
      if (top) footnote = foot({ shown: count(f.items.length), n: count(f.distinct_items_sold) });
      break;
    }
    case "low_stock":
      value = f.items_low; kind = "count"; unit = H.unit;
      caption = fill(H.caption, { out: count(f.items_out) });
      table = { columns: [col("item", "text", false), col("stock", "text"), col("limit", "qty"), col("short", "qty")],
        rows: f.items.map((i: any) => [i.product_name, qty(i.stock, i.unit), i.threshold, i.shortfall]) };
      rowsAfter = [{ label: fill(L.cost_to_refill, { n: count(f.items_low) }), value: f.reorder_value, kind: "money", tone: "total" }];
      footnote = foot({ shown: count(f.items.length), n: count(f.items_low) });
      break;
    case "expiring_stock":
      value = f.expiring_value;
      caption = fill(H.caption, { to: day(f.period_to), n: count(f.expiring_batches) });
      table = { columns: [col("item", "text", false), col("expiry", "text"), col("left", "text"), col("value", "money")],
        rows: f.items.map((i: any) => [i.product_name, i.days_left < 0 ? fill(L.expired_suffix, { date: day(i.expiry_date) }) : day(i.expiry_date), qty(i.qty_remaining, i.unit), i.value]),
        // Red only for stock already lost.
        tones: f.items.map((i: any) => (i.days_left < 0 ? "neg" : null)) };
      if (Number(f.expired_value) > 0) footnote = foot({ value: inr(f.expired_value) });
      break;
    case "dead_stock":
      value = f.value_stuck;
      caption = fill(H.caption, { n: count(f.items_dead), from: day(f.period_from) });
      table = { columns: [col("item", "text", false), col("stock", "text"), col("value", "money")],
        rows: f.items.map((i: any) => [i.product_name, qty(i.stock, i.unit), i.value]) };
      footnote = foot({ shown: count(f.items.length), n: count(f.items_dead) });
      break;
    case "top_dues": {
      const top = f.customers[0];
      value = top?.outstanding ?? 0;
      caption = top ? fill(H.caption, { name: top.name }) : "";
      detail = fill(H.detail, { total: inr(f.total_outstanding), n: count(f.customers_with_dues) });
      table = { columns: [col("customer", "text", false), col("last_paid", "text"), col("unpaid", "money")],
        rows: f.customers.map((c: any) => [c.name, c.last_payment_date ? day(c.last_payment_date) : L.never, c.outstanding]) };
      footnote = foot({ shown: count(f.customers.length), n: count(f.customers_with_dues) });
      break;
    }
    case "dues_age": {
      value = f.total_outstanding;
      caption = fill(H.caption, { days: count(f.oldest_days) });
      const keys = ["bucket_0_30", "bucket_31_60", "bucket_61_90", "bucket_90"];
      const all = f.buckets.reduce((s: number, b: any) => s + Number(b.amount), 0);
      table = { columns: [col("unpaid_for", "text", false), col("bills", "count"), col("amount", "money")],
        rows: f.buckets.map((b: any, i: number) => [L[keys[i]], b.bill_count, b.amount]),
        // Share of the unpaid total, for drawing only. Ink, never red: no due dates exist.
        bars: f.buckets.map((b: any) => (all > 0 ? Math.round((Number(b.amount) / all) * 1000) / 10 : 0)),
        tones: f.buckets.map((_: any, i: number) => (i === f.buckets.length - 1 ? "strong" : null)) };
      rowsAfter = [row("not_matched", f.unmatched_amount, "money"), row("total_unpaid", f.total_outstanding, "money", "total")];
      footnote = foot();
      break;
    }
    case "collections_week":
      value = f.collected;
      caption = fill(H.caption, { from: lead(f.period_from, f.period_to), to: day(f.period_to) });
      detail = compare({ prev: inr(f.previous_collected), range: span(f.previous_from, f.previous_to) });
      rows = [...f.by_method.map((x: any) => ({ label: method(x.method), value: x.amount, kind: "money" as Kind })),
        row("total_collected", f.collected, "money", "total"), row("receipts", f.receipt_count, "count"), row("customers_paid", f.customers_paid, "count")];
      footnote = foot();
      break;
    case "cash_bank":
      value = f.total_balance;
      caption = H.caption;
      rows = [...f.accounts.map((a: any) => ({ label: a.label, value: a.balance, kind: "money" as Kind })),
        row("total", f.total_balance, "money", "total"), row("in_today", f.today_in, "money"), row("out_today", f.today_out, "money")];
      footnote = foot();
      // Never a silent mismatch with the linked screen: say the exact gap.
      if (Math.abs(Number(f.loan_total ?? 0)) >= 0.005) {
        const loan = Number(f.loan_total);
        // A negative loan balance is money owed: say it as that, not as "-₹".
        const loans = fill(loan < 0 ? strings.footnotes.cash_bank_loans_owed : strings.footnotes.cash_bank_loans, {
          loan: inr(Math.abs(loan)), total: inr(Math.round((Number(f.total_balance) + loan) * 100) / 100) });
        footnote = footnote ? `${footnote} ${loans}` : loans;
      }
      break;
    case "gst_collected": {
      value = f.output_gst;
      caption = fill(H.caption, { from: lead(f.period_from, f.period_to), to: day(f.period_to) });
      const [, m] = parts(f.last_month_from ?? f.period_from);
      rows = [row("sales_in_period", f.taxable_sales, "money"), row("gst_on_sales", f.output_gst, "money", "total"),
        { label: fill(L.full_month, { month: strings.months_long[m - 1] }), value: f.last_month_output_gst, kind: "money" }];
      // Only gaps that exist, each with its size and cause. None under a paisa.
      // If the gaps are bigger than rounding can explain, one plain line instead.
      const lines: string[] = [];
      if (gstScreenChecks(f).length) { footnote = strings.footnotes.gst_screen_unmatched; break; }
      const gstGap = Math.round((Number(f.gstr3b_gst ?? f.output_gst) - Number(f.output_gst)) * 100) / 100;
      if (Math.abs(gstGap) >= 0.01) {
        lines.push(fill(gstGap > 0 ? strings.footnotes.gst_screen_more : strings.footnotes.gst_screen_less, { gap: inr(Math.abs(gstGap)) }));
      }
      const rounding = Math.round(Number(f.bill_rounding ?? 0) * 100) / 100;
      if (Math.abs(rounding) >= 0.01) lines.push(fill(strings.footnotes.gst_bill_rounding, { gap: inr(Math.abs(rounding)) }));
      footnote = lines.length ? lines.join(" ") : null;
      break;
    }
    case "gst_gaps":
      value = f.purchases_no_bill_no; kind = "count";
      unit = fill(H.unit, { n: count(f.purchases_total) });
      caption = fill(H.caption, { from: lead(f.period_from, f.period_to), to: day(f.period_to) });
      table = { columns: [col("record", "text", false), col("missing", "count"), col("of", "count")],
        rows: [[L.purchases_no_bill, f.purchases_no_bill_no, f.purchases_total], [L.lines_no_hsn, f.sale_lines_no_hsn, f.sale_lines_total],
          [L.products_no_hsn, f.products_no_hsn, f.products_total], [L.suppliers_no_gstin, f.suppliers_used_no_gstin, f.suppliers_used]] };
      rowsAfter = [row("value_no_bill", f.purchases_no_bill_no_value, "money", "total")];
      footnote = foot();
      break;
    case "purchases_month":
      value = f.total_value;
      caption = fill(H.caption, { from: lead(f.period_from, f.period_to), to: day(f.period_to), bills: count(f.bill_count) });
      detail = compare({ prev: inr(f.previous_value), pfrom: lead(f.previous_from, f.previous_to), pto: day(f.previous_to) });
      rows = [row("invoice_value", f.total_value, "money", "total"), row("bills", f.bill_count, "count"),
        row("suppliers", f.supplier_count, "count")];
      footnote = foot();
      break;
    case "supplier_dues": {
      const top = f.suppliers[0];
      value = top?.owed ?? 0;
      caption = top ? fill(H.caption, { name: top.name }) : "";
      detail = fill(H.detail, { total: inr(f.total_owed), n: count(f.suppliers_owing) });
      table = { columns: [col("supplier", "text", false), col("last_paid", "text"), col("owed", "money")],
        rows: f.suppliers.map((x: any) => [x.name, x.last_payment_date ? day(x.last_payment_date) : L.never, x.owed]) };
      rowsAfter = [row("total_owed", f.total_owed, "money", "total")];
      // The Suppliers screen nets money paid ahead against open bills; say how much.
      if (Number(f.advance_total) >= 0.005) rowsAfter.push(row("paid_ahead", f.advance_total, "money"));
      footnote = foot({ shown: count(f.suppliers.length), n: count(f.suppliers_owing) });
      break;
    }
    case "top_suppliers": {
      const top = f.suppliers[0];
      value = top?.value ?? 0;
      caption = top ? fill(H.caption, { name: top.name }) : "";
      detail = fill(H.detail, { total: inr(f.total_value), n: count(f.supplier_count), bills: count(f.bill_count),
        from: lead(f.period_from, f.period_to), to: day(f.period_to) });
      table = { columns: [col("supplier", "text", false), col("bills", "count"), col("value", "money")],
        rows: f.suppliers.map((x: any) => [x.name, x.bill_count, x.value]) };
      rowsAfter = [row("invoice_value", f.total_value, "money", "total")];
      footnote = foot({ shown: count(f.suppliers.length), n: count(f.supplier_count) });
      break;
    }
    case "cost_up":
      value = f.items_up; kind = "count"; unit = H.unit;
      caption = fill(H.caption, { n: count(f.items_compared), from: day(f.period_from) });
      table = { columns: [col("item", "text", false), col("was", "money"), col("now", "money"), col("rise", "percent")],
        rows: f.items.map((i: any) => [i.unit ? `${i.product_name} (${i.unit})` : i.product_name, i.old_cost, i.new_cost, i.pct_rise]) };
      footnote = foot({ shown: count(f.items.length), n: count(f.items_up) });
      break;
    // ── expenses ──────────────────────────────────────────────────────────
    case "expenses_month": {
      value = f.total;
      caption = fill(H.caption, { from: lead(f.period_from, f.period_to), to: day(f.period_to), n: count(f.entry_count) });
      detail = compare({ prev: inr(f.previous_total), pfrom: lead(f.previous_from, f.previous_to), pto: day(f.previous_to) });
      table = { columns: [col("category", "text", false), col("entries", "count"), col("amount", "money")],
        rows: f.categories.map((c: any) => [c.category, c.entry_count, c.amount]) };
      rowsAfter = [row("total_spent", f.total, "money", "total")];
      // Kept out of the total, as on the profit card, but never out of sight.
      if (Number(f.drawings_count) > 0) rowsAfter.push(row("drawings_kept_out", f.drawings_total, "money"));
      if (Number(f.category_count) > f.categories.length) footnote = foot({ shown: count(f.categories.length), n: count(f.category_count) });
      break;
    }
    case "top_expenses": {
      const top = f.entries[0];
      value = top?.amount ?? 0;
      caption = top ? fill(H.caption, { category: top.category, date: day(top.date) }) : "";
      detail = fill(H.detail, { total: inr(f.total), n: count(f.entry_count) });
      table = { columns: [col("date", "text", false), col("category", "text", false), col("details", "text", false), col("amount", "money")],
        rows: f.entries.map((e: any) => [day(e.date), e.category, e.from_payroll ? L.staff_pay : (e.description ?? ""), e.amount]) };
      if (Number(f.entry_count) > f.entries.length) footnote = foot({ shown: count(f.entries.length), n: count(f.entry_count) });
      break;
    }
    case "expenses_vs_last": {
      value = f.total;
      caption = fill(H.caption, { from: lead(f.period_from, f.period_to), to: day(f.period_to) });
      const range = span(f.previous_from, f.previous_to);
      detail = compare({ prev: inr(f.previous_total), range });
      const signed = (n: number) => `${n > 0 ? "+" : ""}${inr(n)}`;
      table = { columns: [col("category", "text", false), col("this_period", "money"), col("same_days_last", "money"), col("change", "text")],
        rows: f.categories.map((c: any) => [c.category, c.amount, c.previous_amount, signed(Number(c.change))]) };
      rowsAfter = [row("total_spent", f.total, "money", "total"),
        { label: fill(L.same_days_last_total, { range }), value: f.previous_total, kind: "money" }];
      // The link opens this month's dates: say where last month's figures are.
      const lines = [fill(strings.footnotes.expenses_vs_last, { pfrom: lead(f.previous_from, f.previous_to), pto: day(f.previous_to) })];
      if (Number(f.category_count) > f.categories.length) {
        lines.push(fill(strings.footnotes.expenses_vs_last_cut, { shown: count(f.categories.length), n: count(f.category_count) }));
      }
      footnote = lines.join(" ");
      break;
    }
    // ── dues and cash (ask-dues-cash) ────────────────────────────────────────
    case "dues_overdue":
      value = f.total_over;
      caption = fill(H.caption, { n: count(f.customers_over), bills: count(f.bills_over) });
      detail = fill(H.detail, { days: count(f.oldest_days) });
      table = { columns: [col("customer", "text", false), col("oldest", "text"), col("over_60", "money")],
        rows: f.customers.map((c: any) => [c.name, fill(L.days_n, { n: count(c.oldest_days) }), c.amount_over]) };
      // The Customer Aging report's own columns, so each one can be checked there.
      rowsAfter = [row("bucket_61_90", f.aged_61_90, "money"), row("bucket_91_120", f.aged_91_120, "money"),
        row("bucket_120", f.aged_over_120, "money"), row("total_over_60", f.total_over, "money", "total"),
        row("all_unpaid", f.total_unpaid, "money")];
      footnote = foot({ shown: count(f.customers.length), n: count(f.customers_over) });
      break;
    case "credit_sales_month": {
      value = f.credit_billed;
      caption = fill(H.caption, { from: lead(f.period_from, f.period_to), to: day(f.period_to), bills: count(f.credit_bills) });
      detail = fill(H.detail, { share: `${Number(f.credit_share_pct ?? 0).toFixed(1)}%`, total: inr(f.sales_total) });
      rows = [row("sold_on_credit", f.credit_billed, "money"), row("collected_so_far", f.credit_collected, "money"),
        row("still_unpaid", f.credit_open, "money", "total"), row("other_unpaid", f.other_open, "money")];
      // The Business Report calls a bill collected from its payment status; say any gap.
      const gap = Math.round((Number(f.screen_credit_collected ?? f.credit_collected) - Number(f.credit_collected)) * 100) / 100;
      footnote = Math.abs(gap) >= 0.01
        ? `${fill(gap > 0 ? strings.footnotes.credit_sales_screen_more : strings.footnotes.credit_sales_screen_less,
          { screen: inr(f.screen_credit_collected), gap: inr(Math.abs(gap)) })} ${strings.footnotes.credit_sales_aging}`
        : `${foot()} ${strings.footnotes.credit_sales_aging}`;
      break;
    }
    case "cash_today": {
      value = f.net;
      caption = fill(H.caption, { date: day(f.period_from) });
      detail = fill(H.detail, { in: inr(f.money_in), out: inr(f.money_out) });
      const kind_ = (t: string) => strings.ref_types[t] ?? strings.ref_types.OTHER;
      rows = [...f.in_by_type.map((x: any) => ({ label: kind_(x.type), value: x.amount, kind: "money" as Kind })),
        row("money_in", f.money_in, "money", "total"),
        ...f.out_by_type.map((x: any) => ({ label: kind_(x.type), value: x.amount, kind: "money" as Kind })),
        row("money_out", f.money_out, "money", "total"), row("net_today", f.net, "money", "total")];
      table = f.accounts.length
        ? { columns: [col("account", "text", false), col("in", "money"), col("out", "money")],
          rows: f.accounts.map((a: any) => [a.label, a.money_in, a.money_out]) }
        : null;
      // Never a silent mismatch with the Day Book: its totals, then each cause with its size.
      const lines = [foot()];
      const gapIn = Math.abs(Number(f.money_in) - Number(f.daybook_in)) >= 0.005;
      const gapOut = Math.abs(Number(f.money_out) - Number(f.daybook_out)) >= 0.005;
      if (gapIn || gapOut) {
        const F = strings.footnotes;
        lines.push(fill(F.cash_today_daybook, { in: inr(f.daybook_in), out: inr(f.daybook_out) }));
        const dir = (d: string) => (d === "IN" ? L.dir_in : L.dir_out);
        const items = (f.unlisted ?? []).map((u: any) => fill(["SALE", "PAYMENT", "PURCHASE"].includes(u.type) ? F.cash_today_item : F.cash_today_item_plain,
          { type: kind_(u.type), method: method(u.mode), amount: inr(u.amount), direction: dir(u.direction) }));
        if (items.length) lines.push(fill(F.cash_today_unlisted, { items: items.join("; ") }));
        for (const [r, d] of [[Number(f.residual_in ?? 0), "IN"], [Number(f.residual_out ?? 0), "OUT"]] as [number, string][]) {
          if (Math.abs(r) >= 0.005) lines.push(fill(r > 0 ? F.cash_today_residual_more : F.cash_today_residual_less, { amount: inr(Math.abs(r)), direction: dir(d) }));
        }
      }
      footnote = lines.filter(Boolean).join(" ") || null;
      break;
    }
    case "payment_mix_month": {
      value = f.gross_sales;
      caption = fill(H.caption, { from: lead(f.period_from, f.period_to), to: day(f.period_to), bills: count(f.bill_count) });
      table = { columns: [col("paid_by", "text", false), col("bills", "count"), col("amount", "money"), col("share", "percent")],
        rows: f.by_method.map((m: any) => [method(m.method), m.bill_count, m.amount, m.share_pct]),
        bars: f.by_method.map((m: any) => Number(m.share_pct)) };
      rowsAfter = [row("total_sold", f.gross_sales, "money", "total")];
      const unrecorded = Number(f.unrecorded_amount ?? 0);
      footnote = unrecorded >= 0.005
        ? `${foot()} ${fill(strings.footnotes.payment_mix_unrecorded, { amount: inr(unrecorded) })}`
        : foot();
      break;
    }
    // ── sales and stock, second set (branch ask-sales-stock) ──────────────
    case "sales_vs_last_month": {
      value = f.gross_sales;
      caption = fill(H.caption, { from: lead(f.period_from, f.period_to), to: day(f.period_to), bills: count(f.bill_count) });
      detail = compare({ prev: inr(f.previous_gross_sales), pfrom: lead(f.previous_from, f.previous_to), pto: day(f.previous_to) });
      const now = span(f.period_from, f.period_to);
      const then = span(f.previous_from, f.previous_to);
      rows = [
        { label: fill(L.sales_for, { range: now }), value: f.gross_sales, kind: "money", tone: "total" },
        { label: fill(L.bills_for, { range: now }), value: f.bill_count, kind: "count" },
        { label: fill(L.average_for, { range: now }), value: f.average_bill, kind: "money" },
      ];
      rowsAfter = [
        { label: fill(L.sales_for, { range: then }), value: f.previous_gross_sales, kind: "money" },
        { label: fill(L.bills_for, { range: then }), value: f.previous_bill_count, kind: "count" },
        { label: fill(L.average_for, { range: then }), value: f.previous_average_bill, kind: "money" },
      ];
      footnote = foot({ range: now, prange: then });
      break;
    }
    case "sales_week": {
      value = f.gross_sales;
      caption = fill(H.caption, { from: lead(f.period_from, f.period_to), to: day(f.period_to), bills: count(f.bill_count) });
      detail = compare({ prev: inr(f.previous_gross_sales), range: span(f.previous_from, f.previous_to) });
      const weekday = (iso: string) => { const [y, m, d] = parts(iso); return strings.weekdays[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]; };
      table = { columns: [col("day", "text", false), col("bills", "count"), col("sales", "money")],
        rows: f.days.map((d: any) => [`${weekday(d.date)} ${day(d.date)}`, d.bill_count, d.gross_sales]) };
      rowsAfter = [row("total_sold", f.gross_sales, "money", "total")];
      footnote = foot();
      break;
    }
    case "best_customers": {
      const top = f.customers[0];
      value = top?.sales_value ?? 0;
      caption = top ? fill(H.caption, { name: top.name }) : H.none;
      detail = fill(H.detail, { from: lead(f.period_from, f.period_to), to: day(f.period_to) });
      table = { columns: [col("customer", "text", false), col("bills", "count"), col("value", "money")],
        rows: f.customers.map((c: any) => [c.name, c.bill_count, c.sales_value]) };
      rowsAfter = [
        { label: fill(L.customers_n, { n: count(f.customers_count) }), value: f.customer_sales, kind: "money" },
        { label: fill(L.walk_in_n, { n: count(f.walk_in_bills) }), value: f.walk_in_sales, kind: "money" },
        row("total_sales", f.total_sales, "money", "total"),
      ];
      const lines = [foot({ shown: count(f.customers.length), n: count(f.customers_count) })];
      // Sales by Party files a walk-in bill with a typed name under that name.
      if (Number(f.walk_in_named_bills) > 0) {
        lines.push(fill(strings.footnotes.best_customers_named, { n: count(f.walk_in_named_bills),
          value: inr(f.walk_in_named_sales), screen: inr(Math.round((Number(f.walk_in_sales) - Number(f.walk_in_named_sales)) * 100) / 100) }));
      }
      footnote = lines.filter(Boolean).join(" ") || null;
      break;
    }
    case "returns_month": {
      value = f.returns_total;
      caption = fill(H.caption, { from: lead(f.period_from, f.period_to), to: day(f.period_to), n: count(f.return_count) });
      table = { columns: [col("item", "text", false), col("qty", "text"), col("value", "money")],
        rows: f.items.map((i: any) => [i.product_name, qty(i.qty_returned, i.unit), i.value]) };
      rowsAfter = [row("total_returned", f.returns_total, "money", "total")];
      // The Returns list has no dates: say what it shows, exactly.
      const all = Number(f.all_return_count) === Number(f.return_count) && Math.abs(Number(f.all_returns_total) - Number(f.returns_total)) < 0.005;
      const lines = [fill(all ? strings.footnotes.returns_month_all : strings.footnotes.returns_month,
        { n: count(f.all_return_count), total: inr(f.all_returns_total) })];
      if (f.items.length < Number(f.distinct_items_returned)) {
        lines.push(fill(strings.footnotes.returns_month_items, { shown: count(f.items.length), n: count(f.distinct_items_returned) }));
      }
      footnote = lines.join(" ");
      break;
    }
    case "stock_value": {
      value = f.stock_value;
      caption = fill(H.caption, { n: count(f.items_in_stock) });
      table = { columns: [col("item", "text", false), col("stock", "text"), col("cost", "money"), col("value", "money")],
        rows: f.items.map((i: any) => [i.product_name, qty(i.stock, i.unit), i.cost_price, i.value]) };
      rowsAfter = [row("total_at_cost", f.stock_value, "money", "total")];
      if (Math.abs(Number(f.raw_value ?? 0)) >= 0.005) rowsAfter.push(row("raw_part", f.raw_value, "money"));
      rowsAfter.push(row("products", f.products_total, "count"));
      const lines = [foot({ shown: count(f.items.length) })];
      // The open cost batches, against the screen's stock x cost price: the gap
      // and each of its two causes, only when there is one.
      const gap = Math.round((Number(f.batch_value) - Number(f.stock_value)) * 100) / 100;
      if (Math.abs(gap) >= 0.01) {
        lines.push(fill(gap > 0 ? strings.footnotes.stock_batches_more : strings.footnotes.stock_batches_less,
          { batch: inr(f.batch_value), gap: inr(Math.abs(gap)) }));
        if (Math.abs(Number(f.cost_gap)) >= 0.01) {
          lines.push(fill(strings.footnotes.stock_cost_off, { n: count(f.items_cost_off), gap: inr(Math.abs(Number(f.cost_gap))) }));
        }
        if (Math.abs(Number(f.unbatched_value)) >= 0.01) {
          lines.push(fill(strings.footnotes.stock_unbatched, { n: count(f.items_unbatched), gap: inr(Math.abs(Number(f.unbatched_value))) }));
        }
      }
      footnote = lines.join(" ");
      break;
    }
    case "out_of_stock": {
      value = f.items_out; kind = "count"; unit = H.unit;
      caption = fill(H.caption, { n: count(f.items_stocked) });
      table = { columns: [col("item", "text", false), col("stock", "text")],
        rows: f.items.map((i: any) => [i.product_name, qty(i.stock, i.unit)]),
        tones: f.items.map((i: any) => (Number(i.stock) < 0 ? "neg" : null)) };
      const lines = [foot()];
      if (f.items.length < Number(f.items_out)) lines.push(fill(strings.footnotes.list_capped, { shown: count(f.items.length), n: count(f.items_out) }));
      // Low Stock's "Items Out of Stock" counts exactly zero.
      if (Number(f.items_negative) > 0) {
        lines.push(fill(strings.footnotes.out_of_stock_negative, { zero: count(f.items_zero), neg: count(f.items_negative) }));
      }
      footnote = lines.join(" ");
      break;
    }
    case "fast_movers_low": {
      value = f.items_low; kind = "count"; unit = H.unit;
      caption = fill(H.caption, { top: count(f.top_count), from: day(f.period_from) });
      table = { columns: [col("item", "text", false), col("sold", "text"), col("stock", "text"), col("days_left", "text")],
        rows: f.items.map((i: any) => [i.product_name, qty(i.units_sold, i.unit), qty(i.stock, i.unit), fill(L.days_n, { n: count(i.days_left) })]) };
      // The rule, in plain words, on every card.
      note = fill(strings.notes.fast_movers_low, { top: count(f.top_n), from: day(f.period_from), days: count(f.window_days), cover: count(f.cover_days) });
      footnote = f.items.length < Number(f.items_low)
        ? fill(strings.footnotes.list_capped, { shown: count(f.items.length), n: count(f.items_low) }) : foot();
      break;
    }
    // ── end of the second sales and stock set ──────────────────────────────
    // ── GST: purchases, rough net, sales by rate ───────────────────────────
    case "gst_itc_month": {
      // Ties to the Purchase Register's "Tax (ITC candidate)" for the same dates.
      value = f.input_gst;
      caption = fill(H.caption, { from: lead(f.period_from, f.period_to), to: day(f.period_to), bills: count(f.bill_count) });
      rows = [row("gst_purchase_value", f.invoice_value, "money"), row("gst_purchase_taxable", f.taxable_value, "money"),
        row("cgst", f.cgst, "money"), row("sgst", f.sgst, "money"),
        ...(Math.abs(Number(f.igst)) >= 0.005 ? [row("igst", f.igst, "money")] : []),
        row("gst_on_purchases", f.input_gst, "money", "total")];
      const doubt = (key: string, n: unknown, v: unknown, tone?: "total"): Row =>
        ({ label: fill(L[key], { n: count(Number(n)) }), value: v, kind: "money", ...(tone ? { tone } : {}) });
      rowsAfter = [doubt("gst_no_gstin", f.no_gstin_bills, f.no_gstin_gst), doubt("gst_no_bill_no", f.no_bill_no_bills, f.no_bill_no_gst),
        doubt("gst_in_doubt", f.in_doubt_bills, f.in_doubt_gst, "total")];
      footnote = foot({ gst: inr(Number(f.input_gst)) });
      break;
    }
    case "gst_net_month": {
      const net = Number(f.net_estimate);
      value = Math.abs(net);
      caption = fill(net < 0 ? H.caption_more_input : H.caption, { from: lead(f.period_from, f.period_to), to: day(f.period_to) });
      rows = [row("gst_sales_side", f.output_gst, "money"), row("gst_purchase_side", f.input_gst, "money"),
        row("gst_rough_difference", f.net_estimate, "money", "total")];
      // Why GSTR-3B can read differently: the sales side under gst_collected's
      // guarded rule, the purchase side by its exact figure, then the floor.
      const N = strings.footnotes;
      const lines: string[] = [];
      if (gstScreenChecks(f).length) lines.push(N.gst_screen_unmatched);
      else {
        const gap = Math.round((Number(f.gstr3b_gst ?? f.output_gst) - Number(f.output_gst)) * 100) / 100;
        if (Math.abs(gap) >= 0.01) lines.push(fill(gap > 0 ? N.gst_net_screen_more : N.gst_net_screen_less, { gap: inr(Math.abs(gap)) }));
      }
      const itcGap = Math.round((Number(f.gstr3b_itc ?? f.input_gst) - Number(f.input_gst)) * 100) / 100;
      if (Math.abs(itcGap) >= 0.01) {
        const left = Number(f.no_gstin_gst ?? 0);
        lines.push(fill(left >= 0.005 ? N.gst_net_itc_left : N.gst_net_itc_round, { itc: inr(Number(f.gstr3b_itc)), left: inr(left) }));
      }
      lines.push(N.gst_net_floor);
      footnote = lines.join(" ");
      break;
    }
    case "gst_by_rate": {
      value = f.sales_gst;
      caption = fill(H.caption, { from: lead(f.period_from, f.period_to), to: day(f.period_to) });
      if (Number(f.not_set_lines) > 0) detail = fill(H.not_set, { n: count(f.not_set_lines), value: inr(Number(f.not_set_taxable)) });
      const rates = f.rates as any[];
      table = { columns: [col("gst_rate", "text", false), col("gst_lines", "count"), col("gst_before", "money"), col("gst_amount", "money")],
        rows: rates.map((r: any) => [r.rate_not_set ? L.gst_rate_not_set : fill(L.gst_rate_pct, { rate: Number(r.rate) }), r.lines, r.taxable, r.gst]),
        // The row with no rate set is the one to look at: ink, not red.
        tones: rates.map((r: any) => (r.rate_not_set ? "strong" : null)) };
      if (Number(f.no_lines_bills) > 0) {
        rowsAfter.push({ label: fill(L.gst_no_lines, { n: count(f.no_lines_bills) }), value: f.no_lines_value, kind: "money" });
      }
      rowsAfter.push(row("gst_sales_total", f.sales_gst, "money", "total"));
      if (Math.abs(Number(f.returns_gst ?? 0)) >= 0.005) {
        rowsAfter.push(row("gst_returns", f.returns_gst, "money"), row("gst_after_returns", f.output_gst, "money", "total"));
      }
      const N = strings.footnotes;
      const lines = [N.gst_by_rate];
      if (Number(f.not_set_lines) > 0) lines.push(N.gst_by_rate_not_set);
      const gap = Math.round((Number(f.rows_gst) - Number(f.sales_gst)) * 100) / 100;
      if (Math.abs(gap) >= 0.01) lines.push(fill(gap > 0 ? N.gst_by_rate_more : N.gst_by_rate_less, { gap: inr(Math.abs(gap)) }));
      footnote = lines.join(" ");
      break;
    }
    // ── staff (ask-staff) ──────────────────────────────────────────────────
    // Every figure is the Payroll screen's Attendance tab for the same month.
    case "payroll_month": {
      const N = strings.footnotes;
      value = f.paid_total;
      caption = fill(H.caption, { from: lead(f.period_from, f.period_to), to: day(f.period_to), runs: count(f.run_count) });
      if (Number(f.daily_staff) > 0) detail = fill(H.detail, { due: inr(Number(f.daily_due)) });
      if (Number(f.daily_staff) > 0) {
        rows = [row("staff_daily_earned", f.daily_earned, "money"), row("staff_daily_paid", f.daily_paid, "money"),
          row("staff_still_to_pay", f.daily_due, "money", "total")];
      }
      if (Number(f.monthly_staff) > 0) {
        rows.push({ label: fill(L.staff_monthly_salaries, { n: count(f.monthly_staff) }), value: f.monthly_salaries, kind: "money" },
          row("staff_monthly_paid", f.monthly_paid, "money"));
      }
      if (Number(f.other_paid) > 0) rows.push({ label: fill(L.staff_other_paid, { n: count(f.other_people) }), value: f.other_paid, kind: "money" });
      table = staffTable(f.staff, L, col);
      rowsAfter = [row("staff_paid_total", f.paid_total, "money", "total")];
      // The tab's footer is daily-wage staff only: name what else is in the total.
      const lines: string[] = [];
      const outside = Math.round((Number(f.paid_total) - Number(f.daily_paid)) * 100) / 100;
      if (Math.abs(outside) >= 0.01) {
        lines.push(fill(N.payroll_month_outside, { daily: inr(Number(f.daily_paid)), total: inr(Number(f.paid_total)) }));
        if (Number(f.monthly_paid) > 0) lines.push(fill(N.payroll_month_monthly, { amount: inr(Number(f.monthly_paid)) }));
        if (Number(f.other_paid) > 0) lines.push(fill(N.payroll_month_other, { amount: inr(Number(f.other_paid)), n: count(f.other_people) }));
      }
      if (Number(f.overpaid) > 0) lines.push(fill(N.staff_overpaid, { amount: inr(Number(f.overpaid)), n: count(f.staff_overpaid) }));
      if (f.staff.length < Number(f.staff_count)) lines.push(fill(N.list_capped, { shown: count(f.staff.length), n: count(f.staff_count) }));
      footnote = lines.join(" ") || null;
      break;
    }
    case "salary_due": {
      const N = strings.footnotes;
      value = f.due_total;
      caption = Number(f.staff_due) > 0
        ? fill(H.caption, { n: count(f.staff_due), from: lead(f.period_from, f.period_to), to: day(f.period_to) })
        : fill(H.none, { from: lead(f.period_from, f.period_to), to: day(f.period_to) });
      table = f.due_staff.length
        ? { columns: [col("staff", "text", false), col("staff_days", "count"), col("staff_earned", "money"), col("staff_paid", "money"), col("staff_due", "money")],
          rows: f.due_staff.map((s: any) => [s.name, s.days, s.earned, s.paid, s.due]) }
        : null;
      rowsAfter = [row("staff_total_due", f.due_total, "money", "total")];
      const lines: string[] = [];
      // The rows are the tab's "Still due" column; its footer nets off overpaid staff.
      if (Number(f.overpaid) > 0) {
        lines.push(fill(N.salary_due_footer, { screen: inr(Number(f.daily_due)), amount: inr(Number(f.overpaid)), n: count(f.staff_overpaid) }));
      }
      if (Number(f.monthly_staff) > 0) {
        lines.push(fill(N.salary_due_monthly, { n: count(f.monthly_staff), unpaid: count(f.monthly_unpaid_staff) }));
      }
      if (f.due_staff.length < Number(f.staff_due)) lines.push(fill(N.list_capped, { shown: count(f.due_staff.length), n: count(f.staff_due) }));
      footnote = lines.join(" ") || null;
      break;
    }
    case "attendance_today": {
      const N = strings.footnotes;
      value = f.absent; kind = "count"; unit = H.unit;
      caption = fill(H.caption, { date: day(f.period_from), n: count(f.staff_count) });
      rows = [row("att_present", f.present, "count")];
      if (Number(f.overtime) > 0) rows.push(row("att_overtime", f.overtime, "count"));
      rows.push(row("att_half_day", f.half_day, "count"), row("att_absent", f.absent, "count"), row("att_not_marked", f.not_marked, "count"));
      if (Number(f.other_mark) > 0) rows.push(row("att_other", f.other_mark, "count"));
      const status = (s: string) => L[`att_${String(s).toLowerCase()}`] ?? L.att_other;
      table = f.staff.length
        ? { columns: [col("staff", "text", false), col("att_today", "text")],
          rows: f.staff.map((s: any) => [s.name, status(s.status)]),
          tones: f.staff.map((s: any) => (s.status === "ABSENT" ? "strong" : null)) }
        : null;
      const lines: string[] = [];
      if (Number(f.marks_off_grid) > 0) lines.push(fill(N.attendance_off_grid, { n: count(f.marks_off_grid) }));
      if (f.staff.length < Number(f.away_count)) lines.push(fill(N.list_capped, { shown: count(f.staff.length), n: count(f.away_count) }));
      footnote = lines.join(" ") || null;
      break;
    }
    case "attendance_month": {
      const N = strings.footnotes;
      value = f.missed_days; kind = "days"; unit = H.unit;
      caption = fill(H.caption, { from: lead(f.period_from, f.period_to), to: day(f.period_to), absent: count(f.absent_days), half: count(f.half_days) });
      detail = Number(f.staff_missed) > 0 ? fill(H.detail, { n: count(f.staff_missed), of: count(f.staff_count) }) : fill(H.none, { of: count(f.staff_count) });
      table = f.staff.length
        ? { columns: [col("staff", "text", false), col("att_absent_days", "count"), col("att_half_days", "count"), col("staff_days", "count")],
          rows: f.staff.map((s: any) => [s.name, s.absent, s.half_days, s.days]) }
        : null;
      const lines: string[] = [];
      if (Number(f.marks_off_grid) > 0) lines.push(fill(N.attendance_off_grid_month, { n: count(f.marks_off_grid) }));
      if (f.staff.length < Number(f.staff_missed)) lines.push(fill(N.list_capped, { shown: count(f.staff.length), n: count(f.staff_missed) }));
      footnote = lines.join(" ") || null;
      break;
    }
    default:
      throw new Error(`no card for ${id}`);
  }

  if (empty) { detail = null; footnote = null; caption = strings.no_data_by_question[id] ?? strings.no_data; }
  const headline = { label: caption, value, kind };
  return {
    title: strings.titles[id], headline,
    hero: { value, kind, unit, caption, detail },
    rows, table, rows_after: rowsAfter,
    note, footnote,
  };
}
