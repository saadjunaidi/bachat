import type { Data } from './types';
import { toView, type Fx } from './fx';

export const CARD_MIN_PCT_DEFAULT = 5;
const EPS = 0.005;

export interface PayDebt { id: string; name: string; kind: 'card' | 'loan'; balance: number; apr: number; minPay: number; minPct?: number }
export interface PayoffResult { order: { id: string; month: number }[]; months: number; interest: number; never: string[]; payments: number[] /* total paid per month index */ }

/** Minimum payment for a balance `bal` (before this month's interest); never more than bal + this month's interest. */
export function minPayment(d: PayDebt, bal: number): number {
  const raw = d.kind === 'card' ? Math.max(d.minPay, (bal * (d.minPct ?? CARD_MIN_PCT_DEFAULT)) / 100) : d.minPay;
  return Math.max(0, Math.min(raw, bal + (bal * d.apr) / 1200));
}

export function payoff(debts: PayDebt[], strategy: 'avalanche' | 'snowball', extra: number, maxMonths = 600): PayoffResult {
  const bal = new Map<string, number>(debts.map((d) => [d.id, Math.max(0, d.balance)]));
  const done = new Set<string>();
  // Budgeted payment: fixed at plan start (uncapped minimum at the initial balance). Whatever a debt does not need
  // in a month (capped/declining minimum), and its full budget once cleared (from the month after), joins the pool.
  const budget = new Map<string, number>(debts.map((d) => [d.id, d.kind === 'card' ? Math.max(d.minPay, (Math.max(0, d.balance) * (d.minPct ?? CARD_MIN_PCT_DEFAULT)) / 100) : d.minPay]));
  const order: { id: string; month: number }[] = [];
  const payments: number[] = [];
  const never: string[] = [];
  let interest = 0;

  for (const d of debts) {
    if ((bal.get(d.id) ?? 0) <= EPS) { done.add(d.id); continue; }
    const b = bal.get(d.id)!;
    if (extra <= 0 && minPayment(d, b) <= (b * d.apr) / 1200) never.push(d.id);
  }

  const rank = (a: PayDebt, b: PayDebt) => {
    const ba = bal.get(a.id)!, bb = bal.get(b.id)!;
    return strategy === 'avalanche' ? b.apr - a.apr || ba - bb : ba - bb || b.apr - a.apr;
  };

  let month = 0;
  while (done.size < debts.length && month < maxMonths) {
    let paid = 0;
    let pool = Math.max(0, extra);
    for (const d of debts) if (done.has(d.id)) pool += budget.get(d.id)!;
    const live = debts.filter((d) => !done.has(d.id));
    for (const d of live) {
      const b = bal.get(d.id)!;
      const i = (b * d.apr) / 1200;
      interest += i;
      const min = minPayment(d, b);
      const nb = b + i - min;
      paid += min;
      pool += Math.max(0, budget.get(d.id)! - min);
      bal.set(d.id, nb);
      if (nb <= EPS) {
        bal.set(d.id, 0);
        done.add(d.id);
        order.push({ id: d.id, month: month + 1 });
      }
    }
    for (const d of [...live.filter((x) => !done.has(x.id))].sort(rank)) {
      if (pool <= EPS) break;
      const b = bal.get(d.id)!;
      const pay = Math.min(pool, b);
      pool -= pay;
      paid += pay;
      const nb = b - pay;
      bal.set(d.id, nb);
      if (nb <= EPS) {
        bal.set(d.id, 0);
        done.add(d.id);
        order.push({ id: d.id, month: month + 1 });
      }
    }
    payments.push(paid);
    month++;
  }

  return { order, months: done.size >= debts.length ? month : Infinity, interest, never, payments };
}

export function compare(debts: PayDebt[], strategy: 'avalanche' | 'snowball', extra: number): { base: PayoffResult; chosen: PayoffResult; interestSaved: number; monthsSaved: number } {
  const base = payoff(debts, strategy, 0);
  const chosen = payoff(debts, strategy, extra);
  const monthsSaved = Number.isFinite(chosen.months) ? base.months - chosen.months : 0;
  // interestSaved is NaN when base never clears (UI shows "never at minimums").
  const interestSaved = Number.isFinite(base.months) ? base.interest - chosen.interest : NaN;
  return { base, chosen, interestSaved, monthsSaved };
}

export function monthlyDebtPayment(debts: PayDebt[]): number {
  return debts.reduce((s, d) => s + minPayment(d, d.balance), 0);
}

export function toPayDebts(d: Data, fx: Fx): PayDebt[] {
  const out: PayDebt[] = [];
  for (const x of d.debts) {
    if (x.kind === 'card' && !x.revolving) continue;
    const balance = toView(x.balance, x.currency, fx);
    const minPay = toView(x.minPay, x.currency, fx);
    if (balance === null || minPay === null || balance <= 0) continue;
    out.push({ id: x.id, name: x.name, kind: x.kind, balance, apr: x.apr, minPay, minPct: x.minPct });
  }
  return out;
}
