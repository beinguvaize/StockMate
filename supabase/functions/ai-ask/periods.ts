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
