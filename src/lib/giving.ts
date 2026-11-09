import type { Data } from './types';
import { toView, type Fx } from './fx';
import type { Model } from './model';
import type { PayDebt } from './debt';

export const GOLD_NISAB_G = 87.48;
export const SILVER_NISAB_G = 612.36;
export const ZAKAT_RATE = 0.025;
export const LUNAR_YEAR_DAYS = 354;

export interface ZakatInput { cash: number; goldG: number; silverG: number; goldPrice: number; silverPrice: number; investments: number; owed: number; stock: number; other: number; deductions: number; basis: 'silver' | 'gold' }
export interface ZakatResult { wealth: number; nisab: number; above: boolean; due: number; lines: { label: string; amount: number }[] }

export function zakat(i: ZakatInput): ZakatResult {
  const lines = [
    { label: 'Cash & bank', amount: i.cash },
    { label: 'Gold', amount: i.goldG * i.goldPrice },
    { label: 'Silver', amount: i.silverG * i.silverPrice },
    { label: 'Investments', amount: i.investments },
    { label: 'Money owed to you', amount: i.owed },
    { label: 'Business stock', amount: i.stock },
    { label: 'Other', amount: i.other },
    { label: 'Debts due within a year', amount: -i.deductions }
  ];
  const wealth = lines.reduce((t, l) => t + l.amount, 0);
  const nisab = i.basis === 'gold' ? GOLD_NISAB_G * i.goldPrice : SILVER_NISAB_G * i.silverPrice;
  const above = wealth >= nisab && wealth > 0;
  return { wealth, nisab, above, due: above ? wealth * ZAKAT_RATE : 0, lines };
}

/** Debts due within a year: a card counts its whole balance; a loan counts 12 EMIs, never more than the balance. */
export function deductionsDue(debts: PayDebt[]): number {
  return debts.reduce((t, x) => t + (x.kind === 'card' ? x.balance : Math.min(12 * x.minPay, x.balance)), 0);
}

const DAY = 86400000;
const utc = (s: string) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };

/** First date >= today in the series anchor + k × 354 days (k ≥ 0). UTC date math, so DST never shifts a day. */
export function nextZakatDate(anchor: string, today: string): string {
  const a = utc(anchor), t = utc(today);
  const k = t <= a ? 0 : Math.ceil((t - a) / (LUNAR_YEAR_DAYS * DAY));
  return new Date(a + k * LUNAR_YEAR_DAYS * DAY).toISOString().slice(0, 10);
}

export function zakatFor(d: Data, M: Model, fx: Fx, today: string): ZakatResult {
  const s = d.settings, a = d.assets;
  const conv = (n: number) => toView(n, a.currency || fx.view, fx) ?? 0; // no rate: 0 (already in M.fxMissing)
  // Every card balance is owed now (revolving or paid in full), so cards are not filtered like toPayDebts does.
  const debts: PayDebt[] = [];
  for (const x of d.debts) {
    const balance = toView(x.balance, x.currency, fx), minPay = toView(x.minPay, x.currency, fx);
    if (balance === null || minPay === null || balance <= 0) continue;
    debts.push({ id: x.id, name: x.name, kind: x.kind, balance, apr: x.apr, minPay, minPct: x.minPct });
  }
  void today; // the figure is as of today's balances; the date only matters to callers (nextZakatDate)
  return zakat({
    cash: M.bankBal, goldG: a.goldG, silverG: a.silverG, goldPrice: s.goldPrice, silverPrice: s.silverPrice,
    investments: conv(a.investments), owed: conv(a.owed), stock: conv(a.stock), other: conv(a.other),
    deductions: deductionsDue(debts), basis: s.nisab
  });
}

export interface GivingSummary { year: number; allTime: number; pctIncome: number; meals: number | null; schoolYears: number | null; entries: { date: string; amount: number; kind: string; cause?: string; fromStatement: boolean }[] }

export function givingSummary(d: Data, M: Model, fx: Fx, year: string): GivingSummary {
  const entries: GivingSummary['entries'] = [];
  for (const g of d.gifts) {
    const amount = toView(g.amount, g.currency || fx.view, fx, g.date.slice(0, 7));
    if (amount === null) continue;
    entries.push({ date: g.date, amount, kind: g.kind, cause: g.cause, fromStatement: false });
  }
  for (const t of M.A) if (t.cat === 'Donations') entries.push({ date: t.date, amount: -t.amt, kind: 'charity', fromStatement: true });
  entries.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
  const yearTotal = entries.filter((e) => e.date.startsWith(year)).reduce((t, e) => t + e.amount, 0);
  const allTime = entries.reduce((t, e) => t + e.amount, 0);
  const inc = M.a3.inc;
  const im = d.settings.impact;
  return {
    year: yearTotal, allTime,
    pctIncome: inc > 0 ? yearTotal / (12 * inc) : 0,
    meals: im && im.meal > 0 ? Math.floor(yearTotal / im.meal) : null,
    schoolYears: im && im.school > 0 ? Math.round((yearTotal / im.school) * 10) / 10 : null,
    entries
  };
}
