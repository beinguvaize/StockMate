/**
 * Indian payroll deductions: EPF, ESI, Professional Tax, TDS.
 *
 * WHAT THIS FILE WILL AND WILL NOT DO.
 *
 * EPF and ESI are computed, because their rules are fixed by statute and depend
 * only on figures payroll already holds -- a wage and a headcount. Professional
 * tax is computed from a slab table, because it depends only on the state and
 * the wage.
 *
 * TDS ON SALARY IS NOT COMPUTED, AND DELIBERATELY SO. Section 192 requires the
 * employer to estimate the employee's income for the whole year and deduct one
 * twelfth of the tax on it. Doing that needs the regime the employee chose,
 * their investment declarations (80C, 80D), rent paid for HRA, income from
 * previous employment, and any other income they declared -- none of which this
 * system holds and none of which can be inferred from a wage. A number derived
 * without them would be wrong, and it would be wrong on a document the employee
 * files with their return and the employer answers for to the department.
 * So TDS is a figure the business enters, which is what their accountant gives
 * them, and it is printed as entered.
 *
 * Everything here is opt-in per employee. Nothing is deducted from anyone until
 * the business says it applies to them: EPF is only compulsory at 20 employees,
 * ESI at 10, and this shop has three. Defaulting them on would invent
 * deductions from real wages.
 */

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
/**
 * Statutory deductions are whole rupees. Keeping paise here made the payslip's
 * own arithmetic disagree with the expense the run wrote: professional tax is a
 * half-yearly slab divided by six (1,000 / 6 = 166.67), so the lines summed to
 * 2,616.67 while the total deducted was 2,617, and the slip's reconciliation
 * check fired on a perfectly correct run.
 */
const rupees = (v) => Math.round(v);

/** ESI is rounded UP to the next rupee, per the ESIC rules. */
const rupeesUp = (v) => Math.ceil(v);

/** Statutory ceilings and rates, FY 2026-27. */
export const EPF_WAGE_CEILING = 15000;   // monthly EPF wage cap
export const EPF_EMPLOYEE_RATE = 0.12;
export const ESI_WAGE_LIMIT = 21000;     // ESI applies at or below this gross
export const ESI_EMPLOYEE_RATE = 0.0075;

/**
 * Employee's EPF contribution for a month.
 *
 * 12% of EPF wages. EPF wages are capped at 15,000 a month unless the employer
 * has opted to contribute on the full wage -- both are legitimate, so which one
 * applies is configuration, not a guess.
 */
export function epfEmployee({ epfWage, onFullWage = false } = {}) {
  const wage = num(epfWage);
  if (wage <= 0) return 0;
  const base = onFullWage ? wage : Math.min(wage, EPF_WAGE_CEILING);
  return rupees(base * EPF_EMPLOYEE_RATE);
}

/**
 * Employee's ESI contribution for a month: 0.75% of gross, and only while gross
 * is at or below the 21,000 limit.
 *
 * Crossing the limit mid-contribution-period does NOT stop the deduction --
 * contribution continues to the end of that period. That rule is not applied
 * here because the contribution period is not something a single month's payroll
 * can see; a caller that tracks it passes `inContributionPeriod`.
 */
export function esiEmployee({ gross, inContributionPeriod = false } = {}) {
  const g = num(gross);
  if (g <= 0) return 0;
  if (g > ESI_WAGE_LIMIT && !inContributionPeriod) return 0;
  return rupeesUp(g * ESI_EMPLOYEE_RATE);
}

/**
 * Professional tax, a state levy. Kerala's is charged half-yearly by the local
 * body on income for that half year; the monthly figure below is that charge
 * spread over six months, which is how it is normally shown on a slip.
 *
 * Only Kerala is tabulated, because that is where this business operates.
 * Any other state returns null rather than a plausible-looking number from the
 * wrong table -- professional tax varies by state and an invented figure is a
 * short-deduction the employer answers for.
 */
const KERALA_PT_HALF_YEARLY = [
  [11999, 0], [17999, 120], [29999, 180], [44999, 300],
  [59999, 450], [74999, 600], [99999, 750], [124999, 1000], [Infinity, 1250],
];

export function professionalTax({ state, halfYearlyIncome } = {}) {
  if (String(state || '').trim().toUpperCase() !== 'KERALA') return null;
  const income = num(halfYearlyIncome);
  if (income <= 0) return { halfYearly: 0, monthly: 0 };
  const row = KERALA_PT_HALF_YEARLY.find(([ceiling]) => income <= ceiling);
  const halfYearly = row ? row[1] : 0;
  return { halfYearly, monthly: rupees(halfYearly / 6) };
}

/**
 * The statutory deduction lines for one month, in the shape the payslip's
 * deduction list takes. Every one is opt-in; an employee with no statutory
 * configuration gets an empty list, which is every employee here today.
 */
export function statutoryDeductions({ gross, basic, config = {} } = {}) {
  const lines = [];
  const g = num(gross);
  const b = num(basic) || g;

  if (config.epf) {
    const amount = epfEmployee({ epfWage: b, onFullWage: !!config.epfOnFullWage });
    if (amount > 0) {
      lines.push({
        label: 'Provident fund',
        note: config.epfOnFullWage
          ? '12% of wages'
          : `12% of ${Math.min(b, EPF_WAGE_CEILING).toLocaleString('en-IN')}`,
        amount, statutory: true,
      });
    }
  }

  if (config.esi) {
    const amount = esiEmployee({ gross: g, inContributionPeriod: !!config.esiInPeriod });
    if (amount > 0) lines.push({ label: 'ESI', note: '0.75% of gross', amount, statutory: true });
  }

  if (config.professionalTaxState) {
    const pt = professionalTax({
      state: config.professionalTaxState,
      halfYearlyIncome: g * 6,
    });
    if (pt && pt.monthly > 0) {
      lines.push({
        label: 'Professional tax',
        note: `${config.professionalTaxState} · ${pt.halfYearly.toLocaleString('en-IN')} half-yearly`,
        amount: pt.monthly, statutory: true,
      });
    }
  }

  // Entered, never inferred. See the note at the top of this file.
  const tds = rupees(num(config.tdsMonthly));
  if (tds > 0) {
    lines.push({ label: 'TDS', note: 'As advised', amount: tds, statutory: true });
  }

  return lines;
}

export default statutoryDeductions;
