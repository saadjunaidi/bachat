import { describe, expect, it } from 'vitest';
import { build } from '../model';
import { EMPTY_FX, type Fx } from '../fx';
import { blank, type Data, type Txn } from '../types';

let n = 0;
const tx = (acct: string, date: string, desc: string, amt: number, bal: number | null = null): Txn => ({ id: 't' + ++n, acct, date, desc, amt, bal, seq: n });
const data = (view = 'PKR'): Data => { const d = blank(); d.settings.currency = view; d.assets.currency = view; return d; };
const fxOf = (view: string, month: Record<string, number>, today: Record<string, number>): Fx => ({
  ...EMPTY_FX(view),
  today: { base: view, date: '2026-11-09', r: today },
  months: { '2026-10': { base: view, date: '2026-10-01', r: month } }
});

function mixed(): Data {
  const d = data();
  d.accounts = { PK: { name: 'PK', currency: 'PKR' }, US: { name: 'US', currency: 'USD' } };
  d.txns = [tx('PK', '2026-10-02', 'SALARY', 300000, 300000), tx('US', '2026-10-05', 'AMAZON', -100, 1000)];
  return d;
}

describe('model currency', () => {
  const fx = fxOf('PKR', { USD: 0.0036 }, { USD: 0.0035 });
  it('converts txns at month rate and balances at today rate', () => {
    const M = build(mixed(), fx);
    expect(M.MO['2026-10'].exp).toBeCloseTo(27777.78, 1);
    expect(M.A.find((t) => t.orig)?.orig).toEqual({ amt: -100, cur: 'USD' });
    expect(M.bankBal).toBeCloseTo(300000 + 285714.29, 1);
    expect(M.fxMissing).toEqual([]);
  });
  it('drops txns without a rate and reports the currency', () => {
    const M = build(mixed(), EMPTY_FX('PKR'));
    expect(M.fxMissing).toEqual(['USD']);
    expect(M.MO['2026-10'].exp).toBe(0);
  });
  it('does not mutate data when the view currency changes', () => {
    const d = mixed();
    const snap = JSON.stringify(d);
    const usd: Fx = { ...EMPTY_FX('USD'), today: { base: 'USD', date: 'x', r: { PKR: 285 } }, months: { '2026-10': { base: 'USD', date: 'x', r: { PKR: 280 } } } };
    const M = build(d, usd);
    expect(M.MO['2026-10'].exp).toBe(100);
    expect(M.MO['2026-10'].inc).toBeCloseTo(300000 / 280, 5);
    expect(JSON.stringify(d)).toBe(snap);
  });
});

describe('model kinds', () => {
  it('counts a card purchase once', () => {
    const d = data();
    d.accounts = { Bank: { name: 'Bank' }, Card: { name: 'Card', kind: 'card' } };
    d.txns = [tx('Card', '2026-10-03', 'AMAZON', -5000), tx('Bank', '2026-10-10', 'CREDIT CARD PAYMENT', -5000, 100)];
    const M = build(d);
    expect(M.MO['2026-10'].exp).toBe(5000);
    expect(M.MO['2026-10'].cats['Shopping']).toBe(5000);
  });
  it('ignores loan accounts for completeness', () => {
    const d = data();
    d.accounts = { Bank: { name: 'Bank' }, Loan: { name: 'Loan', kind: 'loan' } };
    d.txns = [tx('Bank', '2026-05-10', 'SALARY', 1000, 1000), tx('Bank', '2026-10-28', 'SALARY', 1000, 2000), tx('Loan', '2026-05-12', 'EMI', -10)];
    const M = build(d);
    expect(M.isComplete('2026-10')).toBe(true);
    expect(M.end).toBe('2026-10-28');
  });
});

describe('model needs and EMI', () => {
  const base = () => {
    const d = data();
    d.accounts = { Bank: { name: 'Bank' } };
    d.txns = [tx('Bank', '2026-09-03', 'HOUSE RENT', -42000), tx('Bank', '2026-09-04', 'AMAZON', -10000), tx('Bank', '2026-09-05', 'EMI', -7000), tx('Bank', '2026-10-20', 'SALARY', 100000, 1)];
    return d;
  };
  it('splits needs', () => {
    expect(build(base()).needs['2026-09']).toBe(42000);
    const d = base(); d.settings.needs = { Shopping: true };
    expect(build(d).needs['2026-09']).toBe(52000);
    const e = base(); e.settings.needs = { 'Loan EMI': true };
    expect(build(e).needs['2026-09']).toBe(42000);
  });
  it('averages EMI and spend ex EMI', () => {
    const M = build(base());
    expect(M.a3.months).toEqual(['2026-09']);
    expect(M.a3.emi).toBe(7000);
    expect(M.a3.spendExEmi).toBe(M.a3.exp - 7000);
    expect(M.a3.needs).toBe(42000);
  });
});

