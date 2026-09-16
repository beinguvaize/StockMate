import { describe, it, expect } from 'vitest';
import {
  INDIAN_STATES, stateCodeFor, stateForCode, stateFromGstin, normaliseStateName,
} from './gstStates';

describe('gstStates', () => {
  it('has no duplicate codes or names', () => {
    const codes = INDIAN_STATES.map((s) => s.code);
    const names = INDIAN_STATES.map((s) => s.name);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it('never offers a retired code for selection', () => {
    // 25 merged into 26 in 2020; 28 was Andhra Pradesh before Telangana split.
    const codes = INDIAN_STATES.map((s) => s.code);
    expect(codes).not.toContain('25');
    expect(codes).not.toContain('28');
  });

  it('still resolves retired codes, so old rows read back', () => {
    expect(stateForCode('25')).toBe('Dadra & Nagar Haveli and Daman & Diu');
    expect(stateForCode('28')).toBe('Andhra Pradesh');
  });

  it('treats & and "and" as the same word', () => {
    // Typed data uses both. Matching raw strings would make these two states,
    // two tax outcomes, one shop.
    expect(stateCodeFor('Jammu & Kashmir')).toBe('01');
    expect(stateCodeFor('Jammu and Kashmir')).toBe('01');
    expect(normaliseStateName('Jammu & Kashmir'))
      .toBe(normaliseStateName('jammu  and   kashmir'));
  });

  it('is tolerant of case and spacing', () => {
    expect(stateCodeFor('  tamil nadu ')).toBe('33');
    expect(stateCodeFor('KERALA')).toBe('32');
  });

  it('reads the state out of a GSTIN', () => {
    expect(stateFromGstin('32ABCDE1234F1Z5')).toBe('Kerala');
    expect(stateFromGstin('27AAAAA0000A1Z5')).toBe('Maharashtra');
  });

  it('returns empty rather than guessing', () => {
    expect(stateCodeFor('Atlantis')).toBe('');
    expect(stateCodeFor('')).toBe('');
    expect(stateCodeFor(null)).toBe('');
    expect(stateForCode('99')).toBe('');
    expect(stateFromGstin('')).toBe('');
  });

  it('round-trips every state', () => {
    for (const s of INDIAN_STATES) {
      expect(stateCodeFor(s.name)).toBe(s.code);
      expect(stateForCode(s.code)).toBe(s.name);
    }
  });
});
