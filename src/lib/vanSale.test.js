import { fileURLToPath } from 'node:url';
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { vanSaleParams, CREDIT_NEEDS_CLIENT } from './vanSale';

const SRC = fileURLToPath(new URL('..', import.meta.url));

const base = {
  saleId: 'VAN-TEST-1', items: [{ productId: 'P1', productName: 'Item A', quantity: 2, sellingPrice: 10 }],
  totalAmount: 20, date: '2026-01-15', userId: 'U1', tenantId: 'T1', vehicleLocId: 'L1', routeId: 'R1',
};

describe('vanSaleParams', () => {
  it('a credit sale carries the client and is PENDING with nothing paid', () => {
    const { params, error } = vanSaleParams({ ...base, clientId: 'C1', paymentMethod: 'CREDIT' });
    expect(error).toBeUndefined();
    expect(params.p_shop_id).toBe('C1');
    expect(params.p_payment_method).toBe('CREDIT');
    expect(params.p_payment_status).toBe('PENDING');
    // Same as the phone: no paid amount, so process_sale records 0 paid.
    expect(params).not.toHaveProperty('p_paid_amount');
  });

  it('refuses a credit sale with no client', () => {
    for (const clientId of [null, undefined, '', 'WALKIN']) {
      const { params, error } = vanSaleParams({ ...base, clientId, paymentMethod: 'CREDIT' });
      expect(params).toBeUndefined();
      expect(error.message).toBe(CREDIT_NEEDS_CLIENT);
    }
  });

  it('cash and UPI stay PAID, and keep the client when one was chosen', () => {
    for (const m of ['CASH', 'UPI', 'CARD']) {
      expect(vanSaleParams({ ...base, clientId: 'C1', paymentMethod: m }).params)
        .toMatchObject({ p_shop_id: 'C1', p_payment_method: m, p_payment_status: 'PAID' });
    }
    expect(vanSaleParams({ ...base, clientId: null, paymentMethod: 'CASH' }).params)
      .toMatchObject({ p_shop_id: null, p_payment_status: 'PAID' });
  });

  it('defaults a missing method to CASH', () => {
    expect(vanSaleParams({ ...base }).params.p_payment_method).toBe('CASH');
  });

  it('sends only process_sale parameters that exist', () => {
    const { params } = vanSaleParams({ ...base, clientId: 'C1', paymentMethod: 'CASH' });
    // From the recorded signature (20260805_pin_search_path_money_functions).
    const SIGNATURE = ['p_id', 'p_shop_id', 'p_items', 'p_total_amount', 'p_payment_method',
      'p_payment_status', 'p_date', 'p_user_id', 'p_location_id', 'p_route_id', 'p_tenant_id',
      'p_delivery_method', 'p_source_app', 'p_paid_amount', 'p_discount'];
    for (const k of Object.keys(params)) expect(SIGNATURE).toContain(k);
    expect(params.p_items).toEqual([{ id: 'P1', name: 'Item A', quantity: 2, rate: 10 }]);
  });
});

describe('the web van sale wiring', () => {
  it('the hook builds its call from vanSaleParams, never a hard-coded null client', () => {
    const HOOK = readFileSync(join(SRC, 'hooks', 'useOperations.js'), 'utf8');
    expect(HOOK).toMatch(/restRpc\('process_sale', built\.params\)/);
    expect(HOOK).not.toMatch(/p_shop_id:\s*null/);
    expect(HOOK).not.toMatch(/p_payment_status:\s*'PAID'/);
  });

  it('the page passes the chosen client id through', () => {
    const PAGE = readFileSync(join(SRC, 'pages', 'VanSalePage.jsx'), 'utf8');
    expect(PAGE).toMatch(/recordVanSale\(route\.id, locId, \{\s*\n(\s*\/\/.*\n)*\s*clientId,/);
  });
});
