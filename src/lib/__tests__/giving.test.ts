import { describe, expect, it } from 'vitest';
import { deductionsDue, givingSummary, nextZakatDate, zakat, zakatFor, type ZakatInput } from '../giving';
import { EMPTY_FX } from '../fx';
import type { Model } from '../model';
import { blank } from '../types';

const FX = EMPTY_FX('INR');
const zi = (p: Partial<ZakatInput>): ZakatInput => ({ cash: 0, goldG: 0, silverG: 0, goldPrice: 0, silverPrice: 0, investments: 0, owed: 0, stock: 0, other: 0, deductions: 0, basis: 'silver', ...p });
const model = (p: Partial<Model> = {}): Model => ({ A: [], bankBal: 0, a3: { inc: 0 }, ...p }) as unknown as Model;

describe('zakat', () => {
  it('silver basis, above nisab', () => {
    const r = zakat(zi({ silverPrice: 90, goldPrice: 7750, goldG: 40, cash: 2520000, investments: 200000, deductions: 238000 }));
    expect(r.nisab).toBeCloseTo(612.36 * 90, 6);
    expect(r.nisab).toBeCloseTo(55112.4, 6);
    expect(r.wealth).toBe(2792000);
    expect(r.above).toBe(true);
    expect(r.due).toBeCloseTo(69800, 6);
    expect(r.lines.map((l) => l.label)).toEqual(['Cash & bank', 'Gold', 'Silver', 'Investments', 'Money owed to you', 'Business stock', 'Other', 'Debts due within a year']);
    expect(r.lines[7].amount).toBe(-238000);
  });
  it('gold basis, below nisab', () => {
    const r = zakat(zi({ basis: 'gold', goldPrice: 7750, cash: 500000 }));
    expect(r.nisab).toBeCloseTo(677970, 6);
    expect(r.above).toBe(false);
    expect(r.due).toBe(0);
  });
});

describe('deductionsDue', () => {
  const p = (kind: 'card' | 'loan', balance: number, minPay: number) => ({ id: 'x', name: 'x', kind, balance, apr: 10, minPay });
  it('card balance + 12 EMIs capped at balance', () => {
    expect(deductionsDue([p('card', 68000, 0), p('loan', 472000, 14200)])).toBe(68000 + 170400);
    expect(deductionsDue([p('loan', 50000, 14200)])).toBe(50000);
  });
});

describe('nextZakatDate', () => {
  it('malformed anchor gives null', () => {
    expect(nextZakatDate('', '2026-11-09')).toBeNull();
    expect(nextZakatDate('garbage', '2026-11-09')).toBeNull();
  });
  it('anchor + 354 days', () => {
    expect(nextZakatDate('2026-03-14', '2026-11-09')).toBe('2027-03-03');
    expect(nextZakatDate('2026-03-14', '2026-03-14')).toBe('2026-03-14');
    expect(nextZakatDate('2026-03-14', '2026-01-01')).toBe('2026-03-14');
  });
});

describe('zakat without a price', () => {
  it('needsPrice, not above, nothing due', () => {
    const r = zakat(zi({ basis: 'silver', silverPrice: 0, cash: 1000000 }));
    expect(r.needsPrice).toBe(true);
    expect(r.above).toBe(false);
    expect(r.due).toBe(0);
    expect(r.lines).toHaveLength(8);
    expect(zakat(zi({ basis: 'silver', silverPrice: 90, cash: 1000000 })).needsPrice).toBe(false);
  });
});

describe('zakatFor', () => {
  it('converts a USD asset and USD debt at today\'s rate', () => {
    const fx = { ...EMPTY_FX('INR'), today: { base: 'inr', date: '2026-11-09', r: { USD: 0.01 } } };
    const d = blank();
    d.settings.silverPrice = 90;
    d.assets.currency = 'USD';
    d.assets.investments = 1000; // 100000 INR
    d.debts = [{ id: 'c', name: 'Card', kind: 'card', currency: 'USD', balance: 200, asOf: '2026-11-01', apr: 0, minPay: 0, revolving: true }]; // 20000 INR
    const r = zakatFor(d, model({ bankBal: 500000 }), fx);
    expect(r.wealth).toBeCloseTo(500000 + 100000 - 20000, 6);
  });
  it('counts paid-in-full cards as deductions and converts nothing for view currency', () => {
    const d = blank();
    d.settings.silverPrice = 90;
    d.assets.investments = 200000;
    d.debts = [{ id: 'c', name: 'Card', kind: 'card', currency: 'INR', balance: 68000, asOf: '2026-11-01', apr: 0, minPay: 0, revolving: false }];
    const r = zakatFor(d, model({ bankBal: 1000000 }), FX);
    expect(r.wealth).toBe(1000000 + 200000 - 68000);
  });
});

describe('givingSummary', () => {
  const d = blank();
  d.gifts = [
    { id: 'a', date: '2026-03-01', amount: 20000, currency: 'INR', kind: 'zakat' },
    { id: 'b', date: '2026-05-01', amount: 2500, currency: 'INR', kind: 'sadaqah' }
  ];
  const M = model({ A: [{ date: '2026-07-01', amt: -20000, cat: 'Donations' }, { date: '2026-07-02', amt: -5, cat: 'Food' }] as never, a3: { inc: 100000 } as Model['a3'] });
  it('totals, statement entries, impact', () => {
    d.settings.impact = { meal: 50, school: 25000 };
    const g = givingSummary(d, M, FX, '2026');
    expect(g.year).toBe(42500);
    expect(g.allTime).toBe(42500);
    expect(g.entries.filter((e) => e.fromStatement)).toHaveLength(1);
    expect(g.entries[0].date).toBe('2026-07-01');
    expect(g.meals).toBe(850);
    expect(g.schoolYears).toBe(1.7);
    expect(g.pctIncome).toBeCloseTo(42500 / 1200000, 9);
  });
  it('null impact gives null', () => {
    d.settings.impact = null;
    const g = givingSummary(d, M, FX, '2026');
    expect(g.meals).toBeNull();
    expect(g.schoolYears).toBeNull();
  });
});
