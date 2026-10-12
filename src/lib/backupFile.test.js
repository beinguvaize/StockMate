import { describe, it, expect } from 'vitest';
import {
  buildBackup, inspectBackup, restorePlan, retenant, checksum, backupFileName,
  SOURCE_TABLES, DERIVED_TABLES, ALL_BACKUP_TABLES, isDerived, BACKUP_FORMAT,
} from './backupFile.js';

/**
 * The shop's own backup.
 * ==========================================================================
 *
 * Two properties carry the whole feature, and almost every test here is about
 * one of them:
 *
 *   1. a damaged or foreign file must STOP, because restoring half a shop is
 *      worse than restoring none of it;
 *   2. a restore must never write a row the database computes, or every
 *      payment is posted twice — once as the saved ledger row and once as the
 *      trigger's reaction to the restored sale.
 */

const tables = () => ({
  products: [{ id: 'P1', tenant_id: 'T1', name: 'Salt' }, { id: 'P2', tenant_id: 'T1', name: 'Butter' }],
  clients: [{ id: 'C1', tenant_id: 'T1', name: 'Acme' }],
  sales: [{ id: 'S1', tenant_id: 'T1', totalAmount: 100 }],
  account_transactions: [{ id: 'AT1', tenant_id: 'T1', amount: 100 }],
  inventory_balances: [{ id: 'IB1', tenant_id: 'T1', quantity: 5 }],
});

describe('what is captured and what is written back', () => {
  it('never writes a table the database computes', () => {
    // The safety property. account_transactions is posted by
    // trg_sales_post_ledger when the sale is restored; writing the saved rows
    // too would double every payment in the books.
    const plan = restorePlan(buildBackup({ tenantId: 'T1', tables: tables() }));
    const written = plan.steps.map((s) => s.table);
    for (const d of DERIVED_TABLES) expect(written, `${d} must not be restored`).not.toContain(d);
    expect(plan.rowsRebuiltByDatabase).toBe(2);   // the AT and IB rows
    expect(plan.rowsToWrite).toBe(4);
  });

  it('still captures the computed tables, so the file is complete', () => {
    // A backup you cannot read every number out of is not a backup — it is
    // just the inputs.
    const file = buildBackup({ tenantId: 'T1', tables: tables() });
    expect(file.tables.account_transactions).toHaveLength(1);
    expect(file.counts.account_transactions).toBe(1);
  });

  it('writes parents before children', () => {
    // A foreign key violation half way through leaves half a shop, with no
    // way to tell which half.
    const order = SOURCE_TABLES;
    expect(order.indexOf('clients')).toBeLessThan(order.indexOf('sales'));
    expect(order.indexOf('sales')).toBeLessThan(order.indexOf('sale_items'));
    expect(order.indexOf('products')).toBeLessThan(order.indexOf('product_batches'));
    expect(order.indexOf('suppliers')).toBeLessThan(order.indexOf('purchases'));
  });

  it('puts every table in exactly one of the two lists', () => {
    expect(new Set(ALL_BACKUP_TABLES).size).toBe(ALL_BACKUP_TABLES.length);
    expect(isDerived('account_transactions')).toBe(true);
    expect(isDerived('sales')).toBe(false);
  });
});

describe('reading a file back', () => {
  it('accepts a file it just made', () => {
    const res = inspectBackup(buildBackup({ tenantId: 'T1', tenantName: 'Demo', tables: tables() }), { tenantId: 'T1' });
    expect(res.ok).toBe(true);
    expect(res.errors).toEqual([]);
    expect(res.summary.rows).toBe(6);   // 2 products, 1 client, 1 sale, 2 derived
  });

  it('refuses a file that was truncated or edited', () => {
    // The realistic corruption: a half-finished download, or someone opening
    // it in a spreadsheet. Restoring whatever survived is the worst outcome.
    const file = buildBackup({ tenantId: 'T1', tables: tables() });
    file.tables.products.pop();
    const res = inspectBackup(file, { tenantId: 'T1' });
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/damaged or was edited/);
  });

  it('refuses something that is not a backup at all', () => {
    expect(inspectBackup(null).ok).toBe(false);
    expect(inspectBackup({ hello: 'world' }).ok).toBe(false);
    expect(inspectBackup('{}').ok).toBe(false);
  });

  it('refuses a file from a newer version rather than guessing', () => {
    const res = inspectBackup({ ...buildBackup({ tenantId: 'T1', tables: {} }), format: 99 });
    expect(res.ok).toBe(false);
    expect(res.errors.join(' ')).toMatch(/format 99/);
  });

  it('warns, but does not refuse, a file from another shop', () => {
    // Moving a shop between tenants is a real thing people do; it just must
    // never happen by accident.
    const res = inspectBackup(
      buildBackup({ tenantId: 'OTHER', tenantName: 'Other Shop', tables: tables() }),
      { tenantId: 'T1' },
    );
    expect(res.ok).toBe(true);
    expect(res.warnings.join(' ')).toMatch(/different shop \(Other Shop\)/);
  });

  it('warns about tables this version does not know', () => {
    const file = buildBackup({ tenantId: 'T1', tables: { ...tables(), future_table: [{ id: 'X' }] } });
    const res = inspectBackup(file, { tenantId: 'T1' });
    expect(res.ok).toBe(true);
    expect(res.warnings.join(' ')).toMatch(/future_table/);
    // and it is not restored
    expect(restorePlan(file).steps.map((s) => s.table)).not.toContain('future_table');
  });
});

describe('the checksum', () => {
  it('does not change with key order', () => {
    // Otherwise an honest file looks corrupt after a round trip through JSON.
    const a = { products: [{ id: 'P1', name: 'Salt' }] };
    const b = { products: [{ name: 'Salt', id: 'P1' }] };
    expect(checksum(a)).toBe(checksum(b));
  });

  it('changes when a row goes missing', () => {
    const full = tables();
    const short = { ...full, products: full.products.slice(0, 1) };
    expect(checksum(full)).not.toBe(checksum(short));
  });
});

describe('restoring into this shop', () => {
  it('re-stamps every row with the tenant doing the restore', () => {
    // A row carrying its old tenant_id is refused by RLS, and one that slipped
    // through would belong to a shop that cannot see it.
    const rows = retenant([{ id: 'P1', tenant_id: 'OLD' }, { id: 'P2', tenant_id: 'OLD' }], 'NEW');
    expect(rows.every((r) => r.tenant_id === 'NEW')).toBe(true);
  });

  it('leaves rows without a tenant column alone', () => {
    expect(retenant([{ id: 'X' }], 'NEW')).toEqual([{ id: 'X' }]);
  });
});

describe('the file itself', () => {
  it('is named so it can be found again', () => {
    const name = backupFileName('Demo Kirana Store', new Date('2026-10-12T09:30:00Z'));
    expect(name).toBe('stockmate-demo-kirana-store-2026-10-12-09-30.json');
  });

  it('records what it is, so a future version can read it', () => {
    const file = buildBackup({ tenantId: 'T1', tenantName: 'Demo', tables: tables(), appVersion: '1.2.3' });
    expect(file.format).toBe(BACKUP_FORMAT);
    expect(file.appVersion).toBe('1.2.3');
    expect(file.takenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
