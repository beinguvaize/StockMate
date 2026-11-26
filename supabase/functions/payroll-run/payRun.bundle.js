// src/lib/reportPeriods.js
var iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
var parseISO = (s) => {
  const parts = String(s).split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return /* @__PURE__ */ new Date(NaN);
  const [y, m, d] = parts;
  return new Date(y, m - 1, d);
};

// src/lib/monthlyPay.js
var num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
function cycleDays(payType, to) {
  if (String(payType || "").toUpperCase() === "WEEKLY") return 7;
  const end = parseISO(to);
  if (Number.isNaN(end.getTime())) return 30;
  return new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
}
var LOP_WEIGHT = { ABSENT: 1, HALF_DAY: 0.5, PRESENT: 0, OT: 0 };
function periodDays(from, to) {
  const a = parseISO(from);
  const b = parseISO(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  const days = Math.round((b - a) / 864e5) + 1;
  return days > 0 ? days : 0;
}
function lopDays(days = {}, from, to) {
  return Object.entries(days || {}).reduce((sum, [d, a]) => {
    if (d < from || d > to) return sum;
    return sum + (LOP_WEIGHT[a?.status] || 0);
  }, 0);
}
function salariedBasePay({ salary, payType = "MONTHLY", from, to, days } = {}) {
  const gross = num(salary);
  const total = periodDays(from, to);
  const lost = lopDays(days, from, to);
  const cycle = cycleDays(payType, to);
  if (gross <= 0 || total <= 0 || cycle <= 0) {
    return {
      salary: gross,
      payType,
      periodDays: total,
      cycleDays: cycle,
      lopDays: lost,
      perDay: 0,
      lopAmount: 0,
      basePay: 0
    };
  }
  const perDay = gross / cycle;
  const payable = Math.max(0, total - lost);
  const basePay = Math.round(perDay * payable);
  const lopAmount = Math.min(Math.round(perDay * total), Math.round(perDay * lost));
  return {
    salary: gross,
    payType,
    periodDays: total,
    cycleDays: cycle,
    lopDays: lost,
    perDay,
    lopAmount,
    basePay
  };
}

// src/lib/payrollPeriods.js
function parsePeriod(period) {
  const s = String(period || "").trim();
  if (s.includes("/")) {
    const [from, to] = s.split("/");
    const f = parseISO(from), t = parseISO(to);
    if (Number.isNaN(f.getTime()) || Number.isNaN(t.getTime())) return null;
    return t < f ? { from: iso(t), to: iso(f) } : { from: iso(f), to: iso(t) };
  }
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]);
    if (mo < 1 || mo > 12) return null;
    return { from: iso(new Date(y, mo - 1, 1)), to: iso(new Date(y, mo, 0)) };
  }
  return null;
}
function overlaps(a, b) {
  if (!a || !b) return false;
  return a.from <= b.to && b.from <= a.to;
}
function findOverlapping(period, records = [], { excludeId } = {}) {
  const target = parsePeriod(period);
  if (!target) return [];
  return (records || []).filter((r) => r && !r.deleted_at && r.id !== excludeId).filter((r) => {
    const p = parsePeriod(r.period);
    return p === null ? true : overlaps(target, p);
  });
}
function needsOverlapConfirmation(items = [], overlappingRuns = []) {
  if (!overlappingRuns || overlappingRuns.length === 0) return false;
  return (items || []).some((i) => Number(i?.netPay || 0) > 0 && !(Number(i?.alreadyPaid || 0) > 0));
}
function paidForWindow({ from, to, employeeId, records = [] } = {}) {
  if (!from || !to || !employeeId) return 0;
  const wFrom = parseISO(from), wTo = parseISO(to);
  if (Number.isNaN(wFrom.getTime()) || Number.isNaN(wTo.getTime())) return 0;
  const dayCount = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5) + 1;
  let total = 0;
  for (const r of records || []) {
    if (!r || r.deleted_at) continue;
    const p = parsePeriod(r.period);
    if (!p) continue;
    const lo = p.from > from ? p.from : from;
    const hi = p.to < to ? p.to : to;
    if (lo > hi) continue;
    const item = (r.items || []).find((i) => i.employeeId === employeeId);
    const net = Number(item?.netPay || 0);
    if (net <= 0) continue;
    const runDays = dayCount(p.from, p.to);
    const shared = dayCount(lo, hi);
    if (runDays <= 0 || shared <= 0) continue;
    total += shared >= runDays ? net : net * (shared / runDays);
  }
  return Math.round(total);
}

