import { describe, it, expect } from 'vitest';
import { deriveNotifications, unreadOf, markAllRead, loadReadMap, saveReadMap } from './shellNotifications';

const ALL = { inventory: true, expiry: true, clients: true, collect: true };
const money = (n) => `₹${n}`;

describe('deriveNotifications', () => {
  it('restates the Dashboard figures as lines with links', () => {
    const list = deriveNotifications({
      kpi: { low_stock_items: 47, outstanding_collections: 12400 },
      expiry: { expired: 2, soon: 5 }, gates: ALL, money,
    });
    expect(list.map(n => n.id)).toEqual(['low-stock', 'expiry', 'owed']);
    expect(list[0]).toMatchObject({ title: '47 items low on stock', to: '/inventory', sig: '47' });
    expect(list[1]).toMatchObject({ title: '2 batches expired, 5 more within 30 days', to: '/reports?tab=EXPIRY', tone: 'bad' });
    expect(list[2]).toMatchObject({ title: '₹12400 owed to you', to: '/clients/collect', action: 'Collect payment' });
  });

  it('says nothing about a figure that is unknown or zero', () => {
    expect(deriveNotifications({ kpi: null, expiry: null, gates: ALL, money })).toEqual([]);
    expect(deriveNotifications({ kpi: { low_stock_items: 0, outstanding_collections: 0 }, expiry: { expired: 0, soon: 0 }, gates: ALL })).toEqual([]);
    expect(deriveNotifications({ kpi: { low_stock_items: null }, gates: ALL })).toEqual([]);
    // Half an expiry answer is not an answer.
    expect(deriveNotifications({ expiry: { expired: 3 }, gates: ALL })).toEqual([]);
  });

  it('words single counts and expiry cases plainly', () => {
    const one = deriveNotifications({ kpi: { low_stock_items: 1 }, expiry: { expired: 0, soon: 1 }, gates: ALL });
    expect(one[0].title).toBe('1 item low on stock');
    expect(one[1]).toMatchObject({ title: '1 batch expiring within 30 days', tone: 'warn' });
    const exp = deriveNotifications({ expiry: { expired: 1, soon: 0 }, gates: ALL });
    expect(exp[0].title).toBe('1 batch expired');
  });

  it('shows a line only to someone who may open its page', () => {
    const kpi = { low_stock_items: 4, outstanding_collections: 100 };
    expect(deriveNotifications({ kpi, expiry: { expired: 1, soon: 1 }, gates: {} })).toEqual([]);
    const viewOnly = deriveNotifications({ kpi, gates: { clients: true, collect: false } });
    expect(viewOnly).toHaveLength(1);
    expect(viewOnly[0]).toMatchObject({ to: '/clients', action: 'Open Clients' });
  });

  it('keeps the shop path', () => {
    const [n] = deriveNotifications({ kpi: { low_stock_items: 2 }, gates: ALL, basePath: '/demo' });
    expect(n.to).toBe('/demo/inventory');
  });
});

describe('read state', () => {
  const list = [{ id: 'low-stock', sig: '4' }, { id: 'owed', sig: '100' }];
  it('a line is read while its figure is the one that was seen', () => {
    expect(unreadOf(list, {})).toHaveLength(2);
    const read = markAllRead(list, {});
    expect(unreadOf(list, read)).toHaveLength(0);
    expect(unreadOf([{ id: 'low-stock', sig: '5' }, list[1]], read).map(n => n.id)).toEqual(['low-stock']);
  });

  it('is stored per shop and survives storage that throws', () => {
    const mem = {};
    const storage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
    saveReadMap('t1', { a: '1' }, storage);
    expect(loadReadMap('t1', storage)).toEqual({ a: '1' });
    expect(loadReadMap('t2', storage)).toEqual({});
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(loadReadMap('t1', broken)).toEqual({});
    expect(() => saveReadMap('t1', {}, broken)).not.toThrow();
    mem['bl_notifications_read:t3'] = 'not json';
    expect(loadReadMap('t3', storage)).toEqual({});
  });
});
