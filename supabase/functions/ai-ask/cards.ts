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
        const loans = fill(strings.footnotes.cash_bank_loans, {
          loan: inr(Number(f.loan_total)), total: inr(Math.round((Number(f.total_balance) + Number(f.loan_total)) * 100) / 100) });
        footnote = footnote ? `${footnote} ${loans}` : loans;
      }
      break;
    case "gst_collected": {
      value = f.output_gst;
      caption = fill(H.caption, { from: lead(f.period_from, f.period_to), to: day(f.period_to) });
      const [, m] = parts(f.last_month_from ?? f.period_from);
      rows = [row("sales_in_period", f.taxable_sales, "money"), row("gst_on_sales", f.output_gst, "money", "total"),
        { label: fill(L.full_month, { month: strings.months_long[m - 1] }), value: f.last_month_output_gst, kind: "money" }];
      footnote = foot();
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
    default:
      throw new Error(`no card for ${id}`);
  }

  if (empty) { detail = null; footnote = null; caption = strings.no_data_by_question[id] ?? strings.no_data; }
  const headline = { label: caption, value, kind };
  return {
    title: strings.titles[id], headline,
    hero: { value, kind, unit, caption, detail },
    rows, table, rows_after: rowsAfter,
    note: strings.notes[id] ?? null, footnote,
  };
}