// src/lib/statutory.js
var num2 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
var rupees = (v) => Math.round(v);
var rupeesUp = (v) => Math.ceil(v);
var EPF_WAGE_CEILING = 15e3;
var EPF_EMPLOYEE_RATE = 0.12;
var ESI_WAGE_LIMIT = 21e3;
var ESI_EMPLOYEE_RATE = 75e-4;
function epfEmployee({ epfWage, onFullWage = false } = {}) {
  const wage = num2(epfWage);
  if (wage <= 0) return 0;
  const base = onFullWage ? wage : Math.min(wage, EPF_WAGE_CEILING);
  return rupees(base * EPF_EMPLOYEE_RATE);
}
function esiEmployee({ gross, inContributionPeriod = false } = {}) {
  const g = num2(gross);
  if (g <= 0) return 0;
  if (g > ESI_WAGE_LIMIT && !inContributionPeriod) return 0;
  return rupeesUp(g * ESI_EMPLOYEE_RATE);
}
var PT_ANNUAL_CAP = 2500;
var PT_TABLES = {
  // [ceiling, amount] — first row whose ceiling the income does not exceed.
  KERALA: { basis: "HALF_YEARLY", slabs: [
    [11999, 0],
    [17999, 120],
    [29999, 180],
    [44999, 300],
    [59999, 450],
    [74999, 600],
    [99999, 750],
    [124999, 1e3],
    [Infinity, 1250]
  ] },
  TAMIL_NADU: { basis: "HALF_YEARLY", slabs: [
    [21e3, 0],
    [3e4, 135],
    [45e3, 315],
    [6e4, 690],
    [75e3, 1025],
    [Infinity, 1250]
  ] },
  MAHARASHTRA: { basis: "MONTHLY", slabs: [[7500, 0], [1e4, 175], [Infinity, 200]] },
  KARNATAKA: { basis: "MONTHLY", slabs: [[24999, 0], [Infinity, 200]] },
  GUJARAT: { basis: "MONTHLY", slabs: [[12e3, 0], [Infinity, 200]] },
  WEST_BENGAL: { basis: "MONTHLY", slabs: [
    [1e4, 0],
    [15e3, 110],
    [25e3, 130],
    [4e4, 150],
    [Infinity, 200]
  ] },
  ANDHRA_PRADESH: { basis: "MONTHLY", slabs: [[15e3, 0], [2e4, 150], [Infinity, 200]] },
  TELANGANA: { basis: "MONTHLY", slabs: [[15e3, 0], [2e4, 150], [Infinity, 200]] },
  MADHYA_PRADESH: { basis: "MONTHLY", slabs: [[18750, 0], [25e3, 125], [33333, 167], [Infinity, 208]] },
  ODISHA: { basis: "MONTHLY", slabs: [[13304, 0], [25e3, 125], [Infinity, 200]] },
  ASSAM: { basis: "MONTHLY", slabs: [[1e4, 0], [15e3, 150], [25e3, 180], [Infinity, 208]] },
  BIHAR: { basis: "ANNUAL", slabs: [
    [3e5, 0],
    [5e5, 1e3],
    [1e6, 2e3],
    [Infinity, 2500]
  ] },
  // States that levy no professional tax. Listed so the app can SAY so rather
  // than look like it is missing a table.
  DELHI: { none: true },
  HARYANA: { none: true },
  UTTAR_PRADESH: { none: true },
  RAJASTHAN: { none: true },
  CHANDIGARH: { none: true },
  ARUNACHAL_PRADESH: { none: true },
  GOA: { none: true },
  ANDAMAN_AND_NICOBAR: { none: true }
};
var ptKey = (state) => String(state || "").trim().toUpperCase().replace(/[\s-]+/g, "_").replace(/&/g, "AND");
var PT_STATES = Object.keys(PT_TABLES).map((k) => ({
  key: k,
  label: k.replace(/_/g, " ").replace(/\bAND\b/g, "&"),
  levies: !PT_TABLES[k].none
})).sort((a, b) => a.label.localeCompare(b.label));
function professionalTax({ state, monthlyGross } = {}) {
  const key = ptKey(state);
  const table = PT_TABLES[key];
  if (!table) return null;
  const label = key.replace(/_/g, " ").replace(/\bAND\b/g, "&");
  if (table.none) {
    return {
      applicable: false,
      reason: "STATE_DOES_NOT_LEVY",
      state: key,
      stateLabel: label,
      monthly: 0
    };
  }
  const monthly = num2(monthlyGross);
  if (monthly <= 0) {
    return { applicable: true, state: key, stateLabel: label, basis: table.basis, monthly: 0 };
  }
  const assessed = table.basis === "HALF_YEARLY" ? monthly * 6 : table.basis === "ANNUAL" ? monthly * 12 : monthly;
  const row = table.slabs.find(([ceiling]) => assessed <= ceiling);
  const charge = row ? row[1] : 0;
  const perMonth = table.basis === "HALF_YEARLY" ? charge / 6 : table.basis === "ANNUAL" ? charge / 12 : charge;
  const capped = Math.min(perMonth, PT_ANNUAL_CAP / 12);
  return {
    applicable: true,
    state: key,
    stateLabel: label,
    basis: table.basis,
    charge,
    // as the state assesses it
    monthly: rupees(capped),
    halfYearly: table.basis === "HALF_YEARLY" ? charge : rupees(capped * 6),
    annual: rupees(capped * 12)
  };
}
function statutoryDeductions({ gross, basic, config = {} } = {}) {
  const lines = [];
  const g = num2(gross);
  const b = num2(basic) || g;
  if (config.epf) {
    const amount = epfEmployee({ epfWage: b, onFullWage: !!config.epfOnFullWage });
    if (amount > 0) {
      lines.push({
        label: "Provident fund",
        note: config.epfOnFullWage ? "12% of wages" : `12% of ${Math.min(b, EPF_WAGE_CEILING).toLocaleString("en-IN")}`,
        amount,
        statutory: true
      });
    }
  }
  if (config.esi) {
    const amount = esiEmployee({ gross: g, inContributionPeriod: !!config.esiInPeriod });
    if (amount > 0) lines.push({ label: "ESI", note: "0.75% of gross", amount, statutory: true });
  }
  if (config.professionalTaxState) {
    const pt = professionalTax({ state: config.professionalTaxState, monthlyGross: g });
    if (pt && pt.applicable && pt.monthly > 0) {
      const note = pt.basis === "HALF_YEARLY" ? `${pt.stateLabel} \xB7 \u20B9${pt.charge.toLocaleString("en-IN")} half-yearly` : pt.basis === "ANNUAL" ? `${pt.stateLabel} \xB7 \u20B9${pt.charge.toLocaleString("en-IN")} a year` : `${pt.stateLabel} \xB7 monthly slab`;
      lines.push({ label: "Professional tax", note, amount: pt.monthly, statutory: true });
    }
  }
  const tds = rupees(num2(config.tdsMonthly));
  if (tds > 0) {
    lines.push({ label: "TDS", note: "As advised", amount: tds, statutory: true });
  }
  return lines;
}

