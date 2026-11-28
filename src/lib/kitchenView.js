/**
 * Kitchen display, the rules behind what it shows (web redesign, approved
 * mockups kitchen-01 to 06). The page is thin; this is tested.
 *
 * A ticket moves NEW → PREPARING → READY → SERVED with one tap each, the same
 * status write as before. Nothing here touches a sale, stock or money: a
 * kitchen ticket is only a slip for the cooks.
 */

export const LATE_MIN = 15;
export const POLL_SECONDS = 8;

export const KSTATUS = {
  NEW:       { key: 'NEW',       label: 'New',       tone: 'warn', bar: 'var(--color-amber)', next: 'PREPARING', action: 'Start' },
  PREPARING: { key: 'PREPARING', label: 'Preparing', tone: 'info', bar: 'var(--color-info)',  next: 'READY',     action: 'Ready' },
  READY:     { key: 'READY',     label: 'Ready',     tone: 'good', bar: 'var(--color-good)',  next: 'SERVED',    action: 'Served' },
};
export const COLUMNS = ['NEW', 'PREPARING', 'READY'].map((k) => KSTATUS[k]);

/** Anything not known reads New (as today). */
export const ticketStatus = (tk) => KSTATUS[String(tk?.status || '').toUpperCase()] || KSTATUS.NEW;

/** Whole minutes since the ticket was made; never negative. */
export function ageMinutes(createdAt, now = Date.now()) {
  // new Date(null) is 1970, not invalid: a ticket with no time is 0m, not 29 million.
  const t = createdAt == null || createdAt === '' ? NaN : new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.round((now - t) / 60000));
}

export const isLate = (mins) => (Number(mins) || 0) >= LATE_MIN;

/** "#36" and "· T2"; no table, nothing (as today). */
export const ticketNo = (tk) => `#${tk?.ticket_no ?? ''}`;
export const tableLine = (tk) => (tk?.table_label ? `· T${tk.table_label}` : '');

/** Items grouped by kitchen station, in first-seen order; no station reads Kitchen. */
export function stationGroups(items) {
  const groups = [];
  const at = {};
  for (const it of items || []) {
    const st = it?.station || 'Kitchen';
    if (!(st in at)) { at[st] = groups.length; groups.push({ station: st, items: [] }); }
    groups[at[st]].items.push(it);
  }
  return groups;
}

/** Veg / non-veg / egg mark, or null. */
export function foodMark(type) {
  const t = String(type || '');
  if (t === 'VEG') return 'v';
  if (t === 'NONVEG') return 'nv';
  if (t === 'EGG') return 'e';
  return null;
}

/** How many tickets in each column. */
export function statusCounts(tickets = []) {
  const out = { NEW: 0, PREPARING: 0, READY: 0 };
  for (const tk of tickets || []) out[ticketStatus(tk).key] += 1;
  return out;
}

/** Tickets split into the wall-mode columns, each kept oldest first. */
export function byColumn(tickets = []) {
  const out = { NEW: [], PREPARING: [], READY: [] };
  for (const tk of tickets || []) out[ticketStatus(tk).key].push(tk);
  return out;
}

/** "3 s" · "2 min" */
export function agoWords(ms) {
  const s = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min`;
}

/**
 * The live chip. Online: "Updated 3 s ago". Offline (the last read failed):
 * "Offline · last update 2 min ago", or "Offline" if nothing ever loaded.
 */
export function liveLine({ lastOkAt, failing, now = Date.now(), wall = false }) {
  if (failing) {
    return { off: true, text: lastOkAt ? `Offline · last update ${agoWords(now - lastOkAt)} ago` : 'Offline' };
  }
  if (!lastOkAt) return { off: false, text: wall ? 'Live' : 'Connecting…' };
  const ago = `${agoWords(now - lastOkAt)} ago`;
  return { off: false, text: wall ? `Live · updated ${ago}` : `Updated ${ago}` };
}

/** "6 active tickets" */
export const activeLine = (n) => `${Number(n) || 0} active ticket${n === 1 ? '' : 's'}`;

/** The toast after Served: "#38 served · T1". */
export const servedTitle = (tk) => [`${ticketNo(tk)} served`, tk?.table_label ? `T${tk.table_label}` : ''].filter(Boolean).join(' · ');

/** "7:42 pm" in the shop's timezone. */
export function wallClock(now = new Date(), tz) {
  try {
    return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, ...(tz ? { timeZone: tz } : {}) })
      .format(now).replace(/\s?(AM|PM)$/i, (m) => ` ${m.trim().toLowerCase()}`);
  } catch {
    return '';
  }
}
