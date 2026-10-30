/**
 * Recurring expenses: how a template is described and how a new one is set up.
 *
 * Generation itself runs in the database (generate_due_recurring_expenses on
 * pg_cron). These helpers only build the template row and the label a person
 * reads, so web and mobile can be checked against the same fixtures.
 */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const clampDay = (d) => Math.min(Math.max(parseInt(d, 10) || 1, 1), 28);
export const ordinal = (n) => {
  const v = n % 100;
  return `${n}${v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
};
const utc = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

export const WEEKDAYS = [
  { n: 1, short: 'Mon' }, { n: 2, short: 'Tue' }, { n: 3, short: 'Wed' },
  { n: 4, short: 'Thu' }, { n: 5, short: 'Fri' }, { n: 6, short: 'Sat' }, { n: 7, short: 'Sun' },
];

/** "Every day", "Every day except Sun", "Mon, Wed, Fri", "Monthly on day 5". */
export function describeRecurring(t) {
  if (String(t?.frequency).toUpperCase() === 'DAILY') {
    const days = [...new Set((t.weekdays || []).map(Number))].filter((d) => d >= 1 && d <= 7).sort();
    if (!days.length || days.length === 7) return 'Every day';
    const off = WEEKDAYS.filter((w) => !days.includes(w.n)).map((w) => w.short);
    if (off.length <= 2) return `Every day except ${off.join(' and ')}`;
    return WEEKDAYS.filter((w) => days.includes(w.n)).map((w) => w.short).join(', ');
  }
  return `Monthly on the ${ordinal(clampDay(t?.day_of_month))}`;
}

/**
 * The template row for a new recurring expense, given the one just logged.
 *
 * The logged expense covers its own date. The generator resumes the day
 * after `last_generated`, so that is set to the later of the expense date and
 * today: a back-dated expense must not make the first nightly run fill in
 * every day since.
 */
export function recurringTemplateFor({ frequency, weekdays, date, today }) {
  const day = String(date || today).slice(0, 10);
  const daily = frequency === 'DAILY';
  const wd = daily ? [...new Set((weekdays || []).map(Number))].filter((d) => d >= 1 && d <= 7).sort() : null;
  return {
    frequency: daily ? 'DAILY' : 'MONTHLY',
    weekdays: daily && wd.length && wd.length < 7 ? wd : null,
    day_of_month: Math.min(Math.max(parseInt(day.split('-')[2], 10) || 1, 1), 28),
    start_date: day,
    last_generated: day > today ? day : today,
  };
}

/**
 * The next date the nightly job will log this template, by the database's
 * own rule (generate_due_recurring_expenses): it resumes the day after
 * last_generated and logs on the first due day.
 */
export function nextRun(t) {
  const from = utc(String(t.last_generated).slice(0, 10)) + 864e5;
  const daily = String(t.frequency).toUpperCase() === 'DAILY';
  const days = (t.weekdays || []).map(Number);
  for (let i = 0; i < 62; i += 1) {
    const ms = from + i * 864e5;
    const d = new Date(ms);
    const isoDow = ((d.getUTCDay() + 6) % 7) + 1;
    if (daily ? (!days.length || days.includes(isoDow)) : d.getUTCDate() === clampDay(t.day_of_month)) return iso(ms);
  }
  return null;
}

/** "Every day except Sun · next Fri 30 Oct" -- what the form promises. */
export function scheduleLine(t) {
  const next = nextRun(t);
  const d = next ? new Date(utc(next)) : null;
  const when = d ? `next ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}` : '';
  const asked = parseInt(t.asked_day, 10);
  const capped = String(t.frequency).toUpperCase() !== 'DAILY' && asked > 28
    ? ' (29th–31st aren\'t in every month)' : '';
  return `${describeRecurring(t)}${capped}${when ? ` · ${when}` : ''}`;
}

const PAY_LABEL = { CASH: 'Cash', BANK: 'Bank', UPI: 'UPI', CARD: 'Card', CHEQUE: 'Cheque' };
/** "Cash", "UPI" -- never a title-cased "Upi". */
export const paymentLabel = (m) => PAY_LABEL[String(m || 'CASH').toUpperCase()] || String(m || 'Cash');