// src/lib/payRun.js
var up = (v) => String(v || "").toUpperCase();
var num3 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
var ATTENDANCE_MARKS = ["PRESENT", "HALF_DAY", "LEAVE", "SICK", "ABSENT"];
var WORKED_WEIGHT = { PRESENT: 1, HALF_DAY: 0.5, OT: 1 };
var isDayRate = (payType) => ["DAILY", "HOURLY"].includes(up(payType));
var isOnLeave = (employee) => up(employee?.status) === "ON_LEAVE";
var isActive = (employee) => up(employee?.status) === "ACTIVE";
var inWindow = (day, from, to) => day >= from && day <= to;
function markCounts(days = {}, from, to) {
  const out = { present: 0, halfDay: 0, leave: 0, sick: 0, absent: 0, worked: 0 };
  for (const [day, a] of Object.entries(days || {})) {
    if (!inWindow(day, from, to)) continue;
    const s = up(a?.status);
    if (s === "PRESENT" || s === "OT") out.present += 1;
    else if (s === "HALF_DAY") out.halfDay += 1;
    else if (s === "LEAVE") out.leave += 1;
    else if (s === "SICK") out.sick += 1;
    else if (s === "ABSENT") out.absent += 1;
    out.worked += WORKED_WEIGHT[s] || 0;
  }
  return out;
}
function dayRateWage(days = {}, defaultRate, from, to) {
  let total = 0;
  for (const [day, a] of Object.entries(days || {})) {
    if (!inWindow(day, from, to)) continue;
    const weight = WORKED_WEIGHT[up(a?.status)] || 0;
    const rate = a?.custom_rate != null ? num3(a.custom_rate) : num3(defaultRate);
    total += weight * rate;
  }
  return total;
}
function monthOf(dateISO) {
  const [y, m] = String(dateISO).split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}
