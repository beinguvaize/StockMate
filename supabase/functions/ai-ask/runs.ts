// Runs each question's reads with the caller's JWT. Dates are worked out here,
// so a client can never choose them. A failed read throws: it is never a zero.
import { gstScreenChecks } from "./cards.ts";
import { addDays, changePct, lastMonth, mondayOf, monthEnd, monthStart, priorWindow, sameDaysLastMonth, sameDaysLastWeek } from "./periods.ts";

export class ReadFailed extends Error {}

async function rpc(db: any, name: string, args?: Record<string, unknown>) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new ReadFailed(`${name}: ${error.message}`);
  return data;
}

const pl = async (db: any, tenantId: string, from: string, to: string) => {
  const rows = await rpc(db, "get_pl_ranged", { p_tenant_id: tenantId, p_from: from, p_to: to });
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) throw new ReadFailed("get_pl_ranged: no row");
  return row;
};

export interface Run {
  figures: Record<string, any>;
  params: { from: string; to: string };
  empty: boolean;
}

export async function runQuestion(id: string, db: any, ctx: { tenantId: string; today: string; taxMode: string | null }): Promise<Run> {
  const { tenantId, today } = ctx;
  const asOf = new Date().toISOString();
  switch (id) {
    case "sales_today": {
      const cur = await rpc(db, "ai_sales_summary", { p_from: today, p_to: today });
      const lw = addDays(today, -7);
      const prev = await rpc(db, "ai_sales_summary", { p_from: lw, p_to: lw });
      return {
        figures: { ...cur, previous_gross_sales: prev.gross_sales, change_pct: changePct(cur.gross_sales, prev.gross_sales) },
        params: { from: today, to: today },
        empty: cur.bill_count === 0 && prev.bill_count === 0,
      };
    }
    case "profit_month": {
      const from = monthStart(today);
      const p = priorWindow(from, today);
      const cur = await pl(db, tenantId, from, today);
      const prev = await pl(db, tenantId, p.from, p.to);
      const prior = Number(prev.net_profit);
      const net = Number(cur.net_profit);
      return {
        figures: {
          period_from: from, period_to: today, as_of: asOf,
          revenue_net: Number(cur.revenue_net), cogs: Number(cur.cogs), gross_profit: Number(cur.gross_profit),
          expenses: Number(cur.expenses), net_profit: net, returns_total: Number(cur.returns_total),
          previous_net_profit: prior, previous_from: p.from, previous_to: p.to, change_pct: changePct(net, prior),
        },
        params: { from, to: today },
        empty: Number(cur.revenue_net) === 0 && Number(cur.expenses) === 0 && Number(cur.cogs) === 0,
      };
    }
    case "top_items": {
      const from = monthStart(today);
      const f = await rpc(db, "ai_top_items", { p_from: from, p_to: today, p_limit: 10 });
      return { figures: f, params: { from, to: today }, empty: f.distinct_items_sold === 0 };
    }
    case "low_stock": {
      const f = await rpc(db, "ai_low_stock", { p_limit: 20 });
      return { figures: f, params: { from: today, to: today }, empty: f.items_low === 0 };
    }
    case "expiring_stock": {
      const f = await rpc(db, "ai_expiring_stock", { p_days: 30, p_limit: 20 });
      return { figures: f, params: { from: today, to: f.period_to }, empty: f.expired_batches + f.expiring_batches === 0 };
    }
    case "dead_stock": {
      const f = await rpc(db, "ai_dead_stock", { p_days: 30, p_limit: 20 });
      return { figures: f, params: { from: f.period_from, to: today }, empty: f.items_dead === 0 };
    }
    case "top_dues": {
      const f = await rpc(db, "ai_top_dues", { p_limit: 10 });
      return { figures: f, params: { from: today, to: today }, empty: f.customers_with_dues === 0 };
    }
    case "dues_age": {
      const f = await rpc(db, "ai_dues_ageing");
      const owed = f.buckets.some((b: any) => b.bill_count > 0);
      return { figures: f, params: { from: today, to: today }, empty: !owed && Number(f.total_outstanding) === 0 };
    }
    case "collections_week": {
      const from = mondayOf(today);
      const p = sameDaysLastWeek(from, today);
      const cur = await rpc(db, "ai_collections", { p_from: from, p_to: today });
      const prev = await rpc(db, "ai_collections", { p_from: p.from, p_to: p.to });
      return {
        figures: { ...cur, previous_collected: prev.collected, previous_from: p.from, previous_to: p.to, change_pct: changePct(cur.collected, prev.collected) },
        params: { from, to: today },
        empty: cur.receipt_count === 0 && prev.receipt_count === 0,
      };
    }
    case "cash_bank": {
      const f = await rpc(db, "ai_cash_bank");
      return { figures: f, params: { from: today, to: today }, empty: f.accounts.length === 0 };
    }
    case "gst_collected": {
      const from = monthStart(today);
      const last = lastMonth(today);
      const cur = await pl(db, tenantId, from, today);
      const prev = await pl(db, tenantId, last.from, last.to);
      // The two measured gaps with the GSTR-3B screen, for the card's footnote.
      const check = await rpc(db, "ai_gst_screen_check", { p_from: from, p_to: today });
      const figures = {
        period_from: from, period_to: today, as_of: asOf,
        output_gst: Number(cur.output_gst), taxable_sales: Number(cur.revenue_net),
        last_month_output_gst: Number(prev.output_gst), last_month_from: last.from, last_month_to: last.to, tax_mode: ctx.taxMode,
        gstr3b_gst: Number(check.screen_gst), bill_rounding: Number(check.bill_rounding),
        gstr3b_books_gst: Number(check.books_gst), gstr3b_bill_count: Number(check.bill_count),
      };
      const failed = gstScreenChecks(figures);
      if (failed.length) console.warn("[ai-ask] gst footnote checks failed:", failed.join(","));
      return {
        figures,
        params: { from, to: today },
        empty: Number(cur.output_gst) === 0 && Number(cur.revenue_net) === 0 && Number(prev.output_gst) === 0,
      };
    }
    case "gst_gaps": {
      const from = lastMonth(today).from;
      const f = await rpc(db, "ai_gst_data_gaps", { p_from: from, p_to: today });
      return {
        figures: f,
        params: { from, to: today },
        empty: f.purchases_total === 0 && f.sale_lines_total === 0 && f.products_total === 0,
      };
    }
    case "purchases_month": {
      // Ties to the Purchase Register's Invoice Value and Bills for the same dates.
      const from = monthStart(today);
      const p = sameDaysLastMonth(today);
      const cur = await rpc(db, "ai_purchases_summary", { p_from: from, p_to: today });
      const prev = await rpc(db, "ai_purchases_summary", { p_from: p.from, p_to: p.to });
      const value = Number(cur.total_value);
      const prior = Number(prev.total_value);
      return {
        figures: {
          ...cur, total_value: value,
          previous_value: prior, previous_bill_count: prev.bill_count, previous_from: p.from, previous_to: p.to,
          change_pct: changePct(value, prior),
        },
        params: { from, to: today },
        empty: cur.bill_count === 0 && prev.bill_count === 0,
      };
    }
    case "supplier_dues": {
      const f = await rpc(db, "ai_supplier_dues", { p_limit: 10 });
      return { figures: f, params: { from: today, to: today }, empty: f.suppliers_owing === 0 };
    }
    case "top_suppliers": {
      const from = monthStart(today);
      const f = await rpc(db, "ai_top_suppliers", { p_from: from, p_to: today, p_limit: 10 });
      return { figures: f, params: { from, to: today }, empty: f.bill_count === 0 };
    }
    case "cost_up": {
      const f = await rpc(db, "ai_cost_up", { p_days: 90, p_limit: 10 });
      return { figures: f, params: { from: f.period_from, to: today }, empty: f.items_up === 0 };
    }
    // ── expenses ──────────────────────────────────────────────────────────
    // All three read ai_expense_summary: the rows get_pl_ranged counts as
    // expenses, so `total` is the expenses line of profit_month for the same
    // dates. Owner drawings (exclude_from_pl) come back apart, never in total.
    case "expenses_month": {
      const from = monthStart(today);
      const p = sameDaysLastMonth(today);
      const cur = await expenseSummary(db, from, today, 1);
      const prev = await expenseSummary(db, p.from, p.to, 1);
      const total = Number(cur.total);
      const prior = Number(prev.total);
      return {
        figures: {
          period_from: from, period_to: today, as_of: asOf,
          total, entry_count: Number(cur.entry_count),
          categories: cur.categories.slice(0, EXPENSE_CATEGORIES_SHOWN), category_count: Number(cur.category_count),
          drawings_total: Number(cur.drawings_total), drawings_count: Number(cur.drawings_count),
          previous_total: prior, previous_entry_count: Number(prev.entry_count),
          previous_from: p.from, previous_to: p.to, change_pct: changePct(total, prior),
        },
        params: { from, to: today },
        empty: Number(cur.entry_count) === 0 && Number(prev.entry_count) === 0 && Number(cur.drawings_count) === 0,
      };
    }
    case "top_expenses": {
      const from = monthStart(today);
      const cur = await expenseSummary(db, from, today, 10);
      return {
        figures: {
          period_from: from, period_to: today, as_of: asOf,
          total: Number(cur.total), entry_count: Number(cur.entry_count),
          entries: cur.entries.map((e: any) => ({ ...e, amount: Number(e.amount) })),
          drawings_total: Number(cur.drawings_total), drawings_count: Number(cur.drawings_count),
        },
        params: { from, to: today },
        empty: Number(cur.entry_count) === 0,
      };
    }
    case "expenses_vs_last": {
      const from = monthStart(today);
      const p = sameDaysLastMonth(today);
      const cur = await expenseSummary(db, from, today, 1);
      const prev = await expenseSummary(db, p.from, p.to, 1);
      const total = Number(cur.total);
      const prior = Number(prev.total);
      // The function lists up to 50 categories. A comparison over a cut list
      // would invent zeros, so a cut list is a failed read, never a guess.
      for (const x of [cur, prev]) {
        if (Number(x.category_count) > x.categories.length) throw new ReadFailed("ai_expense_summary: category list cut");
      }
      const rows = compareCategories(cur.categories, prev.categories);
      return {
        figures: {
          period_from: from, period_to: today, as_of: asOf,
          total, entry_count: Number(cur.entry_count),
          previous_total: prior, previous_entry_count: Number(prev.entry_count),
          previous_from: p.from, previous_to: p.to,
          change: round2(total - prior), change_pct: changePct(total, prior),
          categories: rows.slice(0, EXPENSE_CATEGORIES_SHOWN), category_count: rows.length,
          categories_up: rows.filter((r) => r.change > 0).length,
          categories_down: rows.filter((r) => r.change < 0).length,
        },
        params: { from, to: today },
        empty: Number(cur.entry_count) === 0 && Number(prev.entry_count) === 0,
      };
    }
    // ── dues and cash (ask-dues-cash) ──────────────────────────────────────
    case "dues_overdue": {
      // Ties to the Customer Aging report's 61-90, 91-120 and 120+ columns.
      const f = await rpc(db, "ai_dues_over_60", { p_limit: 10 });
      // The edges of the card's age rows, so "more than 120 days" may be said.
      return { figures: { ...f, age_bounds: [60, 90, 120] }, params: { from: today, to: today }, empty: f.bills_over === 0 };
    }
    case "credit_sales_month": {
      // Ties to the Business Report's CREDIT bar for the same dates.
      const from = monthStart(today);
      const f = await rpc(db, "ai_credit_sales", { p_from: from, p_to: today });
      return { figures: f, params: { from, to: today }, empty: f.credit_bills === 0 && Number(f.other_open) === 0 };
    }
    case "cash_today": {
      // Ties to the Day Book for today, or says the exact gap and why.
      const f = await rpc(db, "ai_cash_today");
      return {
        figures: f,
        params: { from: today, to: today },
        empty: Number(f.money_in) === 0 && Number(f.money_out) === 0 && Number(f.daybook_in) === 0 && Number(f.daybook_out) === 0,
      };
    }
    case "payment_mix_month": {
      // Ties to the Business Report's Billed vs Collected, billed per method.
      const from = monthStart(today);
      const f = await rpc(db, "ai_payment_mix", { p_from: from, p_to: today });
      return { figures: f, params: { from, to: today }, empty: f.bill_count === 0 };
    }
    // ── sales and stock, second set (branch ask-sales-stock) ──────────────
    case "sales_vs_last_month": {
      // Month to date against the same dates last month, both by ai_sales_summary.
      const from = monthStart(today);
      const p = sameDaysLastMonth(today);
      const cur = await rpc(db, "ai_sales_summary", { p_from: from, p_to: today });
      const prev = await rpc(db, "ai_sales_summary", { p_from: p.from, p_to: p.to });
      return {
        figures: {
          period_from: from, period_to: today, as_of: cur.as_of,
          gross_sales: cur.gross_sales, bill_count: cur.bill_count, average_bill: cur.average_bill,
          previous_gross_sales: prev.gross_sales, previous_bill_count: prev.bill_count, previous_average_bill: prev.average_bill,
          previous_from: p.from, previous_to: p.to, change_pct: changePct(cur.gross_sales, prev.gross_sales),
        },
        params: { from, to: today },
        empty: cur.bill_count === 0 && prev.bill_count === 0,
      };
    }
    case "sales_week": {
      const from = mondayOf(today);
      const p = sameDaysLastWeek(from, today);
      const cur = await rpc(db, "ai_sales_by_day", { p_from: from, p_to: today });
      const prev = await rpc(db, "ai_sales_summary", { p_from: p.from, p_to: p.to });
      return {
        figures: {
          ...cur, previous_gross_sales: prev.gross_sales, previous_bill_count: prev.bill_count,
          previous_from: p.from, previous_to: p.to, change_pct: changePct(cur.gross_sales, prev.gross_sales),
        },
        params: { from, to: today },
        empty: cur.bill_count === 0 && prev.bill_count === 0,
      };
    }
    case "best_customers": {
      const from = monthStart(today);
      const f = await rpc(db, "ai_best_customers", { p_from: from, p_to: today, p_limit: 10 });
      return { figures: f, params: { from, to: today }, empty: f.bill_count === 0 };
    }
    case "returns_month": {
      const from = monthStart(today);
      const f = await rpc(db, "ai_sales_returns", { p_from: from, p_to: today, p_limit: 5 });
      return { figures: f, params: { from, to: today }, empty: f.return_count === 0 };
    }
    case "stock_value": {
      const f = await rpc(db, "ai_stock_value", { p_limit: 10 });
      return { figures: f, params: { from: today, to: today }, empty: f.products_total === 0 };
    }
    case "out_of_stock": {
      const f = await rpc(db, "ai_out_of_stock", { p_limit: 20 });
      return { figures: f, params: { from: today, to: today }, empty: f.items_out === 0 };
    }
    case "fast_movers_low": {
      const f = await rpc(db, "ai_fast_movers_low", { p_days: 30, p_top: 15, p_cover_days: 7, p_limit: 15 });
      return { figures: f, params: { from: f.period_from, to: today }, empty: f.top_count === 0 };
    }
    // ── end of the second sales and stock set ──────────────────────────────
    // ── GST: purchases, rough net, sales by rate ───────────────────────────
    case "gst_itc_month": {
      // Ties to the Purchase Register's Tax (ITC candidate) for the same dates.
      const from = monthStart(today);
      const f = await rpc(db, "ai_gst_input", { p_from: from, p_to: today });
      return { figures: f, params: { from, to: today }, empty: Number(f.bill_count) === 0 };
    }
    case "gst_net_month": {
      // Sales side as gst_collected reads it; purchase side as gst_itc_month.
      const from = monthStart(today);
      const cur = await pl(db, tenantId, from, today);
      const inp = await rpc(db, "ai_gst_input", { p_from: from, p_to: today });
      const check = await rpc(db, "ai_gst_screen_check", { p_from: from, p_to: today });
      const output = Number(cur.output_gst);
      const input = Number(inp.input_gst);
      const figures = {
        period_from: from, period_to: today, as_of: asOf, tax_mode: ctx.taxMode,
        output_gst: output, input_gst: input, net_estimate: Math.round((output - input) * 100) / 100,
        assumed_rate: Number(inp.assumed_rate), purchase_bill_count: Number(inp.bill_count),
        no_gstin_gst: Number(inp.no_gstin_gst), gstr3b_itc: Number(inp.gstr3b_itc),
        gstr3b_gst: Number(check.screen_gst), bill_rounding: Number(check.bill_rounding),
        gstr3b_books_gst: Number(check.books_gst), gstr3b_bill_count: Number(check.bill_count),
      };
      return {
        figures,
        params: { from, to: today },
        empty: output === 0 && input === 0 && Number(check.bill_count) === 0 && Number(inp.bill_count) === 0,
      };
    }
    case "gst_by_rate": {
      const from = monthStart(today);
      const f = await rpc(db, "ai_gst_by_rate", { p_from: from, p_to: today });
      // gst_collected's figure is this, less GST on returns: show both.
      const cur = await pl(db, tenantId, from, today);
      const output = Number(cur.output_gst);
      return {
        figures: { ...f, output_gst: output, returns_gst: Math.round((Number(f.sales_gst) - output) * 100) / 100 },
        params: { from, to: today },
        empty: Number(f.bill_count) === 0,
      };
    }
    // ── staff (ask-staff) ────────────────────────────────────────────────
    // All four tie to the Payroll screen's Attendance tab for the whole
    // calendar month, the window that tab shows. The link opens that month.
    case "payroll_month":
    case "salary_due": {
      const from = monthStart(today);
      const to = monthEnd(today);
      const f = await staffPay(db, from, to);
      return {
        figures: f,
        params: { from, to },
        empty: Number(f.staff_count) === 0 && Number(f.run_count) === 0,
      };
    }
    case "attendance_today": {
      const f = await rpc(db, "ai_staff_attendance_day", { p_day: today, p_limit: 30 });
      if (!f || !Array.isArray(f.staff)) throw new ReadFailed("ai_staff_attendance_day: no figures");
      return { figures: f, params: { from: monthStart(today), to: monthEnd(today) }, empty: Number(f.staff_count) === 0 };
    }
    case "attendance_month": {
      const from = monthStart(today);
      const to = monthEnd(today);
      const f = await rpc(db, "ai_staff_attendance_month", { p_from: from, p_to: to, p_limit: 20 });
      if (!f || !Array.isArray(f.staff)) throw new ReadFailed("ai_staff_attendance_month: no figures");
      return {
        figures: { ...f, staff: f.staff.filter((s: any) => Number(s.missed_days) > 0) },
        params: { from, to },
        empty: Number(f.staff_count) === 0 || Number(f.marked_days) === 0,
      };
    }
    // ── profit tips (ask-profit-tips) ──────────────────────────────────────
    case "profit_tips":
      return profitTips(db, today, asOf);
    default:
      throw new ReadFailed(`no reads for ${id}`);
  }
}

