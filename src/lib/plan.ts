import { monthlyDebtPayment, payoff, toPayDebts } from './debt';
import { needed } from './finance';
import { addM, mdiff, mlabel, short } from './format';
import { toView, type Fx } from './fx';
import type { Model } from './model';
import type { Data, LongTerm, ShortGoal } from './types';

/**
 * The monthly money plan. Every headline number on Overview, Goals and Debts comes from `plan()`.
 *
 * Month convention used throughout: `now` is the current month (YYYY-MM). Month index k = 1 is the first
 * month of saving/paying and lands on `addM(now, k)`. So a goal due `n = mdiff(now, date)` months out gets n
 * monthly amounts, a target `months` away is reached at `addM(now, months)`, and the debts are clear at
 * `addM(now, payoff().months)` (payoff counts payments, 1-based). The debt line's money joins the long-term
 * contribution from month index `payoff().months + 1`.
 */

/** A stretch may wait, or slow the long-term goal, by at most this many months (not a user setting). */
export const STRETCH_MAX_MONTHS = 24;
/** A price of this many months of average income or more needs a loan: never better than bad unless it fits outright. */
export const BAD_INCOME_MULTIPLE = 24;
/** "Earliest it becomes a good deal" is searched up to 50 years after the goal's date. */
const EARLIEST_MAX_MONTHS = 600;
/** Long-term projection horizon (100 years), matching finance.monthsTo. */
const HORIZON_MONTHS = 1200;
const EPS = 1e-9;
/** Money tolerance: amounts within half a paisa/cent of 0 are 0 (float residue, never shown as "₹0 short"). */
const MONEY_EPS = 0.005;
const snap = (x: number) => (Math.abs(x) < MONEY_EPS ? 0 : x);

export interface PlanLine { key: 'income' | 'needs' | 'debt' | 'giving' | 'longTerm' | 'goals'; label: string; amount: number; explain: string }
/**
 * All figures in today's money. `monthsVsTarget` = targetMonth − projected in months: positive = ahead
 * (earlier than the target), negative = behind, null when not projectable.
 */
export interface LongTermResult { target: number; have: number; reserve: number; yearlySpend: number; targetMonth: string | null; projected: string | null; status: 'ahead' | 'on' | 'behind' | 'needAge'; monthsVsTarget: number | null; projectedNoExtra: string | null }
export type Verdict = 'good' | 'stretch' | 'bad';
export interface GoalResult { id: string; verdict: Verdict; priceAdj: number; monthly: number; effDate: string; waitDate: string | null; waitMonthly: number | null; onTimeSlip: number | null; earliest: string | null; incomeMultiple: number; reason: string }
/** `explain` is the guilt-free calculation in one sentence with the user's numbers. */
export interface Plan { ready: boolean; lines: PlanLine[]; guiltFree: number; shortfall: number; biggest: string | null; longTerm: LongTermResult; goals: GoalResult[]; debtFree: string | null; netWorth: number; explain: string }
/** Inputs other tasks wire in. Task 7: pass `zakatMonthly` (zakat due ÷ 12, already 0 when Islamic guidance is off). */
export interface PlanOpts { zakatMonthly?: number }
/** Months the long-term date moves later if `cut` comes out of the reserve in months 1..`months`, on top of cuts `prior(k)` already taken. */
export type LtSlip = (cut: number, months: number, prior?: (k: number) => number) => number;

export function suggestAge(type: LongTerm['type'], age: number): number {
  return type === 'retirement' ? Math.max(60, age + 10) : Math.max(50, age + 15);
}

export const realReturn = (lt: LongTerm) => (1 + lt.ret / 100) / (1 + lt.infl / 100) - 1;

/** Months until `have`, growing at a yearly real return plus contrib(k) each month, reaches `target`; 0 if already there, Infinity if not within 100 years. */
export function projectMonths(have: number, target: number, yearly: number, contrib: (k: number) => number): number {
  const tol = target * EPS + EPS; // floating-point slack so an exact plan lands on its month
  if (have >= target - tol) return 0;
  const r = Math.pow(1 + yearly, 1 / 12) - 1;
  let b = have;
  for (let k = 1; k <= HORIZON_MONTHS; k++) {
    b = b * (1 + r) + contrib(k);
    if (b >= target - tol) return k;
  }
  return Infinity;
}

