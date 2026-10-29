/**
 * Recurring expenses: how a template is described and how a new one is set up.
 *
 * Generation itself runs in the database (generate_due_recurring_expenses on
 * pg_cron). These helpers only build the template row and the label a person
 * reads, so web and mobile can be checked against the same fixtures.
 */

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
  return `Monthly on day ${Math.min(Math.max(parseInt(t?.day_of_month, 10) || 1, 1), 28)}`;
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
