import { describe, it, expect, vi, afterEach } from 'vitest';
import * as web from './backupFile.js';
import * as mirror from '../../supabase/functions/drive-backup/backupFile.ts';
import {
  signState, verifyState, STATE_TTL_MS, encryptToken, decryptToken, filesToDelete, isDue, KEEP_NEWEST,
} from '../../supabase/functions/drive-backup/lib.ts';

afterEach(() => vi.useRealTimers());

describe('builder mirror matches src/lib/backupFile.js', () => {
  const tables = { items: [{ id: 'a' }, { id: 'b' }], empty: [], ledger: [{ id: 'x', amt: 5 }] };
  const manifest = [{ table: 'items', mode: 'REPLACE', count: 2, ord: 1 }, { table: 'empty', mode: 'PRESERVE' }];
  const input = { tenantId: 't1', tenantName: 'Shop One', tables, manifest, appVersion: '9' };

  it('same payload', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T21:00:00Z'));
    expect(mirror.buildBackup(input)).toEqual(web.buildBackup(input));
    expect(JSON.stringify(mirror.buildBackup(input))).toBe(JSON.stringify(web.buildBackup(input)));
  });
  it('same checksum, format and file names', () => {
    expect(mirror.checksum(tables)).toBe(web.checksum(tables));
    expect(mirror.BACKUP_FORMAT).toBe(web.BACKUP_FORMAT);
    const at = new Date('2026-11-20T21:00:00Z');
    for (const n of ['Shop One', 'Ünï Çode!!', '', undefined]) {
      expect(mirror.backupFileName(n, at)).toBe(web.backupFileName(n, at));
    }
  });
  it('a mirror payload passes the web inspector', () => {
    expect(web.inspectBackup(mirror.buildBackup(input), { tenantId: 't1' }).ok).toBe(true);
  });
});

describe('oauth state', () => {
  const now = 1_800_000_000_000;
  it('round-trips', async () => {
    const s = await signState('k', 'tenant', 'user', now);
    expect(await verifyState('k', s, now + 1000)).toEqual({ tenant: 'tenant', user: 'user' });
  });
  it('rejects wrong key, tampering, expiry, junk', async () => {
    const s = await signState('k', 'tenant', 'user', now);
    expect(await verifyState('other', s, now)).toBeNull();
    const [b, sig] = s.split('.');
    const forged = btoa(JSON.stringify({ tenant: 'evil', user: 'user', exp: now + 9e9, nonce: 'n' })).replace(/=+$/, '');
    expect(await verifyState('k', `${forged}.${sig}`, now)).toBeNull();
    expect(await verifyState('k', `${b}.AAAA`, now)).toBeNull();
    expect(await verifyState('k', s, now + STATE_TTL_MS + 1)).toBeNull();
    expect(await verifyState('k', 'junk', now)).toBeNull();
    expect(await verifyState('k', '', now)).toBeNull();
  });
});

describe('token encryption', () => {
  const key = Buffer.alloc(32, 7).toString('base64');
  it('round-trips and is not deterministic', async () => {
    const a = await encryptToken(key, '1//refresh-token');
    const b = await encryptToken(key, '1//refresh-token');
    expect(a).not.toBe(b);
    expect(a).not.toContain('refresh-token');
    expect(await decryptToken(key, a)).toBe('1//refresh-token');
  });
  it('fails with the wrong key, tampering, or a short key', async () => {
    const a = await encryptToken(key, 'secret');
    await expect(decryptToken(Buffer.alloc(32, 8).toString('base64'), a)).rejects.toThrow();
    await expect(decryptToken(key, a.slice(0, -2) + 'AA')).rejects.toThrow();
    await expect(encryptToken(Buffer.alloc(16).toString('base64'), 'x')).rejects.toThrow(/32 bytes/);
  });
});

describe('retention and schedule', () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: `f${i}`, createdTime: new Date(2026, 0, 1 + i).toISOString() }));
  it('keeps the newest 30, deletes the older', () => {
    const files = mk(34);
    const del = filesToDelete(files.slice().reverse());
    expect(del.sort()).toEqual(['f0', 'f1', 'f2', 'f3']);
    expect(filesToDelete(mk(KEEP_NEWEST))).toEqual([]);
    expect(filesToDelete([])).toEqual([]);
  });
  it('due after 20h', () => {
    const now = Date.parse('2026-11-20T21:00:00Z');
    expect(isDue(null, now)).toBe(true);
    expect(isDue('2026-11-20T02:00:00Z', now)).toBe(false);
    expect(isDue('2026-11-19T20:59:00Z', now)).toBe(true);
  });
});
