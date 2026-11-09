import { describe, expect, it } from 'vitest';
import { EMPTY_FX, FX_TTL_MS, convertSettings, foreignCurrencies, loadFx, ratesNote, toView } from '../fx';
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
    const d = { settings: defaultSettings('PKR'), accounts: { a: { name: 'a' }, b: { name: 'b', currency: 'usd' } }, debts: [{ currency: 'AED' }], goals: [{ currency: 'PKR' }], gifts: [{ currency: 'USD' }], assets: { currency: 'EUR', investments: 100 } } as unknown as Data;
    expect(foreignCurrencies(d)).toEqual(['AED', 'EUR', 'USD']);
  });
  it('ignores the assets currency while every asset amount is 0', () => {
    // A USD user whose (empty) assets still say INR must make no rate request.
    const d = { settings: defaultSettings('USD'), accounts: { a: { name: 'a', currency: 'USD' } }, debts: [], goals: [], gifts: [], assets: { currency: 'INR', goldG: 40, silverG: 0, investments: 0, owed: 0, stock: 0, other: 0 } } as unknown as Data;
    // goldG is in grams, priced in the view currency, so it does not make INR foreign.
    expect(foreignCurrencies(d)).toEqual([]);
    expect(foreignCurrencies({ ...d, assets: { ...d.assets, other: 5 } })).toEqual(['INR']);
  });
});

describe('convertSettings', () => {
  const s = () => ({ ...defaultSettings('INR'), extra: 8300, givingPlan: 4150, goldPrice: 7750, silverPrice: 90, impact: { meal: 60, school: 25000 }, fxOverrides: { USD: 83 } });
  it('converts settings amounts at today\'s rate and clears manual rates', () => {
    // View INR, today's set: 1 INR = 0.012 USD → 1 USD = 1 / 0.012 = 83.333… INR.
    const fx = { ...EMPTY_FX('INR'), today: { base: 'INR', date: '2026-11-09', r: { USD: 0.012 } } };
    const { settings: o, reset } = convertSettings(s(), 'INR', 'USD', fx);
    expect(reset).toBe(false);
    expect(o.currency).toBe('USD');
    // 8300 × 0.012 = 99.6; 4150 × 0.012 = 49.8; 7750 × 0.012 = 93; 90 × 0.012 = 1.08
    expect(o.extra).toBe(99.6);
    expect(o.givingPlan).toBe(49.8);
    expect(o.goldPrice).toBe(93);
    expect(o.silverPrice).toBe(1.08);
    // 60 × 0.012 = 0.72; 25000 × 0.012 = 300
    expect(o.impact).toEqual({ meal: 0.72, school: 300 });
    expect(o.fxOverrides).toEqual({});
  });
  it('a manual rate for the new currency is used (it wins over today\'s rate)', () => {
    // Override: 1 USD = 80 INR → 8000 INR = 100 USD.
    const fx = { ...EMPTY_FX('INR'), overrides: { USD: 80 } };
    const { settings: o, reset } = convertSettings({ ...s(), extra: 8000 }, 'INR', 'USD', fx);
    expect(reset).toBe(false);
    expect(o.extra).toBe(100);
  });
  it('with no rate: amounts reset to 0 / null and reset is reported', () => {
    const { settings: o, reset } = convertSettings(s(), 'INR', 'USD', EMPTY_FX('INR'));
    expect(reset).toBe(true);
    expect([o.extra, o.givingPlan, o.goldPrice, o.silverPrice]).toEqual([0, 0, 0, 0]);
    expect(o.impact).toBeNull();
    expect(o.fxOverrides).toEqual({});
  });
  it('with no rate and nothing to lose: no reset message', () => {
    const blankS = defaultSettings('USD'); // impact null for USD, all amounts 0
    expect(convertSettings(blankS, 'USD', 'EUR', EMPTY_FX('USD')).reset).toBe(false);
  });
});

describe('ratesNote', () => {
  it('lists today\'s rate per foreign currency, 4 significant figures', () => {
    // 1 INR = 0.012 USD → 1 USD = 83.333… → "83.33"; 1 INR = 0.044 AED → 1 AED = 22.7272… → "22.73".
    const fx = { ...EMPTY_FX('INR'), today: { base: 'INR', date: '2026-11-09', r: { USD: 0.012, AED: 0.044 } } };
    expect(ratesNote(['usd', 'AED', 'INR', 'USD'], fx)).toBe('1 AED = ₹22.73, 1 USD = ₹83.33');
    // No rate for EUR: left out. No foreign currency: ''.
    expect(ratesNote(['EUR'], fx)).toBe('');
    expect(ratesNote([], fx)).toBe('');
  });
});
