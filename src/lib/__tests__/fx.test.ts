import { describe, expect, it } from 'vitest';
import { EMPTY_FX, FX_TTL_MS, foreignCurrencies, loadFx, toView } from '../fx';
import { defaultSettings, type Data } from '../types';

const body = { date: '2026-11-09', pkr: { usd: 0.0036, aed: 0.0132 } };
function mk(failFirst = false, failAll = false) {
  const urls: string[] = [];
  const fetch = (async (u: string) => {
    urls.push(u);
    if (failAll || (failFirst && urls.length === 1)) throw new Error('down');
    return { ok: true, json: async () => body } as Response;
  }) as unknown as typeof globalThis.fetch;
  return { urls, fetch };
}
const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } as unknown as Storage;
};

describe('fx', () => {
  it('makes no call with no currencies', async () => {
    const f = mk();
    const fx = await loadFx('PKR', [], [], { fetch: f.fetch, storage: store() });
    expect(f.urls.length).toBe(0);
    expect(fx).toEqual(EMPTY_FX('PKR'));
  });
  it('fetches today and converts', async () => {
    const f = mk();
    const fx = await loadFx('PKR', ['USD'], [], { fetch: f.fetch, storage: store() });
    expect(f.urls.length).toBe(1);
    expect(f.urls[0]).toContain('@latest/v1/currencies/pkr.json');
    expect(toView(100, 'USD', fx)).toBeCloseTo(27777.78, 1);
  });
  it('caches within TTL and refetches after', async () => {
    const f = mk();
    const s = store();
    const now = 1_000_000;
    await loadFx('PKR', ['USD'], [], { fetch: f.fetch, storage: s, now });
    await loadFx('PKR', ['USD'], [], { fetch: f.fetch, storage: s, now: now + 3600e3 });
    expect(f.urls.length).toBe(1);
    await loadFx('PKR', ['USD'], [], { fetch: f.fetch, storage: s, now: now + 13 * 3600e3 });
    expect(f.urls.length).toBe(2);
    expect(FX_TTL_MS).toBe(12 * 3600e3);
  });
  it('falls back to pages.dev', async () => {
    const f = mk(true);
    const fx = await loadFx('PKR', ['USD'], [], { fetch: f.fetch, storage: store() });
    expect(f.urls[1]).toContain('latest.currency-api.pages.dev/v1/currencies/pkr.json');
    expect(fx.failed).toBe(false);
    expect(toView(100, 'USD', fx)).toBeCloseTo(27777.78, 1);
  });
  it('fails with no cache', async () => {
    const fx = await loadFx('PKR', ['USD'], [], { fetch: mk(false, true).fetch, storage: store() });
    expect(fx.failed).toBe(true);
    expect(toView(1, 'USD', fx)).toBeNull();
  });
  it('returns cache on failure', async () => {
    const s = store();
    await loadFx('PKR', ['USD'], [], { fetch: mk().fetch, storage: s, now: 0 });
    const fx = await loadFx('PKR', ['USD'], [], { fetch: mk(false, true).fetch, storage: s, now: 13 * 3600e3 });
    expect(fx.failed).toBe(true);
    expect(toView(100, 'USD', fx)).toBeCloseTo(27777.78, 1);
  });
  it('overrides win; view currency untouched', async () => {
    const fx = await loadFx('PKR', ['USD'], [], { fetch: mk().fetch, storage: store() });
    expect(toView(2, 'USD', { ...fx, overrides: { USD: 280 } })).toBe(560);
    expect(toView(5, 'PKR', fx)).toBe(5);
  });
  it('uses month snapshots, falls back to today, fetches each month once', async () => {
    const f = mk();
    const s = store();
    const fx = await loadFx('PKR', ['USD'], ['2026-09'], { fetch: f.fetch, storage: s });
    expect(f.urls.length).toBe(2);
    expect(f.urls[1]).toContain('@2026-09-01/');
    expect(fx.months['2026-09'].r.USD).toBe(0.0036);
    await loadFx('PKR', ['USD'], ['2026-09'], { fetch: f.fetch, storage: s });
    expect(f.urls.length).toBe(2);
    const custom = { ...fx, months: { '2026-09': { base: 'PKR', date: '2026-09-01', r: { USD: 0.01 } } } };
    expect(toView(1, 'USD', custom, '2026-09')).toBeCloseTo(100);
    expect(toView(1, 'USD', custom, '2026-01')).toBeCloseTo(1 / 0.0036);
  });
  it('collects foreign currencies', () => {
    const d = { settings: defaultSettings('PKR'), accounts: { a: { name: 'a' }, b: { name: 'b', currency: 'usd' } }, debts: [{ currency: 'AED' }], goals: [{ currency: 'PKR' }], gifts: [{ currency: 'USD' }], assets: { currency: 'EUR' } } as unknown as Data;
    expect(foreignCurrencies(d)).toEqual(['AED', 'EUR', 'USD']);
  });
});
