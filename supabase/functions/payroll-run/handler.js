// payroll-run: costs a pay run for the phone with the same rules the web uses.
//
// Read-only. It works out who is owed what for a set of dates and hands it
// back; nothing is saved here. Saving is process_payroll_run in the database,
// which both apps call. Every read runs with the caller's own sign-in, so the
// database's access rules decide which shop's staff they can see.
//
// Free of Deno and npm imports so it can be tested.
import { buildPayRun, findOverlapping, needsOverlapConfirmation } from "./payRun.bundle.js";

export const CONTRACT_VERSION = 1;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 1000;

const pad = (n) => String(n).padStart(2, "0");
const realDay = (s) => {
  if (!DAY.test(String(s))) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
};
const monthStart = (day) => `${day.slice(0, 7)}-01`;
const monthEnd = (day) => {
  const [y, m] = day.split("-").map(Number);
  return `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
};
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/** A whole calendar month is stored as 'YYYY-MM', anything else as 'from/to' — the web's own rule. */
export const periodFor = (from, to) =>
  from === monthStart(from) && to === monthEnd(from) ? from.slice(0, 7) : `${from}/${to}`;

/** Every row of a query, not just the first thousand the API returns by default. */
async function readAll(build) {
  const rows = [];
  for (let at = 0; ; at += PAGE) {
    const { data, error } = await build().range(at, at + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return rows;
  }
}

export async function handle(req, deps) {
  const reply = (status, body) =>
    new Response(JSON.stringify({ contract_version: CONTRACT_VERSION, ...body }), {
      status, headers: { ...deps.cors, "Content-Type": "application/json" },
    });
  const refuse = (status, reason, message) => reply(status, { error: reason, reason, message });

  if (req.method === "OPTIONS") return new Response("ok", { headers: deps.cors });
  if (req.method !== "POST") return refuse(405, "method_not_allowed", "Use POST.");

  const auth = req.headers.get("Authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return refuse(401, "not_signed_in", "Sign in again.");

  let body;
  try { body = await req.json(); } catch { return refuse(400, "bad_request", "The request could not be read."); }
  const { tenant_id: tenantId, from, to } = body || {};
  const includeOnLeave = Array.isArray(body?.include_on_leave) ? body.include_on_leave.map(String) : [];
  const adjustments = body?.adjustments && typeof body.adjustments === "object" ? body.adjustments : {};

  if (!UUID.test(String(tenantId || ""))) return refuse(400, "bad_request", "Shop is missing.");
  if (!realDay(from) || !realDay(to)) return refuse(400, "bad_dates", "Choose a start and an end date.");
  if (to < from) return refuse(400, "bad_dates", "The end date is before the start date.");
  if (daysBetween(from, to) > 366) return refuse(400, "bad_dates", "A pay run can cover at most a year.");

  const db = deps.db(auth);
  try {
    // Attendance is read back to the 1st of the end date's month as well: the
    // leave allowance is counted over that whole month, not just the run's days.
    const attFrom = from < monthStart(to) ? from : monthStart(to);
    const [employees, marks, records] = await Promise.all([
      readAll(() => db.from("employees").select("*")
        .eq("tenant_id", tenantId).is("deleted_at", null).order("name").order("id")),
      readAll(() => db.from("attendance").select("employee_id, day, status, custom_rate")
        .eq("tenant_id", tenantId).is("deleted_at", null)
        .gte("day", attFrom).lte("day", to).order("day").order("employee_id")),
      readAll(() => db.from("payroll").select("id, period, items, total_net, processed_at, deleted_at")
        .eq("tenant_id", tenantId).is("deleted_at", null).order("created_at", { ascending: false }).order("id")),
    ]);

    const attendance = {};
    for (const m of marks) {
      (attendance[m.employee_id] ||= {})[String(m.day).slice(0, 10)] = { status: m.status, custom_rate: m.custom_rate };
    }

    const run = buildPayRun({ employees, attendance, records, from, to, includeOnLeave, adjustments });
    const period = periodFor(from, to);
    const overlapping = findOverlapping(period, records);
    return reply(200, {
      period,
      run,
      already_paid_runs: overlapping.map((r) => ({
        id: r.id, period: r.period, total_net: Number(r.total_net || 0), processed_at: r.processed_at,
      })),
      // True only when a line would genuinely be paid twice. When earlier pay
      // has simply been taken off the amounts, there is nothing to agree to.
      must_confirm_already_paid: needsOverlapConfirmation(run.items, overlapping),
    });
  } catch (e) {
    console.error("payroll-run read failed:", e);
    return refuse(502, "read_failed", `Could not read the shop's payroll data: ${e?.message || e}`);
  }
}
