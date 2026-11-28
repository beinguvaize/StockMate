import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { handle, periodFor } from '../../supabase/functions/payroll-run/handler.js';
import { buildPayRun } from './payRun';

const TENANT = '3d666d92-f5b4-44c3-a811-270557ad2fc6';

/** A stand-in for the database client: each table answers with fixed rows, a page at a time. */
const fakeDb = (tables, seen = []) => () => ({
  from(table) {
    const q = { table, filters: [] };
    const chain = {
      select: () => chain, is: () => chain, order: () => chain,
      eq: (c, v) => { q.filters.push(['eq', c, v]); return chain; },
      gte: (c, v) => { q.filters.push(['gte', c, v]); return chain; },
      lte: (c, v) => { q.filters.push(['lte', c, v]); return chain; },
      range: async (a, b) => {
        seen.push({ ...q, a, b });
        const t = tables[table];
        if (t instanceof Error) return { data: null, error: t };
        return { data: (t || []).slice(a, b + 1), error: null };
      },
    };
    return chain;
  },
});

const call = (body, tables, { auth = 'Bearer x', method = 'POST', seen } = {}) =>
  handle(new Request('http://fn/payroll-run', {
    method, headers: auth ? { Authorization: auth } : {},
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  }), { db: fakeDb(tables, seen), cors: {} });

const staff = [
  { id: 'aj', name: 'Anita Jadhav', status: 'ACTIVE', pay_type: 'MONTHLY', salary: 11000, paid_leave_per_month: 2 },
  { id: 'ks', name: 'Kiran Shinde', status: 'ACTIVE', pay_type: 'DAILY', daily_rate: 400 },
  { id: 'sp', name: 'Suresh Patil', status: 'ON_LEAVE', pay_type: 'MONTHLY', salary: 12000 },
];
const marks = [
  { employee_id: 'ks', day: '2026-11-16', status: 'PRESENT', custom_rate: null },
  { employee_id: 'ks', day: '2026-11-17', status: 'HALF_DAY', custom_rate: null },
  { employee_id: 'aj', day: '2026-11-03', status: 'ABSENT', custom_rate: null },
  { employee_id: 'aj', day: '2026-11-04', status: 'SICK', custom_rate: null },
];

