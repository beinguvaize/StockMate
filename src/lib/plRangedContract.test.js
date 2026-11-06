import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import fx from '../../shared/fixtures/pl_ranged.json';

// The phone's suite (mobile_app/test/profit_from_server_test.dart) reads the
// same file, so web and phone are held to one call for one period.
const read = (f) => fs.readFileSync(path.resolve(__dirname, '../components/reports', f), 'utf8');

describe('how the web asks for profit', () => {
  it.each(['usePLRanged.js', 'FinancialReport.jsx', 'PLTieOut.jsx'])('%s makes the shared call', (file) => {
    const calls = [...read(file).matchAll(/\.rpc\('([a-z_]+)',\s*\{([^}]*)\}/g)]
      .filter((m) => m[1] === fx.rpc);
    expect(calls.length).toBeGreaterThan(0);
    for (const [, , args] of calls) {
      expect(args.split(',').map((a) => a.split(':')[0].trim())).toEqual(fx.params);
    }
  });
});
