import { describe, it, expect } from 'vitest';
import { statutoryDeductions, epfEmployee, esiEmployee, professionalTax, EPF_WAGE_CEILING, ESI_WAGE_LIMIT, PT_ANNUAL_CAP, PT_STATES } from './statutory';

/**
 * These deductions come off real wages and are reported to the department, so
 * the cases below are the ones where a wrong rule costs the employee money or
 * the employer a penalty.
 */

describe('EPF', () => {
  it('is 12% of the wage below the ceiling', () => {
    expect(epfEmployee({ epfWage: 12000 })).toBe(1440);
  });

  it('caps at the statutory wage ceiling', () => {
    // 12% of 15,000, not of 40,000 — the difference is 3,000 a month.
    expect(epfEmployee({ epfWage: 40000 })).toBe(EPF_WAGE_CEILING * 0.12);
    expect(epfEmployee({ epfWage: 40000 })).toBe(1800);
  });

  it('uses the full wage when the employer opted to', () => {
    // Both are legitimate, which is why it is configuration and not a guess.
    expect(epfEmployee({ epfWage: 40000, onFullWage: true })).toBe(4800);
  });

  it('is nothing on no wage', () => {
    expect(epfEmployee({ epfWage: 0 })).toBe(0);
  });
});

describe('ESI', () => {
  it('is 0.75% of gross at or below the limit, rounded UP to the rupee', () => {
    // ESIC rounds a contribution up to the next rupee; 21,000 x 0.75% is
    // 157.50, which is remitted as 158.
    expect(esiEmployee({ gross: 20000 })).toBe(150);
    expect(esiEmployee({ gross: ESI_WAGE_LIMIT })).toBe(158);
  });

  it('does not apply above the limit', () => {
    expect(esiEmployee({ gross: 21001 })).toBe(0);
  });

  it('continues above the limit inside a contribution period', () => {
    // Crossing mid-period does not stop the deduction; it runs to period end.
    expect(esiEmployee({ gross: 25000, inContributionPeriod: true })).toBe(188);
  });
});

describe('professional tax', () => {
  /**
   * A state levy that varies by state, assessed on different bases, and capped
   * by Article 276 at 2,500 a year. A wrong figure here is a short deduction
   * the employer answers for, so the cases below are the ones where a
   * plausible-looking mistake costs money.
   */

  it('assesses a half-yearly state on six months of pay', () => {
    // Kerala's slabs are half-yearly. Handing them a monthly wage would
    // under-deduct by a factor of six.
    const pt = professionalTax({ state: 'Kerala', monthlyGross: 8333 });
    expect(pt.basis).toBe('HALF_YEARLY');
    expect(pt.charge).toBe(450);          // ~50,000 for the half year
    expect(pt.monthly).toBe(75);
  });

  it('assesses a monthly state on one month of pay', () => {
    const pt = professionalTax({ state: 'Karnataka', monthlyGross: 30000 });
    expect(pt.basis).toBe('MONTHLY');
    expect(pt.monthly).toBe(200);
    // Below the Karnataka threshold nothing is due.
    expect(professionalTax({ state: 'Karnataka', monthlyGross: 20000 }).monthly).toBe(0);
  });

  it('assesses an annual state on a year of pay', () => {
    const pt = professionalTax({ state: 'Bihar', monthlyGross: 50000 });
    expect(pt.basis).toBe('ANNUAL');
    expect(pt.charge).toBe(2000);         // 6,00,000 a year
    expect(pt.monthly).toBe(167);
  });

  it('reads a graded monthly slab', () => {
    const wb = (g) => professionalTax({ state: 'West Bengal', monthlyGross: g }).monthly;
    expect(wb(9000)).toBe(0);
    expect(wb(12000)).toBe(110);
    expect(wb(20000)).toBe(130);
    expect(wb(50000)).toBe(200);
  });

  it('accepts a state name however it is written', () => {
    for (const n of ['Tamil Nadu', 'tamil nadu', 'TAMIL_NADU', 'tamil-nadu']) {
      expect(professionalTax({ state: n, monthlyGross: 20000 }).state).toBe('TAMIL_NADU');
    }
  });

  it('says plainly when a state levies NO professional tax', () => {
    // Different from having no table. Delhi charges nothing; that is an answer,
    // not a gap.
    const pt = professionalTax({ state: 'Delhi', monthlyGross: 90000 });
    expect(pt.applicable).toBe(false);
    expect(pt.reason).toBe('STATE_DOES_NOT_LEVY');
    expect(pt.monthly).toBe(0);
  });

  it('returns null for a state it has no table for', () => {
    // Deduct nothing rather than guess from a neighbour's slabs.
    expect(professionalTax({ state: 'Nagaland', monthlyGross: 50000 })).toBeNull();
    expect(professionalTax({ monthlyGross: 50000 })).toBeNull();
  });

  it('never exceeds the Article 276 annual ceiling', () => {
    // Constitutional cap, enforced here rather than trusted to every slab.
    for (const st of ['Kerala', 'Maharashtra', 'West Bengal', 'Bihar', 'Tamil Nadu']) {
      const pt = professionalTax({ state: st, monthlyGross: 500000 });
      expect(pt.annual).toBeLessThanOrEqual(PT_ANNUAL_CAP);
      expect(pt.monthly * 12).toBeLessThanOrEqual(PT_ANNUAL_CAP + 12);
    }
  });

  it('is nothing on no pay', () => {
    expect(professionalTax({ state: 'Maharashtra', monthlyGross: 0 }).monthly).toBe(0);
  });

  it('lists the states it can compute, flagging which levy nothing', () => {
    const delhi = PT_STATES.find(s => s.key === 'DELHI');
    const kerala = PT_STATES.find(s => s.key === 'KERALA');
    expect(delhi.levies).toBe(false);
    expect(kerala.levies).toBe(true);
    expect(PT_STATES.length).toBeGreaterThan(15);
  });
});

