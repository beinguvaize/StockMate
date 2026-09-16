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
 * Professional tax, a state levy under Article 276.
 *
 * Three things this has to express that a single table could not:
 *
 *  · States charge on different BASES. Most assess a monthly salary; Kerala and
 *    Tamil Nadu assess income for a half year; Bihar assesses a year. Feeding a
 *    monthly wage into a half-yearly table under-deducts by a factor of six.
 *  · Several states levy NO professional tax at all -- Delhi, Haryana, Uttar
 *    Pradesh and Rajasthan among them. "This state does not charge it" is a
 *    different answer from "I have no table for this state", and only the
 *    second is a reason to be cautious.
 *  · Article 276 caps the levy at 2,500 per person per YEAR. That is a
 *    constitutional ceiling, so it is enforced here rather than trusted to
 *    every slab table being right.
 *
 * SLAB FIGURES ARE AS OF FY 2026-27 AND MUST BE CHECKED against the current
 * state notification before a business is switched on. States revise them in
 * their budgets, and a stale slab is a short deduction the employer answers
 * for. A state that is not listed returns null and deducts NOTHING, which is
 * the safe direction and is deliberately not a guess from a neighbour's table.
 *
 * Not modelled: Maharashtra and a few others charge women a different (higher)
 * exemption, and some states load the final month of the year. Both would need
 * data this system does not hold, so the tables below use the standard slab.
 */
export const PT_ANNUAL_CAP = 2500;

const PT_TABLES = {
  // [ceiling, amount] — first row whose ceiling the income does not exceed.
  KERALA:           { basis: 'HALF_YEARLY', slabs: [
    [11999, 0], [17999, 120], [29999, 180], [44999, 300],
    [59999, 450], [74999, 600], [99999, 750], [124999, 1000], [Infinity, 1250]] },
  TAMIL_NADU:       { basis: 'HALF_YEARLY', slabs: [
    [21000, 0], [30000, 135], [45000, 315], [60000, 690], [75000, 1025], [Infinity, 1250]] },

  MAHARASHTRA:      { basis: 'MONTHLY', slabs: [[7500, 0], [10000, 175], [Infinity, 200]] },
  KARNATAKA:        { basis: 'MONTHLY', slabs: [[24999, 0], [Infinity, 200]] },
  GUJARAT:          { basis: 'MONTHLY', slabs: [[12000, 0], [Infinity, 200]] },
  WEST_BENGAL:      { basis: 'MONTHLY', slabs: [
    [10000, 0], [15000, 110], [25000, 130], [40000, 150], [Infinity, 200]] },
  ANDHRA_PRADESH:   { basis: 'MONTHLY', slabs: [[15000, 0], [20000, 150], [Infinity, 200]] },
  TELANGANA:        { basis: 'MONTHLY', slabs: [[15000, 0], [20000, 150], [Infinity, 200]] },
  MADHYA_PRADESH:   { basis: 'MONTHLY', slabs: [[18750, 0], [25000, 125], [33333, 167], [Infinity, 208]] },
  ODISHA:           { basis: 'MONTHLY', slabs: [[13304, 0], [25000, 125], [Infinity, 200]] },
  ASSAM:            { basis: 'MONTHLY', slabs: [[10000, 0], [15000, 150], [25000, 180], [Infinity, 208]] },

  BIHAR:            { basis: 'ANNUAL', slabs: [
    [300000, 0], [500000, 1000], [1000000, 2000], [Infinity, 2500]] },

  // States that levy no professional tax. Listed so the app can SAY so rather
  // than look like it is missing a table.
  DELHI:            { none: true },
  HARYANA:          { none: true },
  UTTAR_PRADESH:    { none: true },
  RAJASTHAN:        { none: true },
  CHANDIGARH:       { none: true },
  ARUNACHAL_PRADESH:{ none: true },
  GOA:              { none: true },
  ANDAMAN_AND_NICOBAR: { none: true },
};

/** 'Tamil Nadu', 'tamil-nadu', 'TAMIL_NADU' all reach the same table. */
const ptKey = (state) =>
  String(state || '').trim().toUpperCase().replace(/[\s-]+/g, '_').replace(/&/g, 'AND');

/** Every state this app can compute, for a settings dropdown. */
export const PT_STATES = Object.keys(PT_TABLES)
  .map(k => ({ key: k, label: k.replace(/_/g, ' ').replace(/\bAND\b/g, '&'),
               levies: !PT_TABLES[k].none }))
  .sort((a, b) => a.label.localeCompare(b.label));

/**
 * `monthlyGross` is what the employee earns in a month; each table converts it
 * to the basis that state assesses on.
 */
export function professionalTax({ state, monthlyGross } = {}) {
  const key = ptKey(state);
  const table = PT_TABLES[key];
  if (!table) return null;                       // no table: deduct nothing
  // Normalised key for logic, readable label for anything a person reads.
  const label = key.replace(/_/g, ' ').replace(/\bAND\b/g, '&');
  if (table.none) {
    return { applicable: false, reason: 'STATE_DOES_NOT_LEVY',
             state: key, stateLabel: label, monthly: 0 };
  }

  const monthly = num(monthlyGross);
  if (monthly <= 0) {
    return { applicable: true, state: key, stateLabel: label, basis: table.basis, monthly: 0 };
  }

  const assessed = table.basis === 'HALF_YEARLY' ? monthly * 6
                 : table.basis === 'ANNUAL'      ? monthly * 12
                 : monthly;
  const row = table.slabs.find(([ceiling]) => assessed <= ceiling);
  const charge = row ? row[1] : 0;

  // Back to a per-month figure, which is how a slip shows it.
  const perMonth = table.basis === 'HALF_YEARLY' ? charge / 6
                 : table.basis === 'ANNUAL'      ? charge / 12
                 : charge;

  // Article 276: never more than the annual ceiling, whatever a slab says.
  const capped = Math.min(perMonth, PT_ANNUAL_CAP / 12);

  return {
    applicable: true, state: key, stateLabel: label, basis: table.basis,
    charge,                       // as the state assesses it
    monthly: rupees(capped),
    halfYearly: table.basis === 'HALF_YEARLY' ? charge : rupees(capped * 6),
    annual: rupees(capped * 12),
  };
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
    const pt = professionalTax({ state: config.professionalTaxState, monthlyGross: g });
    if (pt && pt.applicable && pt.monthly > 0) {
      // Say what the state actually assesses, so the figure can be checked
      // against the notification rather than taken on trust.
      const note = pt.basis === 'HALF_YEARLY'
        ? `${pt.stateLabel} · ₹${pt.charge.toLocaleString('en-IN')} half-yearly`
        : pt.basis === 'ANNUAL'
        ? `${pt.stateLabel} · ₹${pt.charge.toLocaleString('en-IN')} a year`
        : `${pt.stateLabel} · monthly slab`;
      lines.push({ label: 'Professional tax', note, amount: pt.monthly, statutory: true });
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
