// Runs each question's reads with the caller's JWT. Dates are worked out here,
// so a client can never choose them. A failed read throws: it is never a zero.
import { gstScreenChecks } from "./cards.ts";
import { addDays, changePct, lastMonth, mondayOf, monthStart, priorWindow, sameDaysLastMonth, sameDaysLastWeek } from "./periods.ts";

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
    default:
      throw new ReadFailed(`no reads for ${id}`);
  }
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
