import { CTYPE, catOf, isNeed, payee } from './categories';
import { addM, pct, short } from './format';
import { EMPTY_FX, toView, type Fx } from './fx';
import type { CatType, Data, Txn } from './types';
import { kindOf } from './types';

export interface ATxn extends Txn { payee: string; cat: string; type: CatType; m: string; orig: { amt: number; cur: string } | null }
export interface MonthAgg { m: string; inc: number; exp: number; inv: number; cats: Record<string, number>; n: number; saved: number; rate: number }
export interface Account { name: string; n: number; first: string; last: string; bal: number | null; balDate: string | null; list: ATxn[] }
export interface Model {
  A: ATxn[];
  MO: Record<string, MonthAgg>;
  months: string[];
  complete: string[];
  a3: { inc: number; exp: number; saved: number; inv: number; rate: number; months: string[]; needs: number; emi: number; spendExEmi: number };
  acc: Record<string, Account>;
  names: string[];
  end: string | null;
  isComplete: (m: string) => boolean;
  totalBal: number;
  hasBal: boolean;
  trend: (number | null)[];
  fxMissing: string[];
  needs: Record<string, number>;
  bankBal: number;
  debtTotal: number;
  assetsTotal: number;
  netWorth: number;
}

export function build(d: Data, fx: Fx = EMPTY_FX(d.settings.currency)): Model {
  const view = fx.view;
  const missing = new Set<string>();
  const curOf = (name: string) => d.accounts[name]?.currency || view;
  const A: ATxn[] = [];
  for (const t of d.txns) {
    const cur = curOf(t.acct);
    const v = toView(t.amt, cur, fx, t.date.slice(0, 7));
    if (v == null) { missing.add(cur); continue; }
    const p = payee(t.desc);
    const c = catOf(t, p, d);
    A.push({ ...t, amt: v, payee: p, cat: c, type: CTYPE[c] || 'expense', m: t.date.slice(0, 7), orig: cur === view ? null : { amt: t.amt, cur } });
  }
  A.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.seq - b.seq));

  const MO: Record<string, MonthAgg> = {};
  const blankM = (m: string): MonthAgg => ({ m, inc: 0, exp: 0, inv: 0, cats: {}, n: 0, saved: 0, rate: NaN });
  for (const t of A) {
    const o = MO[t.m] || (MO[t.m] = blankM(t.m));
    o.n++;
    if (t.type === 'income') o.inc += t.amt;
    else if (t.type === 'expense') { o.exp -= t.amt; o.cats[t.cat] = (o.cats[t.cat] || 0) - t.amt; }
    else if (t.type === 'investment') o.inv -= t.amt;
  }
  let months = Object.keys(MO).sort();
  if (months.length) {
    const all: string[] = [];
    for (let m = months[0]; m <= months[months.length - 1]; m = addM(m, 1)) { all.push(m); if (!MO[m]) MO[m] = blankM(m); }
    months = all;
  }
  for (const m of months) { const o = MO[m]; o.saved = o.inc - o.exp; o.rate = o.inc > 0 ? o.saved / o.inc : NaN; }

  const acc: Record<string, Account> = {};
  for (const t of A) {
    const a = acc[t.acct] || (acc[t.acct] = { name: t.acct, n: 0, first: t.date, last: t.date, bal: null, balDate: null, list: [] });
    a.n++; a.last = t.date; a.list.push(t);
    if (t.bal != null) {
      const b = toView(t.bal, curOf(t.acct), fx);
      if (b == null) missing.add(curOf(t.acct));
      else { a.bal = b; a.balDate = t.date; t.bal = b; }
    }
  }
  const names = Object.keys(acc);
  // Data is only as current as the account with the oldest latest-transaction.
  const isBank = (n: string) => kindOf(d.accounts[n]) === 'bank';
  const banks = names.filter(isBank);
  const gate = banks.length ? banks : names;
  const end = gate.length ? gate.map((n) => acc[n].last).sort()[0] : null;
  const endM = end ? end.slice(0, 7) : null;
  const endDay = end ? +end.slice(8) : 0;
  const isComplete = (m: string) => !!endM && (m < endM || (m === endM && endDay >= 25));
  const complete = months.filter(isComplete);
  const last3 = complete.slice(-3);
  const avg = (k: 'inc' | 'exp' | 'saved' | 'inv') => (last3.length ? last3.reduce((s, m) => s + MO[m][k], 0) / last3.length : 0);
  const needs: Record<string, number> = {};
  for (const m of months) needs[m] = 0;
  for (const t of A) if (t.type === 'expense' && isNeed(t.cat, d.settings)) needs[t.m] += -t.amt;
  const avgOf = (f: (m: string) => number) => (last3.length ? last3.reduce((s, m) => s + f(m), 0) / last3.length : 0);
  const a3 = { inc: avg('inc'), exp: avg('exp'), saved: avg('saved'), inv: avg('inv'), rate: NaN, months: last3, needs: avgOf((m) => needs[m]), emi: avgOf((m) => MO[m].cats['Loan EMI'] || 0), spendExEmi: 0 };
  a3.spendExEmi = a3.exp - a3.emi;
  a3.rate = a3.inc > 0 ? a3.saved / a3.inc : NaN;
  const totalBal = banks.reduce((s, n) => s + (acc[n].bal || 0), 0);
  const hasBal = names.some((n) => acc[n].bal != null);
  const trend = months.map((m) => {
    let s = 0, any = false;
    for (const n of banks) {
      let b: number | null = null;
      for (const t of acc[n].list) { if (t.m > m) break; if (t.bal != null) b = t.bal; }
      if (b != null) { s += b; any = true; }
    }
    return any ? s : null;
  });
  const conv = (amt: number, cur: string) => {
    const v = toView(amt, cur, fx);
    if (v == null) { missing.add(cur); return 0; }
    return v;
  };
  const debtTotal = d.debts.reduce((s, x) => s + conv(x.balance, x.currency || view), 0);
  const as = d.assets;
  const assetsTotal = conv(as.investments + as.owed + as.stock + as.other, as.currency || view)
    + as.goldG * d.settings.goldPrice + as.silverG * d.settings.silverPrice;
  const bankBal = totalBal;
  const netWorth = bankBal + assetsTotal - debtTotal;
  return { A, MO, months, complete, a3, acc, names, end, isComplete, totalBal, hasBal, trend, fxMissing: [...missing].sort(), needs, bankBal, debtTotal, assetsTotal, netWorth };
}

