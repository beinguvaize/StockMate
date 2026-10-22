import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describeTransferError, TRANSFER_MARKERS } from './transferRefusal';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The two things this has to get right.
 *
 * 1. A refusal reads as a refusal, keeps the server's sentence (which contains
 *    the numbers the user needs) and drops the marker (which is for code).
 * 2. Anything else is NOT dressed up as a stock problem. A dropped connection
 *    reported as "not enough stock" sends the user to count shelves that are
 *    fine, and hides an outage.
 */
describe('a refused transfer', () => {
  it('names the shortfall and keeps the figures', () => {
    const r = describeTransferError({
      message: 'TRANSFER_SHORT: Paper Cup 210 Ml has 359.00 at the source and this moves 1359.00',
    });
    expect(r.refused).toBe(true);
    expect(r.title).toBe('Not enough stock at the source');
    expect(r.detail).toBe('Paper Cup 210 Ml has 359.00 at the source and this moves 1359.00');
    // The marker is never shown. Reading TRANSFER_SHORT on a screen teaches
    // nobody anything and reads as a crash.
    expect(`${r.title} ${r.detail}`).not.toContain('TRANSFER_SHORT');
  });

  it('names an invalid route', () => {
    const r = describeTransferError({
      message: 'TRANSFER_INVALID: the source and destination are the same place',
    });
    expect(r.refused).toBe(true);
    expect(r.detail).toBe('the source and destination are the same place');
  });

  it('strips the marker even when Postgres prefixes its own text', () => {
    // supabase-js hands back the raw message, but PostgREST and the Postgres
    // client have both been seen to prefix it. The marker is found wherever
    // it sits rather than only at position zero.
    const r = describeTransferError({
      message: 'ERROR:  TRANSFER_SHORT: Salt has 2.00 at the source and this moves 5.00',
    });
    expect(r.refused).toBe(true);
    expect(r.detail).toBe('Salt has 2.00 at the source and this moves 5.00');
  });

  it.each(TRANSFER_MARKERS)('recognises %s', (marker) => {
    expect(describeTransferError({ message: `${marker}: something` }).refused).toBe(true);
  });
});

describe('a transfer that failed for another reason', () => {
  it.each([
    ['TypeError: Failed to fetch'],
    ['Could not find the function public.transfer_inventory_atomic(...) in the schema cache'],
    ['new row violates row-level security policy for table "inventory_balances"'],
  ])('is not reported as a stock problem: %s', (message) => {
    const r = describeTransferError({ message });
    expect(r.refused).toBe(false);
    expect(r.title).toBe('Transfer failed');
    // The real reason survives. This is the whole point: a bare "transfer
    // failed" is how a days-long outage goes unnoticed.
    expect(r.detail).toBe(message);
  });

  it('says something even with nothing to go on', () => {
    expect(describeTransferError(null).title).toBe('Transfer failed');
    expect(describeTransferError({}).refused).toBe(false);
  });
});

describe('the screen and the hook', () => {
  const MODAL = readFileSync(
    join(here, '..', 'pages', 'inventory', 'components', 'TransferStockModal.jsx'), 'utf8');
  const HOOK = readFileSync(join(here, '..', 'hooks', 'useInventory.js'), 'utf8');

  it('shows the server reason rather than a generic failure', () => {
    expect(MODAL).toContain('describeTransferError');
    expect(MODAL).toContain('problem.detail');
  });

  it('keeps the form when a transfer is refused', () => {
    // A refusal is one number away from a valid transfer. Clearing the form
    // makes the user pick the product and route again.
    expect(MODAL).toMatch(/setProblem\(describeTransferError\(error\)\);\s*\n\s*return;/);
  });

  it('passes the note and the user through to the database', () => {
    // movement_log.reason is the only record of WHY stock moved, and user_id
    // of who moved it. Dropping them leaves two unexplained rows.
    expect(HOOK).toContain('p_user_id');
    expect(HOOK).toContain('p_note');
  });

  it('does not decide the stock question in the client', () => {
    // The authority is transfer_inventory_atomic, which locks the source row.
    // Two tills transferring the same stock at once is exactly what a local
    // check gets wrong, so the client must not be the one refusing.
    expect(HOOK).not.toMatch(/TRANSFER_SHORT/);
  });

  it('creates the second location as a type the database accepts', () => {
    // inventory_locations_type_check allows only WAREHOUSE and VEHICLE, so the
    // old BRANCH default meant a shop could never create the second place a
    // transfer needs.
    expect(HOOK).not.toMatch(/type = 'BRANCH'/);
    expect(HOOK).toMatch(/addLocation = async \(\{ name, type = 'WAREHOUSE'/);
  });
});