function leaveUse({ days = {}, to, allowed } = {}) {
  const limit = Math.max(0, Math.floor(num3(allowed)));
  if (!to) return { used: 0, allowed: limit, exceeded: false, over: 0 };
  const month = monthOf(to);
  const used = markCounts(days, month.from, month.to).leave;
  const over = limit > 0 ? Math.max(0, used - limit) : 0;
  return { used, allowed: limit, exceeded: over > 0, over };
}
function netOf(item) {
  const net = num3(item.basePay) + num3(item.overtime) + num3(item.commission) + num3(item.bonus) - num3(item.deductions) - num3(item.alreadyPaid) - num3(item.statutoryTotal);
  return Math.max(0, Math.round(net));
}
function payRunItem({ employee, days = {}, from, to, records = [], adjust = {} } = {}) {
  const emp = employee || {};
  const payType = emp.pay_type || emp.payType;
  const dayRate = isDayRate(payType);
  const counts = markCounts(days, from, to);
  const salaried = dayRate ? null : salariedBasePay({
    salary: num3(emp.salary) || num3(emp.basePay),
    payType,
    from,
    to,
    days
  });
  const basePay = dayRate ? Math.round(dayRateWage(days, emp.daily_rate ?? emp.dailyRate, from, to)) : salaried.basePay;
  const alreadyPaid = paidForWindow({ from, to, employeeId: emp.id, records });
  const statutoryLines = statutoryDeductions({
    gross: basePay,
    basic: basePay,
    config: {
      epf: !!emp.epf_enabled,
      epfOnFullWage: !!emp.epf_on_full_wage,
      esi: !!emp.esi_enabled,
      professionalTaxState: emp.professional_tax_state || null,
      tdsMonthly: num3(emp.tds_monthly)
    }
  });
  const statutoryTotal = Math.round(statutoryLines.reduce((t, l) => t + l.amount, 0));
  const leave = dayRate ? { used: counts.leave, allowed: 0, exceeded: false, over: 0 } : leaveUse({ days, to, allowed: emp.paid_leave_per_month ?? emp.paidLeavePerMonth });
  const item = {
    employeeId: emp.id,
    employeeName: emp.name,
    department: emp.department,
    payType,
    daysWorked: dayRate ? counts.worked : null,
    dailyRate: num3(emp.daily_rate ?? emp.dailyRate),
    basePay,
    salary: salaried ? salaried.salary : null,
    lopDays: salaried ? salaried.lopDays : null,
    lopAmount: salaried ? salaried.lopAmount : null,
    periodDays: salaried ? salaried.periodDays : null,
    cycleDays: salaried ? salaried.cycleDays : null,
    alreadyPaid,
    statutoryLines,
    statutoryTotal,
    // The three additions. Counts only; none of them changes basePay.
    leaveDays: counts.leave,
    sickDays: counts.sick,
    leaveUsed: leave.used,
    leaveAllowed: leave.allowed,
    leaveExceeded: leave.exceeded,
    onLeave: isOnLeave(emp),
    overtime: num3(adjust.overtime),
    commission: num3(adjust.commission),
    bonus: num3(adjust.bonus),
    deductions: num3(adjust.deductions)
  };
  item.netPay = netOf(item);
  return item;
}
function payRunTotals(items = []) {
  const sum = (k) => items.reduce((t, i) => t + num3(i[k]), 0);
  return {
    totalBase: sum("basePay"),
    totalNet: sum("netPay"),
    totalOvertime: sum("overtime"),
    totalCommission: sum("commission"),
    totalBonus: sum("bonus"),
    totalDeductions: sum("deductions")
  };
}
function buildPayRun({
  employees = [],
  attendance = {},
  records = [],
  from,
  to,
  includeOnLeave = [],
  adjustments = {}
} = {}) {
  const switchedIn = new Set(includeOnLeave || []);
  const line = (emp) => payRunItem({
    employee: emp,
    days: attendance[emp.id],
    from,
    to,
    records,
    adjust: adjustments[emp.id]
  });
  const items = [];
  const held = [];
  for (const emp of employees || []) {
    if (isActive(emp)) items.push(line(emp));
    else if (isOnLeave(emp)) (switchedIn.has(emp.id) ? items : held).push(line(emp));
  }
  return { from, to, items, held, ...payRunTotals(items) };
}
export {
  ATTENDANCE_MARKS,
  buildPayRun,
  findOverlapping,
  needsOverlapConfirmation,
  netOf,
  parsePeriod
};