export function longTerm(input: { yearlySpend: number; have: number; age: number | null; lt: LongTerm; now: string; contrib: (k: number) => number; contribNoExtra?: (k: number) => number }): LongTermResult {
  const { yearlySpend, have, age, lt, now } = input;
  const target = yearlySpend * lt.mult * (lt.type === 'retirement' ? lt.retirePct / 100 : 1);
  const base = { target, have, yearlySpend };
  if (age == null || !Number.isFinite(age) || lt.targetAge == null) {
    return { ...base, reserve: 0, targetMonth: null, projected: null, status: 'needAge', monthsVsTarget: null, projectedNoExtra: null };
  }
  const months = Math.round((lt.targetAge - age) * 12);
  // A target age at or below the current age can't be planned for: ask for a later one (the view's explain says so).
  if (months <= 0) return { ...base, reserve: 0, targetMonth: null, projected: null, status: 'needAge', monthsVsTarget: null, projectedNoExtra: null };
  const rr = realReturn(lt);
  const reserve = needed(target, have, months, rr);
  const at = (c: (k: number) => number) => { const m = projectMonths(have, target, rr, c); return Number.isFinite(m) ? m : null; };
  const pm = at(input.contrib);
  const pm0 = input.contribNoExtra ? at(input.contribNoExtra) : pm;
  const monthsVsTarget = pm == null ? null : months - pm;
  const status = monthsVsTarget == null ? 'behind' : Math.abs(monthsVsTarget) <= 1 ? 'on' : monthsVsTarget > 0 ? 'ahead' : 'behind';
  return {
    ...base, reserve, targetMonth: addM(now, months),
    projected: pm == null ? null : addM(now, pm), status, monthsVsTarget,
    projectedNoExtra: pm0 == null ? null : addM(now, pm0)
  };
}

const times = (x: number) => String(Math.round(x * 10) / 10) + '×';
const monthsWord = (n: number) => n + (n === 1 ? ' month' : ' months');

/**
 * Shares `avail` (left after needs, debt, giving and the long-term reserve) among the goals.
 *
 * Order: ascending ORIGINAL `goal.date` (ties keep list order). The spec's "a waited goal takes its new date as
 * its place in the order" is circular (the new date depends on what earlier goals leave), so the original date
 * decides the order. Prices and savings are converted at today's rate; a goal with no rate yet is left out
 * (the currency is already reported in Model.fxMissing). `infl` and goal.ret are percentages.
 * `opts.noReserveHint`: when there is no long-term reserve to cut (no age / target age, or already reached), the
 * wait-only stretch reason ends with this hint instead of "buying on time would slow … too much".
 */