describe('net worth', () => {
  it('adds assets and subtracts debts', () => {
    const d = data();
    d.accounts = { Bank: { name: 'Bank' } };
    d.txns = [tx('Bank', '2026-10-02', 'SALARY', 1000, 50000)];
    d.assets.investments = 100000; d.assets.goldG = 10; d.settings.goldPrice = 7000;
    d.debts = [{ id: 'd', name: 'x', kind: 'loan', currency: 'PKR', balance: 20000, asOf: '2026-10-01', apr: 0, minPay: 0, revolving: false }];
    const M = build(d);
    expect(M.netWorth).toBe(M.bankBal + 170000 - 20000);
    expect(M.bankBal).toBe(50000);
  });
});

describe('model fx edge cases', () => {
  it('ignores balances with no today rate', () => {
    const d = data();
    d.accounts = { PK: { name: 'PK', currency: 'PKR' }, US: { name: 'US', currency: 'USD' } };
    d.txns = [tx('PK', '2026-10-02', 'SALARY', 1000, 5000), tx('US', '2026-10-05', 'AMAZON', -100, 1000)];
    const fx: Fx = { ...EMPTY_FX('PKR'), months: { '2026-10': { base: 'PKR', date: 'x', r: { USD: 0.0036 } } } };
    const M = build(d, fx);
    expect(M.bankBal).toBe(5000);
    expect(M.trend[0]).toBe(5000);
    expect(M.fxMissing).toContain('USD');
  });
  it('hasBal ignores non-bank accounts', () => {
    const d = data();
    d.accounts = { Card: { name: 'Card', kind: 'card' } };
    d.txns = [tx('Card', '2026-10-02', 'AMAZON', -100, -100)];
    expect(build(d).hasBal).toBe(false);
  });
  it('converts foreign debts and excludes unrated ones', () => {
    const d = data();
    d.debts = [{ id: 'd', name: 'x', kind: 'loan', currency: 'USD', balance: 100, asOf: '2026-10-01', apr: 0, minPay: 0, revolving: false }];
    const fx = fxOf('PKR', {}, { USD: 0.0035 });
    expect(build(d, fx).debtTotal).toBeCloseTo(28571.43, 1);
    const M = build(d);
    expect(M.debtTotal).toBe(0);
    expect(M.fxMissing).toEqual(['USD']);
  });
});

describe('large credits in spending categories', () => {
  it('a refund larger than the month’s spend in that category never makes spending negative', () => {
    const d = data('INR');
    d.accounts = { B: { name: 'B', kind: 'bank', currency: 'INR' } };
    d.txns = [
      tx('B', '2026-10-01', 'SALARY ACME', 100000),
      tx('B', '2026-10-05', 'AMAZON ORDER', -20000),       // Shopping −20,000
      tx('B', '2026-10-09', 'AMAZON REFUND ORDER', 5000),  // genuine refund: 'refund' rule → Refunds & cashback (income)
      tx('B', '2026-10-10', 'HOUSE RENT OCT', -30000),      // Rent & housing −30,000 (a need)
      tx('B', '2026-10-20', 'NEFT SHARMA HOUSE RENT RECEIVED', 400000) // credit matching 'house rent' → Rent & housing
    ];
    const o = build(d, EMPTY_FX('INR')).MO['2026-10'];
    // Rent & housing: −30,000 + 400,000 → floored at 0; the 370,000 excess is money in.
    expect(o.cats['Rent & housing']).toBe(0);
    expect(o.exp).toBe(20000);                    // only Shopping remains
    expect(o.inc).toBe(100000 + 5000 + 370000);   // salary + refund income + excess credit
    expect(o.saved).toBe(475000 - 20000);
  });
  it('needs never go negative because of a large credit', () => {
    const d = data('INR');
    d.accounts = { B: { name: 'B', kind: 'bank', currency: 'INR' } };
    d.txns = ['2026-08', '2026-09', '2026-10'].flatMap((m) => [
      tx('B', `${m}-01`, 'SALARY ACME', 100000, null),
      tx('B', `${m}-03`, 'HOUSE RENT', -30000, null),
      tx('B', `${m}-28`, 'BLINKIT', -10000, null)
    ]).concat([tx('B', '2026-10-20', 'HOUSE RENT RECEIVED TENANT', 400000, null)]);
    const M = build(d, EMPTY_FX('INR'));
    // Oct needs: rent floored to 0 + groceries 10,000 = 10,000; Aug/Sep: 40,000 each → avg 30,000.
    expect(M.needs['2026-10']).toBe(10000);
    expect(M.a3.needs).toBe(30000);
  });
});
