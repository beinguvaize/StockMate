import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { classifyWriteFailure, isTransportFailure } from './writeOutcome';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The regression this exists for.
 *
 * On 2026-10-17 at 11:06:36 UTC a payroll attendance batch preflighted
 * (OPTIONS 200), committed four rows in Postgres at 11:06:36.679, and the
 * browser showed `Not saved · TypeError: Failed to fetch` with a Discard
 * button next to it. The screen asserted the opposite of what had happened,
 * and offered the one action that would have destroyed the work.
 */

describe('a write that may have landed', () => {
  it.each([
    ['TypeError: Failed to fetch'],
    ['NetworkError when attempting to fetch resource'],
    ['The operation was aborted'],
    ['fetch timed out'],
  ])('is never reported as "Not saved": %s', (message) => {
    const r = classifyWriteFailure({ message });
    expect(r.kind).toBe('UNCONFIRMED');
    expect(r.maySaved).toBe(true);
    // The exact words matter: "Not saved" is a claim the app cannot support.
    expect(r.title).not.toMatch(/not saved/i);
  });

  it('keeps the original error text for whoever has to debug it', () => {
    expect(classifyWriteFailure({ message: 'TypeError: Failed to fetch' }).detail)
      .toBe('TypeError: Failed to fetch');
  });

  it('names what could not be confirmed', () => {
    expect(classifyWriteFailure({ message: 'Failed to fetch' }, { noun: 'attendance save' }).title)
      .toBe("Couldn't confirm this attendance save");
  });
});

describe('a write the server refused', () => {
  it.each([
    ['new row violates row-level security policy for table "attendance"'],
    ['duplicate key value violates unique constraint'],
    ['there is no unique or exclusion constraint matching the ON CONFLICT specification'],
  ])('is reported as not saved, with the reason: %s', (message) => {
    const r = classifyWriteFailure({ message });
    expect(r.kind).toBe('REJECTED');
    expect(r.maySaved).toBe(false);
    expect(r.title).toBe('Not saved');
    // The server answered. Its answer is the only thing that makes this fixable.
    expect(r.detail).toBe(message);
  });

  it('still says something when the server gave no reason', () => {
    const r = classifyWriteFailure({});
    expect(r.kind).toBe('REJECTED');
    expect(r.detail).toBeTruthy();
  });
});

describe('isTransportFailure', () => {
  const online = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  afterEach(() => {
    if (online) Object.defineProperty(globalThis, 'navigator', online);
    else delete globalThis.navigator;
  });

  it('is false with no error at all', () => {
    // Guard first: a null error while offline is not a failed write.
    expect(isTransportFailure(null)).toBe(false);
    expect(isTransportFailure(undefined)).toBe(false);
  });

  it('treats any failure while offline as unconfirmed', () => {
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
    expect(isTransportFailure({ message: 'something odd' })).toBe(true);
  });

  it('does not swallow a server rejection that arrived while online', () => {
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
    expect(isTransportFailure({ message: 'violates row-level security policy' })).toBe(false);
  });
});

describe('one definition of the rule', () => {
  const ADAPTER = readFileSync(join(here, 'offline', 'hookAdapter.js'), 'utf8');
  const PAYROLL = readFileSync(join(here, '..', 'pages', 'Payroll.jsx'), 'utf8');

  it('hookAdapter.isOfflineError is this function, not a copy of it', () => {
    // Five hooks ask the same question to decide whether to queue a write for
    // replay. Two copies of the rule would drift, and the screen and the
    // outbox would then disagree about what happened.
    expect(ADAPTER).toMatch(/isOfflineError = isTransportFailure/);
    expect(ADAPTER).not.toMatch(/msg\.includes\('failed to fetch'\)/);
  });

  it('the attendance screen classifies instead of assuming', () => {
    expect(PAYROLL).toContain('classifyWriteFailure(error');
    // The old line asserted the write was lost whatever had happened.
    expect(PAYROLL).not.toMatch(/setAttSaveError\(error\?\.message \|\| 'Could not save attendance'\)/);
  });

  it('offers a re-read rather than a discard when the outcome is unknown', () => {
    // Discard is the only button that can destroy committed work here.
    expect(PAYROLL).toMatch(/attSaveError\?\.maySaved \? \(/);
    expect(PAYROLL).toContain('att-check-server');
    expect(PAYROLL).toContain('reloadAttendance');
  });

  it('keeps the pending edits after a failed save', () => {
    // Re-saving is an upsert on (tenant_id, employee_id, day) and costs
    // nothing; losing the buffer costs the user their afternoon.
    const save = PAYROLL.slice(PAYROLL.indexOf('const saveAttendance ='));
    const failBranch = save.slice(0, save.indexOf('setSavedAtt'));
    expect(failBranch).not.toMatch(/setPendingAtt\(\{\}\)/);
  });
});
