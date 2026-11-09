import { describe, expect, it } from 'vitest';
import { compare, minPayment, monthlyDebtPayment, payoff, toPayDebts, type PayDebt } from '../debt';
import { EMPTY_FX } from '../fx';
import { defaultSettings, type Data } from '../types';

const card: PayDebt = { id: 'card', name: 'Card', kind: 'card', balance: 68000, apr: 42, minPay: 3400 };
const loan: PayDebt = { id: 'loan', name: 'Loan', kind: 'loan', balance: 472000, apr: 9.5, minPay: 14200 };
const small: PayDebt = { id: 'small', name: 'Small', kind: 'loan', balance: 20000, apr: 5, minPay: 1000 };

describe('debt payoff', () => {
  it('standard EMI loan clears in 12 months', () => {
    const r = payoff([{ id: 'l', name: 'L', kind: 'loan', balance: 100000, apr: 12, minPay: 8884.88 }], 'avalanche', 0);
    expect(r.months).toBe(12);
    expect(Math.abs(r.interest - 6618.56)).toBeLessThan(1);
    expect(r.payments).toHaveLength(12);
  });
  it('avalanche vs snowball ordering', () => {
    expect(payoff([card, loan], 'avalanche', 10000).order[0].id).toBe('card');
    expect(payoff([card, loan], 'snowball', 10000).order[0].id).toBe('card');
    expect(payoff([card, loan, small], 'snowball', 10000).order[0].id).toBe('small');
    expect(payoff([card, loan, small], 'avalanche', 10000).order[0].id).toBe('card');
  });
  it('compare shows savings', () => {
    const c = compare([card, loan], 'avalanche', 10000);
    expect(c.interestSaved).toBeGreaterThan(0);
    expect(c.monthsSaved).toBeGreaterThan(0);
  });
  it('never-ending card', () => {
    const r = payoff([{ id: 'c', name: 'C', kind: 'card', balance: 100000, apr: 36, minPay: 2000, minPct: 0 }], 'avalanche', 0);
    expect(r.never).toContain('c');
    expect(r.months).toBe(Infinity);
  });
  it('zero apr, zero min terminates', () => {
    const r = payoff([{ id: 'z', name: 'Z', kind: 'loan', balance: 1000, apr: 0, minPay: 0 }], 'snowball', 0);
    expect(r.months).toBe(Infinity);
    expect(r.never).toContain('z');
  });
  it('rolls budgeted payments of cleared debts into the pool', () => {
    const a: PayDebt = { id: 'a', name: 'A', kind: 'loan', balance: 1000, apr: 0, minPay: 100 };
    const b: PayDebt = { id: 'b', name: 'B', kind: 'loan', balance: 3000, apr: 0, minPay: 100 };
    const r = payoff([a, b], 'avalanche', 0);
    expect(r.order).toEqual([{ id: 'a', month: 10 }, { id: 'b', month: 20 }]);
    expect(r.months).toBe(20);
    expect(r.payments.every((p) => Math.abs(p - 200) < 1e-9)).toBe(true);
    expect(r.payments.reduce((s, x) => s + x, 0)).toBeCloseTo(4000);
    const e = payoff([a, b], 'avalanche', 50);
    expect(e.payments[0]).toBeCloseTo(250);
    expect(e.payments.reduce((s, x) => s + x, 0)).toBeCloseTo(4000);
  });
  it('capped final payment: unused budget goes to the next target the same month', () => {
    const a: PayDebt = { id: 'a', name: 'A', kind: 'loan', balance: 950, apr: 0, minPay: 100 };
    const b: PayDebt = { id: 'b', name: 'B', kind: 'loan', balance: 3000, apr: 0, minPay: 100 };
    const r = payoff([a, b], 'avalanche', 0);
    expect(r.order).toEqual([{ id: 'a', month: 10 }, { id: 'b', month: 20 }]);
    expect(r.months).toBe(20);
    r.payments.slice(0, -1).forEach((p) => expect(p).toBeCloseTo(200));
    expect(r.payments[19]).toBeCloseTo(150);
    expect(r.payments.reduce((x, y) => x + y, 0)).toBeCloseTo(3950);
  });
  it('declining card minimum keeps total outlay constant', () => {
    const card: PayDebt = { id: 'c', name: 'C', kind: 'card', balance: 10000, apr: 0, minPay: 0, minPct: 5 };
    const l: PayDebt = { id: 'l', name: 'L', kind: 'loan', balance: 5000, apr: 0, minPay: 500 };
    const r = payoff([card, l], 'snowball', 0);
    expect(Number.isFinite(r.months)).toBe(true);
    r.payments.slice(0, -1).forEach((p) => expect(p).toBeCloseTo(1000));
    expect(r.payments.reduce((x, y) => x + y, 0)).toBeCloseTo(15000);
  });
  it('minPayment', () => {
    const c: PayDebt = { id: 'c', name: 'C', kind: 'card', balance: 0, apr: 30, minPay: 200, minPct: 5 };
    expect(minPayment(c, 1000)).toBe(200);
    expect(minPayment(c, 10000)).toBe(500);
    expect(minPayment(c, 100)).toBeCloseTo(102.5);
  });
  it('monthlyDebtPayment sums minimums', () => {
    expect(monthlyDebtPayment([card, loan])).toBe(3400 + 14200);
  });
  it('toPayDebts filters and converts', () => {
    const base = { debts: [
      { id: 'a', name: 'A', kind: 'card', currency: 'PKR', balance: 100, asOf: '2026-11-01', apr: 30, minPay: 10, revolving: true },
      { id: 'b', name: 'B', kind: 'card', currency: 'PKR', balance: 100, asOf: '2026-11-01', apr: 0, minPay: 0, revolving: false },
      { id: 'c', name: 'C', kind: 'loan', currency: 'USD', balance: 10, asOf: '2026-11-01', apr: 5, minPay: 1, revolving: false },
      { id: 'd', name: 'D', kind: 'loan', currency: 'PKR', balance: 0, asOf: '2026-11-01', apr: 5, minPay: 1, revolving: false }
    ], settings: { ...defaultSettings, currency: 'PKR' } } as unknown as Data;
    expect(toPayDebts(base, EMPTY_FX('PKR')).map((x) => x.id)).toEqual(['a']);
    const fx = { ...EMPTY_FX('PKR'), overrides: { USD: 280 } };
    const r = toPayDebts(base, fx);
    expect(r.map((x) => x.id)).toEqual(['a', 'c']);
    expect(r[1].balance).toBe(2800);
  });
});