export function defaultMonth(M: Model, chosen: string | null): string | null {
  if (!M.months.length) return null;
  if (chosen && M.MO[chosen]) return chosen;
  return M.complete.length ? M.complete[M.complete.length - 1] : M.months[M.months.length - 1];
}

export function priorAvg(M: Model, m: string, cat?: string, k = 3): number | null {
  let s = 0, n = 0;
  for (let i = 1; i <= k; i++) {
    const p = addM(m, -i);
    const o = M.MO[p];
    if (o && o.n) { s += cat ? o.cats[cat] || 0 : o.exp; n++; }
  }
  return n ? s / n : null;
}

export type Tone = 'good' | 'warn' | 'bad' | 'info';
export const rateTone = (r: number): Tone => (!isFinite(r) ? 'info' : r >= 0.4 ? 'good' : r >= 0.2 ? 'warn' : 'bad');

export function insights(M: Model, m: string): { tone: Tone; t: string; d: string }[] {
  const out: { tone: Tone; t: string; d: string }[] = [];
  const o = M.MO[m];
  const a = M.a3;
  if (a.months.length) {
    const r = a.rate;
    const span = a.months.length === 3 ? 'the last 3 full months' : a.months.length + ' full month' + (a.months.length > 1 ? 's' : '');
    out.push({ tone: rateTone(r), t: `You keep ${pct(r)} of what you earn`, d: `Average over ${span}: ${short(a.inc)} in, ${short(a.exp)} out. ${r >= 0.5 ? 'That is an excellent savings rate.' : r >= 0.2 ? 'Healthy. 20% is the usual minimum; 40%+ builds wealth fast.' : 'Below the usual 20% minimum.'}` });
  }
  const sp = Object.entries(o.cats)
    .map(([c, v]) => { const pa = priorAvg(M, m, c); return { c, v, pa, d: pa != null ? v - pa : 0 }; })
    .filter((x) => x.pa != null && x.v > 5000 && x.v > 1.5 * (x.pa as number) && x.d > 3000)
    .sort((x, y) => y.d - x.d);
  if (sp[0]) out.push({ tone: 'warn', t: `${sp[0].c} is up ${short(sp[0].d)}`, d: `${short(sp[0].v)} this month against your usual ${short(sp[0].pa as number)}.` });
  const unk = (o.cats['Uncategorized'] || 0) + (o.cats['Other UPI payments'] || 0);
  if (o.exp > 0 && unk / o.exp > 0.25) out.push({ tone: 'info', t: `${pct(unk / o.exp)} of spending has no clear category`, d: "Mostly UPI payments to people or shops we don't recognise. Tag them under Spending and every future payment to them follows." });
  const cash = o.cats['Cash withdrawal'] || 0;
  if (o.exp > 0 && cash / o.exp > 0.15) out.push({ tone: 'info', t: `${short(cash)} taken out as cash`, d: `That's ${pct(cash / o.exp)} of spending we can't see into.` });
  if (M.hasBal && a.exp > 0 && M.totalBal > 12 * a.exp && a.inv < a.saved * 0.25)
    out.push({ tone: 'warn', t: `${short(M.totalBal - 6 * a.exp)} could be working harder`, d: `You hold ${Math.round(M.totalBal / a.exp)} months of spending in the bank and invest little. Keep 6–12 months as an emergency fund and invest the rest.` });
  if (!out.length) out.push({ tone: 'info', t: 'Add a few months of statements', d: 'Insights appear once there are at least two full months to compare.' });
  return out.slice(0, 4);
}