// ── profit tips helpers ────────────────────────────────────────────────────
/**
 * "How can I make more profit?" Facts from the shop's own books, each with
 * exact figures and the screen that shows them. The model only words
 * suggestions on top of these; the card shows them with or without it.
 *
 * Windows: items, dead stock and fast sellers over the last 30 days (the
 * dead_stock window, today - 30 to today); expenses and returns this month
 * to date, expenses against the same days last month.
 */
export const PROFIT_TIPS_SHOWN = 5;
// The Product Margins report's BREAK-EVEN tier: a margin from 0 up to 5%.
export const THIN_UNDER_PCT = 5;

async function profitTips(db: any, today: string, asOf: string): Promise<Run> {
  const from = addDays(today, -30);
  const mFrom = monthStart(today);
  const p = sameDaysLastMonth(today);
  const cost = await rpc(db, "ai_cost_up", { p_days: 90, p_limit: 10 });
  const ids = (cost?.items ?? []).map((i: any) => i.product_id).filter(Boolean);
  const margins = await rpc(db, "ai_item_margins", { p_from: from, p_to: today, p_limit: 5, p_product_ids: ids });
  const dead = await rpc(db, "ai_dead_stock", { p_days: 30, p_limit: 1 });
  const dues = await rpc(db, "ai_dues_over_60", { p_limit: 1 });
  const expNow = await expenseSummary(db, mFrom, today, 1);
  const expPrev = await expenseSummary(db, p.from, p.to, 1);
  // A comparison over a cut list would invent zeros: a failed read, never a guess.
  for (const x of [expNow, expPrev]) {
    if (Number(x.category_count) > x.categories.length) throw new ReadFailed("ai_expense_summary: category list cut");
  }
  const returns = await rpc(db, "ai_sales_returns", { p_from: mFrom, p_to: today, p_limit: 1 });
  const fast = await rpc(db, "ai_fast_movers_low", { p_days: 30, p_top: 15, p_cover_days: 7, p_limit: 1 });
  for (const [name, x, list] of [["ai_item_margins", margins, "loss"], ["ai_cost_up", cost, "items"], ["ai_dead_stock", dead, "items"],
    ["ai_dues_over_60", dues, "customers"], ["ai_sales_returns", returns, "items"], ["ai_fast_movers_low", fast, "items"]] as const) {
    if (!x || !Array.isArray(x[list])) throw new ReadFailed(`${name}: no figures`);
  }
  const figures = profitFindings({ today, from, mFrom, prev: p, asOf, margins, cost, dead, dues, expNow, expPrev, returns, fast });
  return { figures, params: { from, to: today }, empty: figures.findings.length === 0 };
}

