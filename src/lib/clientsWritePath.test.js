import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Pins the Clients money rule: every place the web records a client payment
 * calls usePeople.recordClientPayment with NO invoice ids, which is the
 * settle_client_payment server function. Given ids, that hook writes invoice
 * and sale paid amounts from the browser; that branch must stay unused.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [
  'pages/ClientSettlement.jsx',
  'pages/CashCollection.jsx',
  'components/clients/CollectPaymentDialog.jsx',
];

describe('client payments go through the server function', () => {
  for (const f of FILES) {
    it(`${f} passes no invoice ids`, () => {
      const src = readFileSync(join(root, f), 'utf8');
      const calls = [...src.matchAll(/recordClientPayment\(([^)]*)\)/g)].map((m) => m[1]);
      expect(calls.length).toBeGreaterThan(0);
      for (const args of calls) {
        const parts = args.split(',').map((s) => s.trim());
        expect(parts).toHaveLength(6);
        expect(parts[4]).toBe('[]');
      }
    });
  }

  it('no Clients screen offers to choose bills', () => {
    for (const f of [...FILES, 'pages/Clients.jsx', 'components/clients/ClientPanel.jsx']) {
      expect(readFileSync(join(root, f), 'utf8')).not.toMatch(/Choose bills/i);
    }
  });
});
