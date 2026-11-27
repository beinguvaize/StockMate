import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

vi.mock('./supabase', () => ({ supabase: { from: () => ({ insert: async () => ({ error: null }) }) } }));

import {
  ERROR_CATALOGUE, OUTCOME, classifyError, newReference, REFERENCE_PATTERN,
  scrubRaw, buildErrorRow,
} from './errorCodes';
import { logCodedError } from './errorLogger';

const here = dirname(fileURLToPath(import.meta.url));

describe('phone and web carry the same catalogue', () => {
  // Reads the Dart source, so a code added, retitled or re-outcomed on one
  // side only fails here.
  const dart = readFileSync(
    join(here, '../../mobile_app/lib/core/errors/error_codes.dart'), 'utf8');
  const outcomeOf = { _sent: OUTCOME.NOT_SENT, _may: OUTCOME.MAY_HAVE_SAVED,
    _no: OUTCOME.NOT_SAVED, 'ErrorOutcome.noChange': OUTCOME.NO_CHANGE };
  const re = /ErrorCodeInfo\(\s*'([A-Z]+-\d+)',\s*(['"])(.*?)\2,\s*(_sent|_may|_no|ErrorOutcome\.noChange),\s*(['"])(.*?)\5\)/gs;
  const phone = [...dart.matchAll(re)].map((m) => ({
    code: m[1], title: m[3], outcome: outcomeOf[m[4]], advice: m[6],
  }));

  it('parses all 25 phone codes', () => expect(phone).toHaveLength(25));

  it('codes, titles, outcomes and advice match, in order', () => {
    expect(ERROR_CATALOGUE.map((c) => ({ ...c }))).toEqual(phone);
  });
});

describe('mapper (built on writeOutcome)', () => {
  const pg = (code, message = 'x') => ({ code, message, details: null });

  it.each([
    ['NET-01', { message: 'whatever' }, { offlineBeforeSend: true }],
    ['NET-02', new TypeError('Failed to fetch'), {}],
    ['NET-03', { message: 'fetch timed out' }, {}],
    ['NET-04', { message: 'SSL certificate problem' }, {}],
    ['AUTH-01', { name: 'AuthApiError', code: 'refresh_token_not_found', status: 400, message: 'x' }, {}],
    ['AUTH-01', { name: 'AuthSessionMissingError', message: 'Auth session missing!' }, {}],
    ['AUTH-02', pg('PGRST301'), {}],
    ['AUTH-03', { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 }, {}],
    ['SRV-01', pg('502'), {}],
    ['SRV-02', pg('57014'), {}],
    ['SRV-03', pg('PGRST203'), {}],
    ['DB-01', pg('23505'), {}],
    ['DB-02', pg('42501', 'new row violates row-level security policy'), {}],
    ['DB-03', pg('P0001', 'NEGATIVE_STOCK_BLOCKED: only 2 left'), {}],
    ['DB-04', pg('P0001', 'CREDIT_LIMIT_EXCEEDED: over'), {}],
    ['DB-05', pg('PGRST116'), {}],
    ['DB-06', pg('P0001', 'Bill date is in a closed period'), {}],
    ['VAL-01', { name: 'ValidationFailure', message: 'amount is 0' }, {}],
    ['VAL-02', pg('22P02'), {}],
    ['APP-01', new Error('bad state'), { sent: false }],
    ['APP-02', new Error('bad state'), { sent: true }],
    ['APP-03', new Error('printer offline'), { printOrShare: true }],
  ])('%s', (code, err, opts) => {
    expect(classifyError(err, opts).code).toBe(code);
  });

  it('a dropped fetch is never "Not saved"', () => {
    expect(classifyError(new TypeError('Failed to fetch')).outcome).toBe(OUTCOME.MAY_HAVE_SAVED);
  });

  it('multi-request: an earlier write landed, so May have saved whatever the last error', () => {
    const r = classifyError({ code: '42501', message: 'denied' }, { earlierWriteSucceeded: true });
    expect(r.code).toBe('DB-02');
    expect(r.outcome).toBe(OUTCOME.MAY_HAVE_SAVED);
    expect(r.partial).toBe(true);
  });
});

describe('reference', () => {
  it('8 characters, no 0/O/1/I, unique', () => {
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
      const r = newReference();
      expect(r).toMatch(REFERENCE_PATTERN);
      expect(r).not.toMatch(/[01OI]/);
      seen.add(r);
    }
    expect(seen.size).toBe(2000);
  });
});

describe('scrubbing', () => {
  it('removes JWTs, keys, bearer tokens, phones and amounts; keeps ids', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcDEF123_-';
    const s = scrubRaw(`Authorization: Bearer ${jwt} apikey=sb_publishable_abc ` +
      'refresh_token=r3fr3sh Key (phone)=(9876543210) ₹5,000 id CP-1732700000000');
    expect(s).not.toContain('eyJ');
    expect(s).not.toContain('r3fr3sh');
    expect(s).not.toContain('9876543210');
    expect(s).not.toContain('5,000');
    expect(s).toContain('CP-1732700000000');
  });
});

describe('logCodedError', () => {
  const base = { error: { code: '42501', message: 'denied, Bearer eyJhbGciOi.eyJzdWIiOi.sig' },
    screen: 'Collect Payment', action: 'Record payment', tenantId: 't-1' };

  it('writes the same fields as the phone', async () => {
    const rows = [];
    const client = { from: (t) => ({ insert: async (row) => { rows.push([t, row]); return { error: null }; } }) };
    const r = await logCodedError({ ...base, reference: 'K7QM4XRT', client });
    expect(r).toEqual({ success: true, reference: 'K7QM4XRT' });
    const [table, row] = rows[0];
    expect(table).toBe('platform_error_logs');
    expect(Object.keys(row).sort()).toEqual(['action', 'app_version', 'error_code', 'error_message',
      'module', 'occurred_at', 'outcome', 'platform', 'reference_id', 'severity', 'tenant_id', 'user_id']);
    expect(row.error_code).toBe('DB-02');
    expect(row.outcome).toBe('NOT_SAVED');
    expect(row.platform).toBe('web');
    expect(row.error_message).not.toContain('eyJ');
  });

  it('an insert failure does not surface (migration not applied)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const refused = { from: () => ({ insert: async () => ({ error: { code: 'PGRST204', message: 'no column' } }) }) };
    await expect(logCodedError({ ...base, client: refused })).resolves.toMatchObject({ success: false });
    const throws = { from: () => ({ insert: async () => { throw new TypeError('Failed to fetch'); } }) };
    const r = await logCodedError({ ...base, client: throws });
    expect(r.success).toBe(false);
    expect(r.reference).toMatch(REFERENCE_PATTERN);
    warn.mockRestore();
  });

  it('buildErrorRow time is UTC', () => {
    const row = buildErrorRow({ result: classifyError(new TypeError('Failed to fetch')),
      reference: 'K7QM4XRT', screen: 's', action: 'a', tenantId: 't', raw: 'r',
      occurredAt: new Date('2026-11-27T10:12:00Z') });
    expect(row.occurred_at).toBe('2026-11-27T10:12:00.000Z');
    expect(row.severity).toBe('High');
  });
});