const money2 = (n: unknown) => round2(Number(n ?? 0));

/**
 * The findings, ranked by rupee size (biggest first), at most
 * PROFIT_TIPS_SHOWN. A count finding (fast sellers running low) has no rupee
 * size and goes after every money one. Each finding names the screen that
 * shows its amount; `screen` is read by the card, never sent to the model.
 * Names that are people or free text go in top-level lists so the stand-in
 * pass swaps them: the customer in `customers`, the expense category in
 * `categories`. Product names stay, as on every other question.
 */
export function profitFindings(x: Record<string, any>) {
  const { today, from, mFrom, prev, asOf, margins, cost, dead, dues, expNow, expPrev, returns, fast } = x;
  const found: any[] = [];
  const customers: any[] = [];
  const categories: any[] = [];

  // Items sold below cost: the biggest loss on Product Margins for the dates.
  const loss = margins.loss?.[0];
  if (loss && Number(margins.loss_items) > 0) {
    found.push({
      key: "below_cost", amount: money2(-Number(loss.gross_profit)), kind: "money", screen: "reports_product_margins",
      product_name: loss.product_name, unit: loss.unit ?? null, units_sold: Number(loss.units_sold),
      avg_sell_price: money2(loss.avg_sell_price), revenue: money2(loss.revenue), cogs: money2(loss.cogs),
      gross_profit: money2(loss.gross_profit), margin_pct: Number(loss.margin_pct), items: Number(margins.loss_items),
    });
  }
  // The thinnest margin: the biggest seller in the BREAK-EVEN tier.
  const thin = margins.thin?.[0];
  if (thin && Number(margins.thin_items) > 0) {
    found.push({
      key: "thin_margin", amount: money2(thin.revenue), kind: "money", screen: "reports_product_margins",
      product_name: thin.product_name, unit: thin.unit ?? null, units_sold: Number(thin.units_sold),
      avg_sell_price: money2(thin.avg_sell_price), revenue: money2(thin.revenue), cogs: money2(thin.cogs),
      gross_profit: money2(thin.gross_profit), margin_pct: Number(thin.margin_pct), items: Number(margins.thin_items),
      under_pct: THIN_UNDER_PCT,
    });
  }
  // Purchase cost rose and the list price did not keep up: the list price now
  // leaves under THIN_UNDER_PCT over the new cost. Only items sold in the 30
  // days, so their sales are on Product Margins; the biggest seller first.
  const sold = new Map((margins.picked ?? []).map((r: any) => [r.product_id, r]));
  const squeezed = (cost.items ?? [])
    .map((c: any) => ({ c, m: sold.get(c.product_id) as any }))
    .filter(({ c, m }: any) => m && Number(m.selling_price) > 0
      && (Number(m.selling_price) - Number(c.new_cost)) / Number(m.selling_price) * 100 < THIN_UNDER_PCT)
    .sort((a: any, b: any) => Number(b.m.revenue) - Number(a.m.revenue) || String(a.c.product_name).localeCompare(String(b.c.product_name)));
  if (squeezed.length) {
    const { c, m } = squeezed[0];
    found.push({
      key: "cost_up", amount: money2(m.revenue), kind: "money", screen: "reports_product_margins",
      product_name: c.product_name, unit: c.unit ?? null, old_cost: money2(c.old_cost), new_cost: money2(c.new_cost),
      pct_rise: Number(c.pct_rise), selling_price: money2(m.selling_price), revenue: money2(m.revenue),
      units_sold: Number(m.units_sold), items: squeezed.length, under_pct: THIN_UNDER_PCT,
    });
  }
  // Money stuck in stock with no sale for 30 days.
  if (Number(dead.items_dead) > 0) {
    const top = dead.items[0];
    found.push({
      key: "dead_stock", amount: money2(dead.value_stuck), kind: "money", screen: "reports_inventory_dead",
      items: Number(dead.items_dead), since: dead.period_from,
      product_name: top?.product_name ?? null, top_value: top ? money2(top.value) : null,
    });
  }
  // Customer money unpaid for over 60 days.
  if (Number(dues.bills_over) > 0) {
    const top = dues.customers[0];
    if (top) customers.push({ name: top.name, amount_over: money2(top.amount_over), oldest_days: Number(top.oldest_days) });
    found.push({
      key: "dues_over_60", amount: money2(dues.total_over), kind: "money", screen: "reports_customer_aging", over_days: 60,
      customers_over: Number(dues.customers_over), bills_over: Number(dues.bills_over), oldest_days: Number(dues.oldest_days),
      aged_61_90: money2(dues.aged_61_90), aged_91_120: money2(dues.aged_91_120), aged_over_120: money2(dues.aged_over_120),
    });
  }
  // The expense category up most on the same days last month.
  const up = compareCategories(expNow.categories, expPrev.categories).find((r) => r.change > 0);
  if (up) {
    categories.push({ category: up.category, amount: up.amount, previous_amount: up.previous_amount, change: up.change });
    found.push({
      key: "expense_up", amount: money2(up.change), kind: "money", screen: "reports_expenses",
      this_amount: money2(up.amount), previous_amount: money2(up.previous_amount),
      month_from: mFrom, month_to: today, previous_from: prev.from, previous_to: prev.to,
    });
  }
  // Returns this month.
  if (Number(returns.return_count) > 0) {
    const top = returns.items[0];
    found.push({
      key: "returns", amount: money2(returns.returns_total), kind: "money", screen: "sales",
      return_count: Number(returns.return_count), month_from: mFrom, month_to: today,
      product_name: top?.product_name ?? null, top_value: top ? money2(top.value) : null,
      all_return_count: Number(returns.all_return_count), all_returns_total: money2(returns.all_returns_total),
    });
  }
  // Best sellers running low: sales at risk, counted in items, not rupees.
  if (Number(fast.items_low) > 0) {
    const top = fast.items[0];
    found.push({
      key: "fast_low", amount: Number(fast.items_low), kind: "count", screen: "reports_product_movement",
      top_n: Number(fast.top_n), cover_days: Number(fast.cover_days),
      product_name: top?.product_name ?? null, days_left: top ? Number(top.days_left) : null,
    });
  }

  const order = ["below_cost", "dues_over_60", "dead_stock", "thin_margin", "cost_up", "expense_up", "returns", "fast_low"];
  found.sort((a, b) => (a.kind === "count" ? 1 : 0) - (b.kind === "count" ? 1 : 0)
    || (a.kind === "count" ? 0 : b.amount - a.amount) || order.indexOf(a.key) - order.indexOf(b.key));
  const findings = found.slice(0, PROFIT_TIPS_SHOWN);
  const keep = new Set(findings.map((f) => f.key));
  return {
    period_from: from, period_to: today, as_of: asOf,
    findings, findings_found: found.length,
    customers: keep.has("dues_over_60") ? customers : [],
    categories: keep.has("expense_up") ? categories : [],
  };
}