describe('statutoryDeductions', () => {
  it('deducts NOTHING when nothing is configured', () => {
    // The state every employee in this business is in: three staff, so neither
    // EPF (20+) nor ESI (10+) is compulsory. Defaulting them on would invent
    // deductions from real wages.
    expect(statutoryDeductions({ gross: 23400, basic: 23400 })).toEqual([]);
  });

  it('adds only what was switched on', () => {
    const lines = statutoryDeductions({ gross: 20000, basic: 20000, config: { esi: true } });
    expect(lines.map(l => l.label)).toEqual(['ESI']);
    expect(lines[0].amount).toBe(150);
  });

  it('builds the full set when a registered employer configures it', () => {
    const lines = statutoryDeductions({
      gross: 20000, basic: 20000,
      config: { epf: true, esi: true, professionalTaxState: 'Kerala', tdsMonthly: 500 },
    });
    expect(lines.map(l => l.label))
      .toEqual(['Provident fund', 'ESI', 'Professional tax', 'TDS']);
    expect(lines.find(l => l.label === 'Provident fund').amount).toBe(1800); // capped
    expect(lines.find(l => l.label === 'TDS').amount).toBe(500);
  });

  it('deducts only whole rupees, so a slip can always reconcile', () => {
    const lines = statutoryDeductions({
      gross: 20000, basic: 20000,
      config: { epf: true, esi: true, professionalTaxState: 'Kerala', tdsMonthly: 500 },
    });
    for (const l of lines) expect(Number.isInteger(l.amount)).toBe(true);
  });

  it('prints TDS exactly as entered, never derived', () => {
    // Section 192 needs the regime, 80C/80D declarations, HRA and prior
    // employment. None of that is here, so the figure is the one the business
    // was advised and nothing computes over the top of it.
    const lines = statutoryDeductions({ gross: 500000, config: { tdsMonthly: 1234.5 } });
    expect(lines).toEqual([{ label: 'TDS', note: 'As advised', amount: 1235, statutory: true }]);
  });

  it('marks every line statutory, so the slip can group them', () => {
    const lines = statutoryDeductions({ gross: 20000, config: { epf: true, esi: true } });
    expect(lines.every(l => l.statutory)).toBe(true);
  });
});
