// The card every client draws without per-question code. Labels arrive in the
// chosen language; clients only format the value for its `kind`.

export type Kind = "money" | "count" | "qty" | "percent" | "date" | "days" | "text";
type Cell = { label: string; value: unknown; kind: Kind };

export function buildCard(id: string, f: Record<string, any>, strings: any) {
  const L = strings.card as Record<string, string>;
  const cell = (key: string, value: unknown, kind: Kind): Cell => ({ label: L[key], value, kind });
  const cols = (...c: [string, Kind][]) => c.map(([key, kind]) => ({ label: L[key], kind }));
  let headline: Cell;
  let rows: Cell[] = [];
  let table: { columns: { label: string; kind: Kind }[]; rows: unknown[][] } | null = null;

  switch (id) {
    case "sales_today":
      headline = cell("sales", f.gross_sales, "money");
      rows = [cell("bills", f.bill_count, "count"), cell("average_bill", f.average_bill, "money"),
        cell("returns", f.returns_amount, "money"), cell("same_day_last_week", f.previous_gross_sales, "money"),
        cell("change", f.change_pct, "percent")];
      table = { columns: cols(["method", "text"], ["amount", "money"]), rows: f.by_method.map((m: any) => [m.method, m.amount]) };
      break;
    case "profit_month":
      headline = cell("net_profit", f.net_profit, "money");
      rows = [cell("revenue", f.revenue_net, "money"), cell("cogs", f.cogs, "money"), cell("gross_profit", f.gross_profit, "money"),
        cell("expenses", f.expenses, "money"), cell("returns", f.returns_total, "money"),
        cell("previous_period", f.previous_net_profit, "money"), cell("change", f.change_pct, "percent")];
      break;
    case "top_items":
      headline = cell("total_sales", f.total_sales_value, "money");
      rows = [cell("items_sold", f.distinct_items_sold, "count")];
      table = { columns: cols(["item", "text"], ["qty_sold", "qty"], ["value", "money"], ["bills", "count"]),
        rows: f.items.map((i: any) => [i.product_name, i.qty_sold, i.sales_value, i.bill_count]) };
      break;
    case "low_stock":
      headline = cell("items_low", f.items_low, "count");
      rows = [cell("items_out", f.items_out, "count"), cell("reorder_value", f.reorder_value, "money")];
      table = { columns: cols(["item", "text"], ["stock", "qty"], ["reorder_level", "qty"], ["short_by", "qty"]),
        rows: f.items.map((i: any) => [i.product_name, i.stock, i.threshold, i.shortfall]) };
      break;
    case "expiring_stock":
      headline = cell("expiring_value", f.expiring_value, "money");
      rows = [cell("expiring_batches", f.expiring_batches, "count"), cell("expired_batches", f.expired_batches, "count"),
        cell("expired_value", f.expired_value, "money")];
      table = { columns: cols(["item", "text"], ["expiry", "date"], ["days_left", "days"], ["qty", "qty"], ["value", "money"]),
        rows: f.items.map((i: any) => [i.product_name, i.expiry_date, i.days_left, i.qty_remaining, i.value]) };
      break;
    case "dead_stock":
      headline = cell("value_stuck", f.value_stuck, "money");
      rows = [cell("items_dead", f.items_dead, "count")];
      table = { columns: cols(["item", "text"], ["stock", "qty"], ["value", "money"]),
        rows: f.items.map((i: any) => [i.product_name, i.stock, i.value]) };
      break;
    case "top_dues":
      headline = cell("total_owed", f.total_outstanding, "money");
      rows = [cell("customers_owing", f.customers_with_dues, "count")];
      table = { columns: cols(["customer", "text"], ["owed", "money"], ["last_payment", "date"]),
        rows: f.customers.map((c: any) => [c.name, c.outstanding, c.last_payment_date]) };
      break;
    case "dues_age":
      headline = cell("total_owed", f.total_outstanding, "money");
      rows = [cell("oldest_unpaid", f.oldest_days, "days"), cell("not_matched", f.unmatched_amount, "money")];
      table = { columns: cols(["unpaid_for_days", "text"], ["amount", "money"], ["bills", "count"]),
        rows: f.buckets.map((b: any) => [b.label, b.amount, b.bill_count]) };
      break;
    case "collections_week":
      headline = cell("collected", f.collected, "money");
      rows = [cell("receipts", f.receipt_count, "count"), cell("customers_paid", f.customers_paid, "count"),
        cell("same_days_last_week", f.previous_collected, "money"), cell("change", f.change_pct, "percent")];
      table = { columns: cols(["method", "text"], ["amount", "money"]), rows: f.by_method.map((m: any) => [m.method, m.amount]) };
      break;
    case "cash_bank":
      headline = cell("total_money", f.total_balance, "money");
      rows = [cell("cash", f.cash_total, "money"), cell("bank", f.bank_total, "money"),
        cell("in_today", f.today_in, "money"), cell("out_today", f.today_out, "money")];
      table = { columns: cols(["account", "text"], ["type", "text"], ["balance", "money"]),
        rows: f.accounts.map((a: any) => [a.label, a.type, a.balance]) };
      break;
    case "gst_collected":
      headline = cell("gst_on_sales", f.output_gst, "money");
      rows = [cell("taxable_sales", f.taxable_sales, "money"), cell("last_month", f.last_month_output_gst, "money")];
      break;
    case "gst_gaps":
      headline = cell("purchases_no_bill", f.purchases_no_bill_no, "count");
      rows = [cell("value_no_bill", f.purchases_no_bill_no_value, "money"),
        cell("lines_no_hsn", f.sale_lines_no_hsn, "count"), cell("products_no_hsn", f.products_no_hsn, "count"),
        cell("suppliers_no_gstin", f.suppliers_used_no_gstin, "count")];
      break;
    default:
      throw new Error(`no card for ${id}`);
  }

  return { title: strings.titles[id], headline, rows, table, note: strings.notes[id] ?? null };
}