export function assessGoals(goals: ShortGoal[], avail: number, income: number, infl: number, now: string, ltSlip: LtSlip, fx: Fx, opts: { ltName?: string; noReserveHint?: string } = {}): { results: GoalResult[]; used: number; ltCut: (k: number) => number } {
  const S = (n: number) => short(n, fx.view);
  const ltName = opts.ltName ?? 'your long-term goal';
  const cuts: { amt: number; n: number }[] = [];
  const ltCut = (k: number) => cuts.reduce((s, c) => s + (k >= 1 && k <= c.n ? c.amt : 0), 0);
  const start = Math.max(0, avail);
  let remaining = start;
  const results: GoalResult[] = [];
  const sorted = goals.map((g, i) => ({ g, i })).sort((a, b) => (a.g.date < b.g.date ? -1 : a.g.date > b.g.date ? 1 : a.i - b.i)).map((x) => x.g);

  for (const g of sorted) {
    const price = toView(g.price, g.currency || fx.view, fx);
    if (price == null) continue;
    const saved = toView(g.saved, g.currency || fx.view, fx) ?? 0;
    const ret = g.ret / 100;
    const n = mdiff(now, g.date);
    const adj = (m: number) => price * Math.pow(1 + infl / 100, Math.max(0, m) / 12);
    // Monthly saving needed to buy it `m` months from now (Infinity if m ≤ 0 and not yet saved).
    const needAt = (m: number) => needed(adj(m), saved, m, ret);
    const need = needAt(n);
    const noIncome = !(income > 0);
    const incomeMultiple = noIncome ? 0 : price / income;
    const r: GoalResult = { id: g.id, verdict: 'bad', priceAdj: adj(n), monthly: 0, effDate: g.date, waitDate: null, waitMonthly: null, onTimeSlip: null, earliest: null, incomeMultiple, reason: '' };
    const earliest = () => {
      for (let k = 1; k <= EARLIEST_MAX_MONTHS; k++) if (n + k >= 1 && needAt(n + k) <= remaining + MONEY_EPS) return addM(g.date, k);
      return null;
    };

    // Good comes first: if it fits by its date, it needs no loan whatever its size.
    if (need <= remaining + MONEY_EPS) {
      remaining = Math.max(0, snap(remaining - need));
      r.verdict = 'good';
      r.monthly = need;
      r.reason = n <= 0 || need === 0
        ? `Already covered: the ${S(saved)} you've saved is enough for the ${S(r.priceAdj)} price.`
        : `Fits: ${S(need)}/mo gets it by ${mlabel(g.date)} without touching ${ltName}.`;
      results.push(r);
      continue;
    }
    if (n <= 0) {
      r.earliest = earliest();
      r.reason = `The date (${mlabel(g.date)}) has passed with ${S(Math.max(0, price - saved))} still to save, so pick a new date${r.earliest ? `; ${mlabel(r.earliest)} would fit` : ''}.`;
      results.push(r);
      continue;
    }

    let wk: number | null = null;
    for (let k = 1; k <= STRETCH_MAX_MONTHS; k++) if (needAt(n + k) <= remaining + MONEY_EPS) { wk = k; break; }
    if (wk != null) { r.waitDate = addM(g.date, wk); r.waitMonthly = needAt(n + wk); }
    const cut = need - remaining;
    const slip = ltSlip(cut, n, ltCut);
    if (Number.isFinite(slip) && slip <= STRETCH_MAX_MONTHS) r.onTimeSlip = slip;

    if (noIncome || incomeMultiple >= BAD_INCOME_MULTIPLE || (wk == null && r.onTimeSlip == null)) {
      r.waitDate = null; r.waitMonthly = null; r.onTimeSlip = null;
      r.earliest = earliest();
      const when = `Earliest without debt: ${r.earliest ? mlabel(r.earliest) : 'not within 50 years'}.`;
      r.reason = noIncome
        ? `There's no income in your recent statements to save for it from. ${when}`
        : incomeMultiple >= BAD_INCOME_MULTIPLE
          ? `That's ${times(incomeMultiple)} your monthly income. You'd need a loan. ${when}`
          : `It needs ${S(need)}/mo but only ${S(remaining)} is free, and waiting 2 years or slowing ${ltName} isn't enough. ${when}`;
      results.push(r);
      continue;
    }

    r.verdict = 'stretch';
    const useWait = wk != null && (g.stretchChoice !== 'onTime' || r.onTimeSlip == null);
    if (useWait) {
      r.monthly = r.waitMonthly!;
      r.effDate = r.waitDate!;
      remaining = Math.max(0, snap(remaining - r.waitMonthly!));
    } else {
      r.monthly = need;
      cuts.push({ amt: cut, n });
      remaining = 0;
    }
    const buy = r.onTimeSlip == null ? null
      : `buy ${mlabel(g.date)} and ${ltName} ${r.onTimeSlip === 0 ? 'keeps its date' : `slips ${monthsWord(r.onTimeSlip)}`}`;
    const wait = r.waitDate == null ? null : `wait until ${mlabel(r.waitDate)} (${S(r.waitMonthly!)}/mo) and nothing slips`;
    const s = buy && wait ? `${buy}, or ${wait}` : buy ? `${buy}; waiting 2 years isn't enough` : `${wait}; ${opts.noReserveHint ?? `buying on time would slow ${ltName} too much`}`;
    r.reason = s.charAt(0).toUpperCase() + s.slice(1) + '.';
    results.push(r);
  }
  return { results, used: start - remaining, ltCut };
}

