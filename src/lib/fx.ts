import type { Data, Settings } from './types';
import { sym } from './format';

export interface RateSet { base: string; date: string; r: Record<string, number> } // 1 base = r[CUR] CUR
export interface Fx { view: string; today: RateSet | null; months: Record<string, RateSet>; overrides: Record<string, number>; fetchedAt: number | null; failed: boolean }

export const FX_TTL_MS = 12 * 3600e3;
const KEY = 'bachat.rates';

export const EMPTY_FX = (view: string): Fx => ({ view, today: null, months: {}, overrides: {}, fetchedAt: null, failed: false });

export function toView(amt: number, cur: string, fx: Fx, month?: string): number | null {
  if (cur === fx.view) return amt;
  const o = fx.overrides[cur];
  if (o) return amt * o;
  const set = (month && fx.months[month]) || fx.today;
  const rate = set?.r[cur] ?? fx.today?.r[cur];
  return rate ? amt / rate : null;
}

/**
 * Settings amounts (extra debt payment, giving plan, metal prices, impact costs) are in the view currency. When the
 * view currency changes from `from` to `to`, convert them at today's rate: 1 `to` = toView(1, to, fx) `from`, so an
 * amount A in `from` is A ÷ toView(1, to, fx) in `to` (rounded to 2 decimals). `fx` is the current Fx (view `from`).
 * With no rate, the amounts are reset (0, impact null) and `reset` says so if anything non-zero was lost.
 * Manual rates are always cleared: they were per 1 unit in the old view currency.
 */
export function convertSettings(s: Settings, from: string, to: string, fx: Fx): { settings: Settings; reset: boolean } {
  const out: Settings = { ...s, currency: to, fxOverrides: {} };
  if (from.toUpperCase() === to.toUpperCase()) return { settings: out, reset: false };
  const per = fx.view.toUpperCase() === from.toUpperCase() ? toView(1, to.toUpperCase(), fx) : null; // `from` per 1 `to`
  const conv = (n: number) => (per ? Math.round((n / per) * 100) / 100 : 0);
  out.extra = conv(s.extra || 0);
  out.givingPlan = conv(s.givingPlan || 0);
  out.goldPrice = conv(s.goldPrice || 0);
  out.silverPrice = conv(s.silverPrice || 0);
  out.impact = s.impact && per ? { meal: conv(s.impact.meal), school: conv(s.impact.school) } : null;
  const reset = !per && !!(s.extra || s.givingPlan || s.goldPrice || s.silverPrice || s.impact);
  return { settings: out, reset };
}

export function foreignCurrencies(d: Data): string[] {
  const view = d.settings.currency.toUpperCase();
  const all = [
    ...Object.values(d.accounts).map((a) => a.currency),
    ...d.debts.map((x) => x.currency),
    ...d.goals.map((x) => x.currency),
    ...d.gifts.map((x) => x.currency),
    // Gold and silver are in grams (priced in the view currency), so only these amounts use assets.currency.
    ...(d.assets.investments || d.assets.owed || d.assets.stock || d.assets.other ? [d.assets.currency] : [])
  ];
  const out = new Set<string>();
  for (const c of all) {
    const u = c?.toUpperCase();
    if (u && u !== view) out.add(u);
  }
  return [...out].sort();
}

/** "1 USD = ₹83.33, 1 AED = ₹22.69": today's rate (or manual rate) for each currency other than the view; '' if none. */
export function ratesNote(curs: string[], fx: Fx): string {
  const out: string[] = [];
  for (const c of [...new Set(curs.map((x) => x.toUpperCase()))].sort()) {
    if (c === fx.view.toUpperCase()) continue;
    const v = toView(1, c, fx);
    if (v) out.push(`1 ${c} = ${sym(fx.view)}${Number(v.toPrecision(4))}`);
  }
  return out.join(', ');
}

type Cache = Record<string, { today: RateSet | null; fetchedAt: number | null; months: Record<string, RateSet> }>;

function readCache(st: Storage | undefined): Cache {
  try {
    const raw = st?.getItem(KEY);
    return raw ? (JSON.parse(raw) as Cache) : {};
  } catch {
    return {};
  }
}

async function fetchSet(f: typeof fetch, view: string, when: string): Promise<RateSet | null> {
  const base = view.toLowerCase();
  const urls = [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${when}/v1/currencies/${base}.json`,
    `https://${when}.currency-api.pages.dev/v1/currencies/${base}.json`
  ];
  for (const u of urls) {
    try {
      const res = await f(u);
      if (!res.ok) continue;
      const j = (await res.json()) as Record<string, unknown>;
      const raw = j[base] as Record<string, number> | undefined;
      if (!raw || typeof raw !== 'object') continue;
      const r: Record<string, number> = {};
      for (const [k, v] of Object.entries(raw)) if (typeof v === 'number' && v > 0) r[k.toUpperCase()] = v;
      return { base: view, date: String(j.date ?? ''), r };
    } catch {
      /* try next */
    }
  }
  return null;
}

export async function loadFx(
  view: string,
  curs: string[],
  months: string[],
  opts: { fetch?: typeof fetch; now?: number; storage?: Storage } = {}
): Promise<Fx> {
  if (!curs.length) return EMPTY_FX(view);
  const f = opts.fetch ?? globalThis.fetch?.bind(globalThis);
  const now = opts.now ?? Date.now();
  let st: Storage | undefined;
  try { st = opts.storage ?? globalThis.localStorage; } catch { st = undefined; }
  const cache = readCache(st);
  const hit = cache[view] ?? { today: null, fetchedAt: null, months: {} };
  const entry = { today: hit.today, fetchedAt: hit.fetchedAt, months: { ...hit.months } };
  let failed = false;

  if (f) {
    if (!entry.today || entry.fetchedAt == null || now - entry.fetchedAt > FX_TTL_MS) {
      const s = await fetchSet(f, view, 'latest');
      if (s) { entry.today = s; entry.fetchedAt = now; } else failed = true;
    }
    for (const m of months) {
      if (entry.months[m]) continue;
      const s = await fetchSet(f, view, `${m}-01`);
      if (s) entry.months[m] = s; else failed = true;
    }
  } else failed = true;

  try { st?.setItem(KEY, JSON.stringify({ ...cache, [view]: entry })); } catch { /* ignore */ }
  return { view, today: entry.today, months: entry.months, overrides: {}, fetchedAt: entry.fetchedAt, failed };
}
