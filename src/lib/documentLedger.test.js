import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, sep } from 'path';
import { describe, it, expect } from 'vitest';
import {
  isCreditSale, collectionGoesToClientSettlement, creditInvoiceTakesMoney,
  clientSettlementBlocker, CLIENT_SETTLEMENT_NO_CLIENT_MSG, CLIENT_SETTLEMENT_MISMATCH_MSG,
} from './documentLedger';

/**
 * The document builder and the invoice screens must not post a sale or a
 * payment in to the ledger from the browser. post_sale_to_ledger already
 * posts both; a second, browser-written row put the same money in Cash & Bank
 * twice. See lib/documentLedger.js for who posts what.
 */
const SRC = fileURLToPath(new URL('..', import.meta.url));

const DIRS = ['pages/documents', 'pages/invoices', 'components/documents', 'components/invoices'];
const ROOT_FILES = ['pages/Invoices.jsx'];

const sourceFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(jsx?|mjs)$/.test(p) && !/\.test\.jsx?$/.test(p) ? [p] : [];
  });

const files = [
  ...DIRS.map((d) => join(SRC, d)).filter(existsSync).flatMap(sourceFiles),
  ...ROOT_FILES.map((f) => join(SRC, f)).filter(existsSync),
];
const rel = (f) => relative(SRC, f).split(sep).join('/');

describe('no browser ledger write for a sale or a payment in', () => {
  it('scans the document and invoice screens', () => {
    expect(files.map(rel)).toContain('pages/documents/CreateDocument.jsx');
  });

  it('no file calls addTxn or uses useAccounts to write', () => {
    const offenders = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/\baddTxn\s*\(/g)) offenders.push(`${rel(f)} @${m.index}`);
    }
    expect(offenders).toEqual([]);
  });

  it('no file inserts into account_transactions', () => {
    const offenders = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      if (/(restInsert|restUpsert)\(\s*['"]account_transactions['"]/.test(text)) offenders.push(rel(f));
      if (/from\(\s*['"]account_transactions['"]\s*\)[\s\S]{0,80}?\.(insert|upsert)\(/.test(text)) offenders.push(rel(f));
      if (/queueMutation\(\s*\{\s*table:\s*['"]account_transactions['"]/.test(text)) offenders.push(rel(f));
    }
    expect(offenders).toEqual([]);
  });

  it('the builder keeps no browser ledger helper', () => {
    const DOC = readFileSync(join(SRC, 'pages', 'documents', 'CreateDocument.jsx'), 'utf8');
    expect(DOC).not.toMatch(/postIncome|postCreditSaleCollection|addTxn/);
    expect(DOC).not.toMatch(/useAccounts/);
  });

  it('a payment in on a credit sale reuses Collect Payment\'s server call', () => {
    const DOC = readFileSync(join(SRC, 'pages', 'documents', 'CreateDocument.jsx'), 'utf8');
    // The same hook call Collect Payment makes, with no invoice ids.
    expect(DOC).toMatch(/const \{ recordClientPayment \} = usePeople\(currentTenantId\)/);
    expect(DOC).toMatch(/if \(collectionGoesToClientSettlement\(open\[0\]\)\) \{/);
    expect(DOC).toMatch(/recordClientPayment\(party\.id, Number\(payAmount\), date, notes, \[\], payMethod\)/);
    // No second copy of the RPC call in the builder.
    expect(DOC).not.toMatch(/settle_client_payment['"]/);
    expect(DOC).not.toMatch(/restRpc|supabase\.rpc/);
    // A failure goes to fail(), which classifies transport vs refusal.
    expect(DOC).toMatch(/r\.success === false\) return fail\(r\?\.error/);
    // The id check runs before the call, and refuses with fail().
    expect(DOC).toMatch(/const blocked = clientSettlementBlocker\(party, open\[0\]\);\s*if \(blocked\) return fail\(blocked\);\s*const r = await recordClientPayment\(/);
  });
});

describe('documentLedger rules', () => {
  it('only a CREDIT sale sends its payment in to settle_client_payment', () => {
    expect(collectionGoesToClientSettlement({ paymentMethod: 'CREDIT' })).toBe(true);
    expect(collectionGoesToClientSettlement({ paymentMethod: 'credit' })).toBe(true);
    for (const m of ['CASH', 'UPI', 'BANK', 'CARD', undefined]) {
      expect(collectionGoesToClientSettlement({ paymentMethod: m })).toBe(false);
    }
    expect(isCreditSale({ payment_method: 'CREDIT' })).toBe(true);
    expect(isCreditSale(null)).toBe(false);
  });

  it('a Credit invoice cannot claim money received now', () => {
    expect(creditInvoiceTakesMoney({ payMethod: 'CREDIT', paidNow: 100 })).toBe(true);
    expect(creditInvoiceTakesMoney({ payMethod: 'CREDIT', paidNow: 0 })).toBe(false);
    expect(creditInvoiceTakesMoney({ payMethod: 'CASH', paidNow: 100 })).toBe(false);
  });
});

describe('clientSettlementBlocker', () => {
  const sale = { id: 'S1', shopId: 'C-1', paymentMethod: 'CREDIT' };
  it('lets a saved client through when the sale is filed under that id', () => {
    expect(clientSettlementBlocker({ id: 'C-1', name: 'A' }, sale)).toBeNull();
    expect(clientSettlementBlocker({ id: 'C-1' }, { shop_id: 'C-1' })).toBeNull();
  });
  it('refuses a party with no id, a blank id, or a typed-in party', () => {
    expect(clientSettlementBlocker({ name: 'A' }, sale)).toBe(CLIENT_SETTLEMENT_NO_CLIENT_MSG);
    expect(clientSettlementBlocker({ id: '  ', name: 'A' }, sale)).toBe(CLIENT_SETTLEMENT_NO_CLIENT_MSG);
    expect(clientSettlementBlocker({ id: 'C-1', manual: true }, sale)).toBe(CLIENT_SETTLEMENT_NO_CLIENT_MSG);
    expect(clientSettlementBlocker(null, sale)).toBe(CLIENT_SETTLEMENT_NO_CLIENT_MSG);
  });
  it('refuses a sale with no shopId (old van or walk-in) or another client', () => {
    expect(clientSettlementBlocker({ id: 'C-1' }, { clientId: 'C-1' })).toBe(CLIENT_SETTLEMENT_MISMATCH_MSG);
    expect(clientSettlementBlocker({ id: 'C-1' }, { shopId: null })).toBe(CLIENT_SETTLEMENT_MISMATCH_MSG);
    expect(clientSettlementBlocker({ id: 'C-1' }, { shopId: 'C-2' })).toBe(CLIENT_SETTLEMENT_MISMATCH_MSG);
  });
  it('compares ids as text', () => {
    expect(clientSettlementBlocker({ id: 7 }, { shopId: '7' })).toBeNull();
  });
});
