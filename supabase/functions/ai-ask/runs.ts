// Runs each question's reads with the caller's JWT. Dates are worked out here,
// so a client can never choose them. A failed read throws: it is never a zero.
import { addDays, changePct, lastMonth, mondayOf, monthStart, priorWindow, sameDaysLastWeek } from "./periods.ts";

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
          previous_net_profit: prior, change_pct: changePct(net, prior),
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
      return {
        figures: {
          period_from: from, period_to: today, as_of: asOf,
          output_gst: Number(cur.output_gst), taxable_sales: Number(cur.revenue_net),
          last_month_output_gst: Number(prev.output_gst), tax_mode: ctx.taxMode,
        },
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
    default:
      throw new ReadFailed(`no reads for ${id}`);
  }
}
