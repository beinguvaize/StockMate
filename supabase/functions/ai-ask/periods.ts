// Dates as 'YYYY-MM-DD' in the shop's timezone. Weeks start on Monday and the
// prior window is priorRange() in reportUtils.js: equal length, immediately before.

const DAY = 864e5;
const ms = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const toIso = (t: number) => new Date(t).toISOString().slice(0, 10);

export const shopToday = (now: Date, tz: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

export const addDays = (iso: string, n: number) => toIso(ms(iso) + n * DAY);
export const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
/** The last day of the date's month. */
export const monthEnd = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return toIso(Date.UTC(y, m, 0));
};
export const mondayOf = (iso: string) => addDays(iso, -((new Date(ms(iso)).getUTCDay() + 6) % 7));
export const lastMonth = (iso: string) => {
  const to = addDays(monthStart(iso), -1);
  return { from: monthStart(to), to };
};
export const priorWindow = (from: string, to: string) => {
  const days = Math.round((ms(to) - ms(from)) / DAY) + 1;
  const end = addDays(from, -1);
  return { from: addDays(end, -(days - 1)), to: end };
};

/** The same days of last week: Mon-Wed compares with last Mon-Wed. */
export const sameDaysLastWeek = (from: string, to: string) => ({ from: addDays(from, -7), to: addDays(to, -7) });

/** Percent change, one decimal. null when there is no positive base to compare with. */
export const changePct = (current: number, prior: number) =>
  prior > 0 ? Math.round(((current - prior) / prior) * 1000) / 10 : null;

/**
 * The same days of last month: 1-10 Nov compares with 1-10 Oct. When last
 * month is shorter (31 Mar against February) it stops at last month's end.
 */
export const sameDaysLastMonth = (today: string) => {
  const last = lastMonth(today);
  const day = Math.min(Number(today.slice(8, 10)), Number(last.to.slice(8, 10)));
  return { from: last.from, to: `${last.from.slice(0, 8)}${String(day).padStart(2, "0")}` };
};

// ── chat periods (ask-free-chat) ────────────────────────────────────────────
/** Days from `from` to `to`, both counted. */
export const daysSpanned = (from: string, to: string) => Math.round((ms(to) - ms(from)) / DAY) + 1;

/** The same day `n` months earlier, kept inside that month: 31 Dec less 13 months is 30 Nov. */
export const monthsBefore = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 - n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return toIso(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d, last)));
};

/**
 * The same days of the month before, for a range inside one calendar month:
 * 1-31 Oct compares with 1-30 Sep, each end kept inside the shorter month.
 */
export const sameDaysMonthBefore = (from: string, to: string) => {
  const prev = lastMonth(from);
  const lastDay = Number(prev.to.slice(8, 10));
  const at = (iso: string) => `${prev.from.slice(0, 8)}${String(Math.min(Number(iso.slice(8, 10)), lastDay)).padStart(2, "0")}`;
  return { from: at(from), to: at(to) };
};
