import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, sep } from 'path';
import { describe, it, expect } from 'vitest';
import { isCreditSale, browserPostsCollection, creditInvoiceTakesMoney } from './documentLedger';

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

// The single permitted browser entry: a collection on a CREDIT sale, which
// the trigger does not post. Its body is cut out before scanning, and the
// test below pins that it is only ever reached for a CREDIT sale.
const CREDIT_EXCEPTION = /const postCreditSaleCollection = async[\s\S]*?\n {2}\};\n/;

describe('no browser ledger write for a sale or a payment in', () => {
  it('scans the document and invoice screens', () => {
    expect(files.map(rel)).toContain('pages/documents/CreateDocument.jsx');
  });

  it('no file calls addTxn, outside the one credit-collection exception', () => {
    const offenders = [];
    for (const f of files) {
      const text = readFileSync(f, 'utf8').replace(CREDIT_EXCEPTION, '');
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

  it('the old postIncome helper is gone from the builder', () => {
    const DOC = readFileSync(join(SRC, 'pages', 'documents', 'CreateDocument.jsx'), 'utf8');
    expect(DOC).not.toMatch(/postIncome/);
    // The exception is used once, behind the CREDIT check, and never for SALE.
    const calls = [...DOC.matchAll(/await postCreditSaleCollection\(/g)];
    expect(calls).toHaveLength(1);
    expect(DOC).toMatch(/if \(browserPostsCollection\(open\[0\]\)\) await postCreditSaleCollection\(/);
    expect(DOC.match(CREDIT_EXCEPTION)?.[0]).toMatch(/ref_type: 'PAYMENT'/);
    expect(DOC.match(CREDIT_EXCEPTION)?.[0]).not.toMatch(/'SALE'/);
  });
});

describe('documentLedger rules', () => {
  it('only a CREDIT sale has its collection posted by the browser', () => {
    expect(browserPostsCollection({ paymentMethod: 'CREDIT' })).toBe(true);
    expect(browserPostsCollection({ paymentMethod: 'credit' })).toBe(true);
    for (const m of ['CASH', 'UPI', 'BANK', 'CARD', undefined]) {
      expect(browserPostsCollection({ paymentMethod: m })).toBe(false);
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