export function plan(d: Data, M: Model, fx: Fx, now: string, opts: PlanOpts = {}): Plan {
  const a = M.a3;
  const s = d.settings;
  const lt = s.longTerm;
  const view = fx.view;
  const S = (n: number) => short(n, view);
  const ltName = lt.type === 'retirement' ? 'retirement' : 'freedom';
  const ltLabel = lt.type === 'retirement' ? 'Retirement' : 'Financial freedom';
  const ageN = parseInt(s.age, 10);
  const age = Number.isFinite(ageN) ? ageN : null;

  // Long-term "already have": bank + investments − what's already saved for short-term goals (never below 0).
  const goalSaved = d.goals.reduce((t, g) => t + (toView(g.saved, g.currency || view, fx) ?? 0), 0);
  const inv = toView(d.assets.investments, d.assets.currency || view, fx) ?? 0; // no rate: 0, already in M.fxMissing
  const have = Math.max(0, M.bankBal + inv - goalSaved);
  const yearlySpend = 12 * a.spendExEmi; // Loan EMI excluded: EMIs end

  if (!a.months.length) {
    // Not enough data: views show "Import a full month of statements to see this" and must check `ready` first.
    const explain = 'Import a full month of statements to see this.';
    const labels: [PlanLine['key'], string][] = [['income', 'Income'], ['needs', 'Needs'], ['debt', 'Debt payments'], ['giving', 'Giving'], ['longTerm', ltLabel], ['goals', 'Short-term goals']];
    return {
      ready: false, lines: labels.map(([key, label]) => ({ key, label, amount: 0, explain })), guiltFree: 0, shortfall: 0, biggest: null,
      longTerm: { target: 0, have, reserve: 0, yearlySpend: 0, targetMonth: null, projected: null, status: 'needAge', monthsVsTarget: null, projectedNoExtra: null },
      goals: [], debtFree: null, netWorth: M.netWorth, explain
    };
  }
  const span = a.months.length === 1 ? 'your last full month' : `the last ${a.months.length} full months`;

  // Debt line: minimums/EMIs of entered loans and revolving cards + chosen extra (only when there is debt to put it on),
  // + the observed Loan EMI average when EMIs show up but no loan has been added.
  const pd = toPayDebts(d, fx);
  const mins = monthlyDebtPayment(pd);
  const extra = pd.length ? Math.max(0, s.extra || 0) : 0;
  const emiSeen = !pd.some((x) => x.kind === 'loan') && a.emi > 0 ? a.emi : 0;
  const debtAmt = mins + extra + emiSeen;
  const freeAfter = (strategyExtra: number) => {
    if (!pd.length) return null;
    const m = payoff(pd, s.strategy, strategyExtra).months;
    return Number.isFinite(m) ? m : null;
  };
  const dfIdx = freeAfter(extra);
  const dfIdx0 = extra > 0 ? freeAfter(0) : dfIdx;
  const debtFree = dfIdx == null ? null : addM(now, dfIdx);
  // Once the entered debts are cleared, their whole budget (not the unplanned EMI estimate) goes to the long-term goal.
  const freed = (k: number, idx: number | null, amt: number) => (idx != null && k > idx ? amt : 0);

  // Giving: planned monthly giving + zakat (Task 7 seam).
  const zakatM = Math.max(0, opts.zakatMonthly ?? 0);
  const planned = Math.max(0, s.givingPlan || 0);
  const giving = zakatM + planned;

  // Long-term reserve, then goals, then the projection with the goals' on-time cuts.
  const reserve = longTerm({ yearlySpend, have, age, lt, now, contrib: () => 0 }).reserve;
  const rr = realReturn(lt);
  const target = yearlySpend * lt.mult * (lt.type === 'retirement' ? lt.retirePct / 100 : 1);
  const baseContrib = (k: number) => reserve + freed(k, dfIdx, mins + extra);
  const ltSlip: LtSlip = (cut, n, prior = () => 0) => {
    if (!(cut > 0)) return 0;
    if (!Number.isFinite(cut)) return Infinity;
    // The cut has to come out of what's left of the reserve in every month 1..n.
    for (let k = 1; k <= n; k++) if (reserve - prior(k) - cut < -MONEY_EPS) return Infinity;
    const without = projectMonths(have, target, rr, (k) => baseContrib(k) - prior(k));
    const withCut = projectMonths(have, target, rr, (k) => baseContrib(k) - prior(k) - (k <= n ? cut : 0));
    // If either date is out of reach the slip can't be measured: no on-time option (never "keeps its date").
    if (!Number.isFinite(withCut) || !Number.isFinite(without)) return Infinity;
    return Math.max(0, withCut - without);
  };
  const avail = Math.max(0, snap(a.inc - a.needs - debtAmt - giving - reserve));
  const noReserveHint = reserve > 0 ? undefined
    : age == null ? 'add your age and a target age to see the buy-on-time option'
      : lt.targetAge == null || lt.targetAge <= age ? 'set a target age to see the buy-on-time option'
        : `there's no ${ltName} saving to borrow from to buy on time`;
  const G = assessGoals(d.goals, avail, a.inc, lt.infl, now, ltSlip, fx, { ltName, noReserveHint });
  const LT = longTerm({
    yearlySpend, have, age, lt, now,
    contrib: (k) => baseContrib(k) - G.ltCut(k),
    // Same plan with extra = 0: the debts clear later and only the minimums are freed.
    contribNoExtra: (k) => reserve - G.ltCut(k) + freed(k, dfIdx0, mins)
  });

  const cutNow = G.ltCut(1);
  const ltAmt = Math.max(0, snap(reserve - cutNow));
  const goalsAmt = G.results.reduce((t, r) => t + r.monthly, 0);

  const debtParts: string[] = [];
  if (pd.length) debtParts.push(`${S(mins)} in minimum payments and EMIs`);
  if (extra > 0) debtParts.push(`${S(extra)} extra you chose`);
  if (emiSeen > 0) debtParts.push(`${S(emiSeen)} in loan EMIs seen in your statements (add this loan to plan its payoff)`);
  const unused = !pd.length && (s.extra || 0) > 0 ? ` Your extra ${S(s.extra)}/mo isn't applied because no card or loan is added.` : '';
  const debtExplain = (debtParts.length
    ? `${debtParts.join(' + ')} = ${S(debtAmt)} a month${debtFree ? `, debt-free by ${mlabel(debtFree)}` : ''}.`
    : 'You have no debt payments.') + unused;

  const givingExplain = zakatM > 0
    ? `${S(zakatM)} zakat (the yearly amount due ÷ 12) + ${S(planned)} planned giving = ${S(giving)} a month.`
    : planned > 0 ? `Your planned monthly giving: ${S(planned)}.` : 'No monthly giving planned.';

  const ltFormula = `${S(yearlySpend)} a year of spending × ${lt.mult}${lt.type === 'retirement' ? ` × ${lt.retirePct}%` : ''}`;
  const ltExplain = LT.status === 'needAge'
    ? age == null ? `Enter your age to work out how much to put aside for ${ltName}.`
      : lt.targetAge != null && lt.targetAge <= age ? `Choose a target age later than your current age (${age}).`
        : `Choose a target age to work out how much to put aside for ${ltName}.`
    : reserve <= 0
      ? `You already have ${S(have)}, enough for the ${S(target)} target (${ltFormula}, in today's money).`
      : `To reach ${S(target)} (${ltFormula}, in today's money) by ${mlabel(LT.targetMonth!)} from the ${S(have)} you have, put aside ${S(reserve)} a month${cutNow > 0 ? `, of which ${S(Math.min(cutNow, reserve))} goes to on-time goals for now` : ''}.`;

  const nameOf = new Map(d.goals.map((g) => [g.id, g.name]));
  const funded = G.results.filter((r) => r.monthly > 0);
  const goalsExplain = funded.length
    ? `${funded.map((r) => `${S(r.monthly)} for ${nameOf.get(r.id)}`).join(' + ')}${funded.length > 1 ? ` = ${S(goalsAmt)}` : ''} a month.`
    : d.goals.length ? 'None of your short-term goals take money this month.' : 'No short-term goals yet.';

  const lines: PlanLine[] = [
    { key: 'income', label: 'Income', amount: a.inc, explain: `Your average income over ${span}: ${S(a.inc)} a month.` },
    { key: 'needs', label: 'Needs', amount: a.needs, explain: `Your average spending on needs (rent, groceries, bills and the like) over ${span}: ${S(a.needs)} a month.` },
    { key: 'debt', label: pd.length || !emiSeen ? 'Debt payments' : 'Loan payments', amount: debtAmt, explain: debtExplain },
    { key: 'giving', label: 'Giving', amount: giving, explain: givingExplain },
    { key: 'longTerm', label: ltLabel, amount: ltAmt, explain: ltExplain },
    { key: 'goals', label: 'Short-term goals', amount: goalsAmt, explain: goalsExplain }
  ];

  const left = snap(a.inc - a.needs - debtAmt - giving - ltAmt - goalsAmt);
  const guiltFree = Math.max(0, left);
  const shortfall = Math.max(0, -left);
  let biggest: string | null = null;
  if (shortfall > 0) {
    // The largest single claim: a non-income line, with the goals line split into its goals.
    const cands = [...lines.filter((l) => l.key !== 'income' && l.key !== 'goals').map((l) => ({ name: l.label, amt: l.amount })), ...funded.map((r) => ({ name: nameOf.get(r.id) ?? 'A goal', amt: r.monthly }))];
    const top = cands.reduce<{ name: string; amt: number } | null>((b, c) => (c.amt > 0 && (!b || c.amt > b.amt) ? c : b), null);
    biggest = top ? top.name : null;
  }
  const sum = `${S(a.inc)} income − ${S(a.needs)} needs − ${S(debtAmt)} debt − ${S(giving)} giving − ${S(ltAmt)} ${ltName} − ${S(goalsAmt)} goals = ${S(left)}`;
  const explain = shortfall > 0
    ? `${sum}, so you're ${S(shortfall)} short each month${biggest ? ` and ${biggest} is the biggest line` : ''}.`
    : `${sum} to spend guilt-free each month.`;

  return { ready: true, lines, guiltFree, shortfall, biggest, longTerm: LT, goals: G.results, debtFree, netWorth: M.netWorth, explain };
}
