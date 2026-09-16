import { describe, it, expect } from 'vitest';
import { toE164, formatPhone, maskPhone, describeOtpError } from './phoneAuth';

// Supabase matches a stored phone as an exact string. Two spellings of one
// number becoming two accounts is the failure this file guards against, so
// every shape a person might type has to land on the same E.164 value.
describe('toE164', () => {
  const CANON = '+919876543210';

  it('maps every plausible spelling of one number onto one string', () => {
    const inputs = [
      '9876543210',          // bare mobile
      '09876543210',         // STD trunk prefix
      '919876543210',        // country code, no plus
      '+919876543210',       // already E.164
      '+91 98765 43210',     // as printed on a card
      '+91-98765-43210',
      '(+91) 98765 43210',
      '  9876543210  ',      // pasted with whitespace
      '98765 43210',
      '0091 9876543210',     // international 00 prefix
    ];
    const results = new Set(inputs.map((i) => toE164(i)));
    expect([...results]).toEqual([CANON]);
  });

  it('accepts a number given as a number, not a string', () => {
    expect(toE164(9876543210)).toBe(CANON);
  });

  it('refuses what cannot be a mobile rather than guessing', () => {
    // A guess here sends someone's login code to a stranger.
    expect(toE164('98765')).toBeNull();        // too short
    expect(toE164('98765432101234')).toBeNull(); // too long for a local number
    expect(toE164('')).toBeNull();
    expect(toE164('   ')).toBeNull();
    expect(toE164(null)).toBeNull();
    expect(toE164(undefined)).toBeNull();
    expect(toE164('abcdefghij')).toBeNull();
    expect(toE164('+')).toBeNull();
  });

  it('rejects Indian landlines and typos, which cannot receive a WhatsApp OTP', () => {
    // Indian mobiles start 6-9. A 10-digit number starting 0-5 is not one.
    expect(toE164('1234567890')).toBeNull();
    expect(toE164('5876543210')).toBeNull();
    expect(toE164('9876543210')).toBe(CANON); // 9 still fine
    expect(toE164('6876543210')).toBe('+916876543210');
  });

  it('keeps an explicit foreign country code instead of forcing +91', () => {
    expect(toE164('+14155552671')).toBe('+14155552671');
    expect(toE164('+442071838750')).toBe('+442071838750');
    expect(toE164('+971501234567')).toBe('+971501234567');
  });

  it('does not read a 12-digit number as Indian unless it starts with 91', () => {
    expect(toE164('449876543210')).toBeNull();
  });
});

describe('display helpers', () => {
  it('formats for reading but never for lookup', () => {
    expect(formatPhone('+919876543210')).toBe('+91 98765 43210');
    // Anything it cannot format comes back untouched, not mangled.
    expect(formatPhone('+14155552671')).toBe('+14155552671');
    expect(formatPhone('')).toBe('');
    expect(formatPhone(null)).toBe('');
  });

  it('masks enough to confirm the number without exposing it', () => {
    const masked = maskPhone('+919876543210');
    expect(masked).toContain('•');
    expect(masked).not.toBe('+919876543210');
    expect(masked.endsWith('10')).toBe(true);
  });
});

describe('describeOtpError', () => {
  it('names the unknown-number case, which is the one users will hit', () => {
    const e = describeOtpError({ message: 'Signups not allowed for otp', status: 422 });
    expect(e.code).toBe('NOT_REGISTERED');
    expect(e.message).toMatch(/admin/i);
  });

  it('separates an expired code from a wrong one', () => {
    expect(describeOtpError({ message: 'Token has expired' }).code).toBe('EXPIRED');
    expect(describeOtpError({ message: 'Invalid token', status: 401 }).code).toBe('BAD_CODE');
  });

  it('flags rate limiting so the screen does not tell people to retry', () => {
    expect(describeOtpError({ status: 429, message: 'too many requests' }).code).toBe('RATE_LIMITED');
  });

  it('always keeps the original error attached', () => {
    // A message the user can read must not cost the reason a developer needs.
    const original = { message: 'boom', status: 500 };
    const described = describeOtpError(original);
    expect(described.code).toBe('UNKNOWN');
    expect(described.cause).toBe(original);
  });
});
