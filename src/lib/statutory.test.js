import { describe, it, expect } from 'vitest';
import { statutoryDeductions, epfEmployee, esiEmployee, professionalTax,
         EPF_WAGE_CEILING, ESI_WAGE_LIMIT } from './statutory';

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
  it('is 0.75% of gross at or below the limit', () => {
    expect(esiEmployee({ gross: 20000 })).toBe(150);
    expect(esiEmployee({ gross: ESI_WAGE_LIMIT })).toBe(157.5);
  });

  it('does not apply above the limit', () => {
    expect(esiEmployee({ gross: 21001 })).toBe(0);
  });

  it('continues above the limit inside a contribution period', () => {
    // Crossing mid-period does not stop the deduction; it runs to period end.
    expect(esiEmployee({ gross: 25000, inContributionPeriod: true })).toBe(187.5);
  });
});

describe('professional tax', () => {
  it('reads the Kerala half-yearly slab', () => {
    expect(professionalTax({ state: 'Kerala', halfYearlyIncome: 50000 }).halfYearly).toBe(450);
    expect(professionalTax({ state: 'Kerala', halfYearlyIncome: 200000 }).halfYearly).toBe(1250);
  });

  it('is nil below the first slab', () => {
    expect(professionalTax({ state: 'Kerala', halfYearlyIncome: 11000 }).halfYearly).toBe(0);
  });

  it('spreads the half-yearly charge over six months', () => {
    expect(professionalTax({ state: 'Kerala', halfYearlyIncome: 50000 }).monthly).toBe(75);
  });

  it('returns null for a state it has no table for', () => {
    // An invented figure from the wrong state's table is a short deduction the
    // employer answers for. Silence is the safe answer.
    expect(professionalTax({ state: 'Karnataka', halfYearlyIncome: 50000 })).toBeNull();
    expect(professionalTax({ halfYearlyIncome: 50000 })).toBeNull();
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

  it('prints TDS exactly as entered, never derived', () => {
    // Section 192 needs the regime, 80C/80D declarations, HRA and prior
    // employment. None of that is here, so the figure is the one the business
    // was advised and nothing computes over the top of it.
    const lines = statutoryDeductions({ gross: 500000, config: { tdsMonthly: 1234.5 } });
    expect(lines).toEqual([{ label: 'TDS', note: 'As advised', amount: 1234.5, statutory: true }]);
  });

  it('marks every line statutory, so the slip can group them', () => {
    const lines = statutoryDeductions({ gross: 20000, config: { epf: true, esi: true } });
    expect(lines.every(l => l.statutory)).toBe(true);
  });
});
