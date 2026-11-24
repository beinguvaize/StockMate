import { describe, it, expect, vi } from 'vitest';
import { fetchAllPages, PAGE_SIZE } from './fetchAllPages';

/** A fake PostgREST builder: .range(from,to) slices a fixed array. */
const builderOver = (rows, spy) => () => ({
  range: (from, to) => {
    if (spy) spy(from, to);
    return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
  },
});

describe('fetchAllPages', () => {
  it('returns every row, not the first page', async () => {
    const rows = Array.from({ length: 2300 }, (_, i) => ({ i }));
    const { data, error, complete } = await fetchAllPages(builderOver(rows));
    expect(error).toBeNull();
    expect(complete).toBe(true);
    expect(data).toHaveLength(2300);
    expect(data[0].i).toBe(0);
    expect(data[2299].i).toBe(2299);
  });

  it('stops on the first short page rather than probing past the end', async () => {
    const seen = [];
    const rows = Array.from({ length: 1200 }, (_, i) => ({ i }));
    await fetchAllPages(builderOver(rows, (from) => seen.push(from)));
    // 0..999, 1000..1999 (short, 200 rows) — and no third request
    expect(seen).toEqual([0, PAGE_SIZE]);
  });

  it('makes exactly one request when the table fits in a page', async () => {
    const seen = [];
    const rows = Array.from({ length: 12 }, (_, i) => ({ i }));
    const { data } = await fetchAllPages(builderOver(rows, (from) => seen.push(from)));
    expect(seen).toEqual([0]);
    expect(data).toHaveLength(12);
  });

  it('an empty table is complete, not an error', async () => {
    const { data, error, complete } = await fetchAllPages(builderOver([]));
    expect(data).toEqual([]);
    expect(error).toBeNull();
    expect(complete).toBe(true);
  });

  it('says so when the ceiling cuts the read short', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rows = Array.from({ length: 5000 }, (_, i) => ({ i }));
    const { data, complete } = await fetchAllPages(builderOver(rows), { ceiling: 2000, label: 'sales' });
    expect(complete).toBe(false);          // the silent truncation this replaces
    expect(data).toHaveLength(2000);
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls[0][0]).toMatch(/sales/);
    warn.mockRestore();
  });

  it('hands back what arrived when a page fails', async () => {
    // A partial read the caller knows about beats an empty one it does not.
    let call = 0;
    const queryFn = () => ({
      range: (from, to) => {
        call += 1;
        if (call === 1) {
          return Promise.resolve({ data: Array.from({ length: PAGE_SIZE }, (_, i) => ({ i })), error: null });
        }
        return Promise.resolve({ data: null, error: { message: 'connection lost' } });
      },
    });
    const { data, error, complete } = await fetchAllPages(queryFn);
    expect(error.message).toBe('connection lost');
    expect(data).toHaveLength(PAGE_SIZE);
    expect(complete).toBe(false);
  });
});