describe('payroll-run server function', () => {
  it('ships a bundle built from the current shared rules', () => {
    const fresh = buildSync({
      entryPoints: ['src/lib/payRunServer.js'], bundle: true, format: 'esm',
      platform: 'neutral', write: false,
    }).outputFiles[0].text;
    const shipped = readFileSync('supabase/functions/payroll-run/payRun.bundle.js', 'utf8');
    // If this fails: npm run build:payroll-fn, then deploy the function.
    expect(shipped).toBe(fresh);
  });

  it('costs a run exactly as the web does', async () => {
    const res = await call({ tenant_id: TENANT, from: '2026-11-01', to: '2026-11-30' },
      { employees: staff, attendance: marks, payroll: [] });
    expect(res.status).toBe(200);
    const out = await res.json();
    const attendance = {
      ks: { '2026-11-16': { status: 'PRESENT', custom_rate: null }, '2026-11-17': { status: 'HALF_DAY', custom_rate: null } },
      aj: { '2026-11-03': { status: 'ABSENT', custom_rate: null }, '2026-11-04': { status: 'SICK', custom_rate: null } },
    };
    // advances: {} -- the server always reads staff advances, so every line
    // carries advanceOutstanding / advancePlanned (0 here).
    const web = buildPayRun({ employees: staff, attendance, records: [], from: '2026-11-01', to: '2026-11-30', advances: {} });
    // The server adds the per-person overlap fields to each line; the rest is the web's line exactly.
    const strip = (l) => { const { needsConfirmation, alreadyPaidRunIds, ...rest } = l; expect(needsConfirmation).toBe(false); expect(alreadyPaidRunIds).toEqual([]); return rest; };
    expect({ ...out.run, items: out.run.items.map(strip), held: out.run.held.map(strip) }).toEqual(JSON.parse(JSON.stringify(web)));
    expect(out.confirm_employee_ids).toEqual([]);
    expect(out.period).toBe('2026-11');
    expect(out.run.items.map(i => i.employeeId).sort()).toEqual(['aj', 'ks']);
    expect(out.run.held.map(l => l.employeeId)).toEqual(['sp']);
    expect(out.run.items.find(i => i.employeeId === 'ks').basePay).toBe(600);
    expect(out.must_confirm_already_paid).toBe(false);
  });

  it('pays someone on leave only when asked to', async () => {
    const res = await call({ tenant_id: TENANT, from: '2026-11-01', to: '2026-11-30', include_on_leave: ['sp'] },
      { employees: staff, attendance: [], payroll: [] });
    const out = await res.json();
    expect(out.run.items.some(i => i.employeeId === 'sp')).toBe(true);
    expect(out.run.held).toEqual([]);
  });

  it('reads attendance from the 1st of the end month so leave is counted over the whole month', async () => {
    const seen = [];
    await call({ tenant_id: TENANT, from: '2026-11-16', to: '2026-11-22' },
      { employees: staff, attendance: marks, payroll: [] }, { seen });
    const att = seen.find(q => q.table === 'attendance');
    expect(att.filters).toContainEqual(['gte', 'day', '2026-11-01']);
    expect(att.filters).toContainEqual(['lte', 'day', '2026-11-22']);
    expect(att.filters).toContainEqual(['eq', 'tenant_id', TENANT]);
  });

  it('reads past the first thousand rows', async () => {
    const many = Array.from({ length: 1500 }, (_, i) => ({
      id: `e${i}`, name: `Hand ${i}`, status: 'ACTIVE', pay_type: 'DAILY', daily_rate: 100 }));
    const res = await call({ tenant_id: TENANT, from: '2026-11-01', to: '2026-11-30' },
      { employees: many, attendance: [], payroll: [] });
    expect((await res.json()).run.items).toHaveLength(1500);
  });

  it('lists runs that already cover the dates', async () => {
    const payroll = [{ id: 'r1', period: '2026-11-01/2026-11-08', total_net: 500, processed_at: '2026-11-08T10:00:00Z',
      items: [{ employeeId: 'ks', netPay: 500 }] }];
    const res = await call({ tenant_id: TENANT, from: '2026-11-01', to: '2026-11-30' },
      { employees: staff, attendance: marks, payroll });
    const out = await res.json();
    expect(out.already_paid_runs).toEqual([{ id: 'r1', period: '2026-11-01/2026-11-08', total_net: 500, processed_at: '2026-11-08T10:00:00Z' }]);
    // Anita was not in that run, so paying her is not paying anyone twice;
    // Kiran was, and his 500 is netted off his line.
    expect(out.must_confirm_already_paid).toBe(false);
    const ks = out.run.items.find((i) => i.employeeId === 'ks');
    expect(ks).toMatchObject({ alreadyPaid: 500, alreadyPaidRunIds: ['r1'], needsConfirmation: false });
    expect(out.run.items.find((i) => i.employeeId === 'aj')).toMatchObject({ alreadyPaidRunIds: [], needsConfirmation: false });
  });

  describe('the "already paid" check is per employee', () => {
    const month = { tenant_id: TENANT, from: '2026-11-01', to: '2026-11-30' };
    const two = [
      { id: 'aj', name: 'A', status: 'ACTIVE', pay_type: 'MONTHLY', salary: 11000 },
      { id: 'ks', name: 'K', status: 'ACTIVE', pay_type: 'MONTHLY', salary: 9000 },
    ];
    const ask = async (payroll, body = month, employees = two) => (await call(body, { employees, attendance: [], payroll })).json();
    const line = (out, id) => [...out.run.items, ...out.run.held].find((i) => i.employeeId === id);

    it('nobody paid before: no runs, nothing to confirm', async () => {
      const out = await ask([]);
      expect(out.already_paid_runs).toEqual([]);
      expect(out.must_confirm_already_paid).toBe(false);
      expect(out.confirm_employee_ids).toEqual([]);
    });

    it('some paid before: the run for the others raises no warning', async () => {
      // Pay one person for the month, then run the month for everyone.
      const out = await ask([{ id: 'r1', period: '2026-11', total_net: 11000, processed_at: '2026-11-28T10:00:00Z', items: [{ employeeId: 'aj', netPay: 11000 }] }]);
      expect(out.already_paid_runs.map((r) => r.id)).toEqual(['r1']);
      expect(out.must_confirm_already_paid).toBe(false);
      expect(line(out, 'aj')).toMatchObject({ alreadyPaid: 11000, netPay: 0, alreadyPaidRunIds: ['r1'], needsConfirmation: false });
      expect(line(out, 'ks')).toMatchObject({ netPay: 9000, alreadyPaidRunIds: [], needsConfirmation: false });
    });

    it('everyone paid before: all netted to nothing, nothing to confirm', async () => {
      const out = await ask([{ id: 'r1', period: '2026-11', total_net: 20000, processed_at: '2026-11-28T10:00:00Z',
        items: [{ employeeId: 'aj', netPay: 11000 }, { employeeId: 'ks', netPay: 9000 }] }]);
      expect(out.must_confirm_already_paid).toBe(false);
      expect(out.run.items.every((i) => i.netPay === 0 && i.needsConfirmation === false)).toBe(true);
    });

    it('partial overlap of dates: the shared days are netted, the rest paid, no warning', async () => {
      // 1-15 Nov paid to aj; now 10-20 Nov for both.
      const out = await ask([{ id: 'r1', period: '2026-11-01/2026-11-15', total_net: 5500, processed_at: '2026-11-15T10:00:00Z',
        items: [{ employeeId: 'aj', netPay: 5500 }] }], { tenant_id: TENANT, from: '2026-11-10', to: '2026-11-20' });
      expect(out.already_paid_runs.map((r) => r.id)).toEqual(['r1']);
      const aj = line(out, 'aj');
      expect(aj.alreadyPaid).toBeGreaterThan(0);
      expect(aj.alreadyPaid).toBeLessThan(5500);
      expect(aj).toMatchObject({ alreadyPaidRunIds: ['r1'], needsConfirmation: false });
      expect(out.must_confirm_already_paid).toBe(false);
    });

    it('a person paid before whose payment was NOT netted still needs confirming, and only that person', async () => {
      // A day-rate run made on the 10th covers no day after it, so a later
      // window shares none of its days: the earlier pay is not netted.
      const staff2 = [...two, { id: 'dr', name: 'D', status: 'ACTIVE', pay_type: 'DAILY', daily_rate: 500 }];
      const out = await call({ tenant_id: TENANT, from: '2026-11-20', to: '2026-11-25' }, {
        employees: staff2,
        attendance: [{ employee_id: 'dr', day: '2026-11-21', status: 'PRESENT', custom_rate: null }],
        payroll: [{ id: 'r1', period: '2026-11', total_net: 2000, processed_at: '2026-11-10T10:00:00Z', items: [{ employeeId: 'dr', netPay: 2000, payType: 'DAILY' }] }],
      }).then((r) => r.json());
      expect(line(out, 'dr')).toMatchObject({ netPay: 500, alreadyPaid: 0, alreadyPaidRunIds: ['r1'], needsConfirmation: true });
      expect(line(out, 'aj').needsConfirmation).toBe(false);
      expect(out.must_confirm_already_paid).toBe(true);
      expect(out.confirm_employee_ids).toEqual(['dr']);
    });

    it('held on-leave staff do not raise it; switched in, they are checked like anyone', async () => {
      const staff3 = [two[0], { id: 'ol', name: 'L', status: 'ON_LEAVE', pay_type: 'DAILY', daily_rate: 500 }];
      const payroll = [{ id: 'r1', period: '2026-11', total_net: 1000, processed_at: '2026-11-05T10:00:00Z', items: [{ employeeId: 'ol', netPay: 1000, payType: 'DAILY' }] }];
      const attendance = [{ employee_id: 'ol', day: '2026-11-21', status: 'PRESENT', custom_rate: null }];
      const held = await call({ tenant_id: TENANT, from: '2026-11-20', to: '2026-11-25' }, { employees: staff3, attendance, payroll }).then((r) => r.json());
      expect(held.run.held.map((l) => l.employeeId)).toEqual(['ol']);
      expect(held.must_confirm_already_paid).toBe(false);
      expect(held.confirm_employee_ids).toEqual([]);
      const inRun = await call({ tenant_id: TENANT, from: '2026-11-20', to: '2026-11-25', include_on_leave: ['ol'] }, { employees: staff3, attendance, payroll }).then((r) => r.json());
      expect(inRun.must_confirm_already_paid).toBe(true);
      expect(inRun.confirm_employee_ids).toEqual(['ol']);
    });
  });

  it('names the period the way the web stores it', () => {
    expect(periodFor('2026-02-01', '2026-02-28')).toBe('2026-02');
    expect(periodFor('2028-02-01', '2028-02-29')).toBe('2028-02');
    expect(periodFor('2028-02-01', '2028-02-28')).toBe('2028-02-01/2028-02-28');
    expect(periodFor('2026-11-16', '2026-11-22')).toBe('2026-11-16/2026-11-22');
  });

  it('refuses a caller who is not signed in, bad dates and a missing shop', async () => {
    const t = { employees: [], attendance: [], payroll: [] };
    expect((await call({ tenant_id: TENANT, from: '2026-11-01', to: '2026-11-30' }, t, { auth: '' })).status).toBe(401);
    expect((await call({ tenant_id: 'nope', from: '2026-11-01', to: '2026-11-30' }, t)).status).toBe(400);
    expect((await call({ tenant_id: TENANT, from: '2026-11-31', to: '2026-12-01' }, t)).status).toBe(400);
    expect((await call({ tenant_id: TENANT, from: '2026-11-30', to: '2026-11-01' }, t)).status).toBe(400);
    expect((await call({ tenant_id: TENANT, from: '2024-01-01', to: '2026-11-01' }, t)).status).toBe(400);
    expect((await call(null, t, { method: 'GET' })).status).toBe(405);
  });

  it('says why when the shop data cannot be read, instead of returning an empty run', async () => {
    const res = await call({ tenant_id: TENANT, from: '2026-11-01', to: '2026-11-30' },
      { employees: new Error('permission denied for table employees'), attendance: [], payroll: [] });
    expect(res.status).toBe(502);
    expect((await res.json()).message).toContain('permission denied');
  });

  describe('staff advances', () => {
    const balances = [
      { employee_id: 'aj', outstanding: 5000, due_per_run: 2000, open_advances: 2 },
      { employee_id: 'ks', outstanding: 300, due_per_run: 300, open_advances: 1 },
    ];
    const body = { tenant_id: TENANT, from: '2026-11-01', to: '2026-11-30' };

    it('adds what each person owes and what this run would take, without touching netPay', async () => {
      const plain = await (await call(body, { employees: staff, attendance: marks, payroll: [] })).json();
      const res = await call(body, { employees: staff, attendance: marks, payroll: [], staff_advance_balances: balances });
      expect(res.status).toBe(200);
      const out = await res.json();
      const aj = out.run.items.find(i => i.employeeId === 'aj');
      const ks = out.run.items.find(i => i.employeeId === 'ks');
      expect(aj.advanceOutstanding).toBe(5000);
      expect(aj.advancePlanned).toBe(2000);
      // ks earned 600; owes 300: all 300 planned
      expect(ks.advancePlanned).toBe(300);
      // every field the released phone reads is exactly as before
      for (const line of out.run.items) {
        const before = plain.run.items.find(i => i.employeeId === line.employeeId);
        const { advanceOutstanding: _o, advancePlanned: _p, ...rest } = line;
        const { advanceOutstanding: _a, advancePlanned: _b, ...restBefore } = before;
        expect(rest).toEqual(restBefore);
      }
      expect(out.run.totalNet).toBe(plain.run.totalNet);
      expect(out.advances_read).toBe(true);
      expect(out.contract_version).toBe(1);
    });

    it('previews skip_advance and recover_all the way the database applies them', async () => {
      const out = await (await call({ ...body, skip_advance: ['aj'], recover_all: ['ks'] },
        { employees: staff, attendance: marks, payroll: [], staff_advance_balances: balances })).json();
      expect(out.run.items.find(i => i.employeeId === 'aj').advancePlanned).toBe(0);
      expect(out.run.items.find(i => i.employeeId === 'aj').advanceOutstanding).toBe(5000);
      expect(out.run.items.find(i => i.employeeId === 'ks').advancePlanned).toBe(300);
    });

    it('still costs the run when advances cannot be read, and says why', async () => {
      const res = await call(body, { employees: staff, attendance: marks, payroll: [],
        staff_advance_balances: new Error('relation "staff_advance_balances" does not exist') });
      expect(res.status).toBe(200);
      const out = await res.json();
      expect(out.advances_read).toBe(false);
      expect(out.advances_error).toContain('does not exist');
      expect(out.run.items.every(i => i.advancePlanned === 0)).toBe(true);
    });

    it('does not pay the recovered part again in an overlapping run', async () => {
      // A month run paid aj 9,000 cash and took 2,000 back against an advance.
      const prior = [{ id: 'r1', period: '2026-11', processed_at: '2026-11-30T10:00:00Z', deleted_at: null, total_net: 9000,
        items: [{ employeeId: 'aj', payType: 'MONTHLY', netPay: 9000, earnedNet: 11000, advanceRecovered: 2000 }] }];
      const out = await (await call(body, { employees: staff, attendance: marks, payroll: prior })).json();
      const aj = out.run.items.find(i => i.employeeId === 'aj');
      expect(aj.alreadyPaid).toBe(11000);
      expect(aj.netPay).toBe(Math.max(0, aj.basePay - aj.statutoryTotal - 11000));
    });
  });
});
