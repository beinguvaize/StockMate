import { describe, it, expect, vi } from 'vitest';
import { payRun, payOne, payFailureText } from './payrollCommit';
import { readReply, cleanAdjustments } from './payRunClient';

vi.mock('./supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));

const answer = (items, { mustConfirm = false, period = '2026-11' } = {}) => ({
  period, mustConfirm, alreadyPaidRuns: [],
  run: { items, held: [], totalNet: items.reduce((t, i) => t + i.netPay, 0) },
});
const lines = [{ employeeId: 'a', netPay: 7000 }, { employeeId: 'b', netPay: 0 }];

describe('paying a run', () => {
  it('saves exactly the lines the server returned, with the run id and paid-by', async () => {
    const save = vi.fn(async () => ({ success: true }));
    const out = await payRun({ cost: async () => answer(lines), save, runId: 'run-1', method: 'BANK', shownTotal: 7000 });
    expect(out.status).toBe('saved');
    const [record, id] = save.mock.calls[0];
    expect(id).toBe('run-1');
    expect(record.paymentMethod).toBe('BANK');          // was always CASH for monthly runs
    expect(record.period).toBe('2026-11');
    expect(record.items).toEqual(lines);
  });

  it('stops when the figures moved since they were shown', async () => {
    const save = vi.fn();
    const out = await payRun({ cost: async () => answer(lines), save, runId: 'r', method: 'CASH', shownTotal: 6500 });
    expect(out.status).toBe('changed');
    expect(save).not.toHaveBeenCalled();
  });

  it('asks before paying dates that were already paid', async () => {
    const save = vi.fn(async () => ({ success: true }));
    const cost = async () => answer(lines, { mustConfirm: true });
    expect((await payRun({ cost, save, runId: 'r', method: 'CASH', shownTotal: 7000 })).status).toBe('confirm');
    expect(save).not.toHaveBeenCalled();
    expect((await payRun({ cost, save, runId: 'r', method: 'CASH', shownTotal: 7000, acknowledged: true })).status).toBe('saved');
  });

  it('saves nothing when nothing is owed', async () => {
    const save = vi.fn();
    expect((await payRun({ cost: async () => answer([{ employeeId: 'a', netPay: 0 }]), save })).status).toBe('nothing');
    expect(save).not.toHaveBeenCalled();
  });

  it('never claims a dropped connection did not save', async () => {
    const save = async () => ({ success: false, error: new TypeError('Failed to fetch') });
    const out = await payRun({ cost: async () => answer(lines), save, runId: 'r', method: 'CASH', shownTotal: 7000 });
    expect(out.status).toBe('failed');
    expect(out.failure.maySaved).toBe(true);
    expect(payFailureText(out.failure)).not.toMatch(/Not saved/);
    expect(payFailureText(out.failure)).toMatch(/may already be saved/);
  });

  it('gives the server’s own reason when it refused', async () => {
    const save = async () => ({ success: false, error: { message: 'Unknown way of paying: X' } });
    const out = await payRun({ cost: async () => answer(lines), save, runId: 'r', method: 'X', shownTotal: 7000 });
    expect(out.failure.maySaved).toBe(false);
    expect(payFailureText(out.failure)).toBe('Not saved. Unknown way of paying: X');
  });

  it('reports a failed costing without saving', async () => {
    const save = vi.fn();
    const out = await payRun({ cost: async () => { throw new Error('down'); }, save });
    expect(out.status).toBe('cost-failed');
    expect(save).not.toHaveBeenCalled();
  });
});

describe('paying one person', () => {
  it('switches them in and saves only their line', async () => {
    const save = vi.fn(async () => ({ success: true }));
    const cost = vi.fn(async (ids) => answer([{ employeeId: 'a', netPay: 7000 }, { employeeId: 'c', netPay: 9000 }]));
    const out = await payOne({ cost, save, runId: 'one-1', method: 'UPI', employeeId: 'c', shownAmount: 9000 });
    expect(cost).toHaveBeenCalledWith(['c']);
    expect(out.status).toBe('saved');
    expect(save.mock.calls[0][0].items).toEqual([{ employeeId: 'c', netPay: 9000 }]);
    expect(save.mock.calls[0][0].paymentMethod).toBe('UPI');
  });

  it('does nothing when they are owed nothing', async () => {
    const save = vi.fn();
    const out = await payOne({ cost: async () => answer([{ employeeId: 'a', netPay: 0 }]), save, employeeId: 'a' });
    expect(out.status).toBe('nothing');
    expect(save).not.toHaveBeenCalled();
  });
});

describe('the server reply', () => {
  const res = (status, body) => ({ ok: status < 400, status, json: async () => body });

  it('reads a costed run', async () => {
    const out = await readReply(res(200, { period: '2026-11', run: { items: [{ employeeId: 'a' }], totalNet: 5 }, already_paid_runs: [{ id: 'x' }], must_confirm_already_paid: true }));
    expect(out).toMatchObject({ period: '2026-11', mustConfirm: true, alreadyPaidRuns: [{ id: 'x' }] });
    expect(out.run.held).toEqual([]);
  });

  it('surfaces the server’s message', async () => {
    await expect(readReply(res(400, { reason: 'bad_dates', message: 'The end date is before the start date.' })))
      .rejects.toMatchObject({ kind: 'reason', reason: 'bad_dates', message: 'The end date is before the start date.' });
    await expect(readReply({ ok: false, status: 502, json: async () => { throw new Error('html'); } }))
      .rejects.toMatchObject({ message: 'The server answered 502.' });
  });

  it('sends only real adjustments', () => {
    expect(cleanAdjustments({ a: { bonus: '500', deductions: '', overtime: 0 }, b: { bonus: 'x' } })).toEqual({ a: { bonus: 500 } });
  });
});