// ── staff helpers ──────────────────────────────────────────────────────────
/**
 * ai_staff_pay, less the salary-expense cross-check: that figure belongs to the
 * Expenses report, not the Payroll screen the card links to, so it never
 * reaches the card or the model. A gap between the two is logged, not shown.
 */
async function staffPay(db: any, from: string, to: string) {
  const f = await rpc(db, "ai_staff_pay", { p_from: from, p_to: to, p_limit: 20 });
  if (!f || !Array.isArray(f.staff) || !Array.isArray(f.due_staff)) throw new ReadFailed("ai_staff_pay: no figures");
  const { salary_expenses, salary_expense_count: _n, ...rest } = f;
  if (Math.abs(Number(salary_expenses) - Number(f.paid_total)) >= 0.01) {
    console.warn("[ai-ask] pay runs and salary expenses differ:", Number(f.paid_total), Number(salary_expenses));
  }
  return rest;
}

// ── expenses helpers ───────────────────────────────────────────────────────
export const EXPENSE_CATEGORIES_SHOWN = 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

async function expenseSummary(db: any, from: string, to: string, limit: number) {
  const f = await rpc(db, "ai_expense_summary", { p_from: from, p_to: to, p_limit: limit });
  if (!f || !Array.isArray(f.categories) || !Array.isArray(f.entries)) throw new ReadFailed("ai_expense_summary: no figures");
  return f;
}

/**
 * Every category in either period, with this period, last period and the
 * change, ranked by the biggest increase first. A category with no entries in
 * one period has 0 there; change_pct is null without a positive base.
 */
export function compareCategories(cur: any[], prev: any[]) {
  const by = new Map<string, { category: string; amount: number; previous_amount: number }>();
  for (const c of cur) by.set(c.category, { category: c.category, amount: Number(c.amount), previous_amount: 0 });
  for (const c of prev) {
    const row = by.get(c.category) ?? { category: c.category, amount: 0, previous_amount: 0 };
    row.previous_amount = Number(c.amount);
    by.set(c.category, row);
  }
  return [...by.values()]
    .map((r) => ({ ...r, change: round2(r.amount - r.previous_amount), change_pct: changePct(r.amount, r.previous_amount) }))
    .sort((a, b) => b.change - a.change || b.amount - a.amount || a.category.localeCompare(b.category));
}
