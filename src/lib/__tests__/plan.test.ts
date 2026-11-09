import { describe, expect, it } from 'vitest';
import { assessGoals, longTerm, plan, suggestAge, type Plan } from '../plan';
import { EMPTY_FX } from '../fx';
import type { Model } from '../model';
import { addM } from '../format';
import { blank, type Data, type Debt, type LongTerm, type ShortGoal } from '../types';

const NOW = '2026-11';
const FX = EMPTY_FX('INR');

// plan() only reads a3, bankBal and netWorth from the Model, so tests use a hand-built one with exact numbers.
const model = (a3: Partial<Model['a3']>, rest: Partial<Model> = {}): Model =>
  ({
    a3: { inc: 0, exp: 0, saved: 0, inv: 0, rate: NaN, months: ['2026-08', '2026-09', '2026-10'], needs: 0, emi: 0, spendExEmi: 0, ...a3 },
    bankBal: 0, debtTotal: 0, assetsTotal: 0, netWorth: 0, fxMissing: [],
    ...rest
  }) as unknown as Model;

const goal = (p: Partial<ShortGoal>): ShortGoal => ({ id: 'g', name: 'Goal', price: 0, currency: 'INR', date: NOW, saved: 0, ret: 0, stretchChoice: 'wait', ...p });
const debt = (p: Partial<Debt>): Debt => ({ id: 'd', name: 'Debt', kind: 'loan', currency: 'INR', balance: 0, asOf: '2026-11-01', apr: 0, minPay: 0, revolving: true, ...p });
const lt = (p: Partial<LongTerm> = {}): LongTerm => ({ type: 'freedom', targetAge: null, mult: 25, ret: 0, infl: 0, retirePct: 80, ...p });

/** Data with real return 0 (ret = infl = 0) and an optional age / target age. */
function data(p: { age?: string; targetAge?: number | null; goals?: ShortGoal[]; debts?: Debt[]; extra?: number } = {}): Data {
  const d = blank();
  d.settings.age = p.age ?? '';
  d.settings.longTerm = lt({ targetAge: p.targetAge ?? null });
  d.goals = p.goals ?? [];
  d.debts = p.debts ?? [];
  d.settings.extra = p.extra ?? 0;
  return d;
}

const line = (P: Plan, key: string) => P.lines.find((l) => l.key === key)!;
const noSlip = () => 0;

describe('suggestAge', () => {
  it('freedom: max(50, age + 15); retirement: max(60, age + 10)', () => {
    // max(50, 33 + 15 = 48) = 50
    expect(suggestAge('freedom', 33)).toBe(50);
    // max(50, 40 + 15 = 55) = 55
    expect(suggestAge('freedom', 40)).toBe(55);
    // max(60, 55 + 10 = 65) = 65
    expect(suggestAge('retirement', 55)).toBe(65);
  });
});

describe('verdicts', () => {
  it("owner's example: ₹50L car on ₹1L/mo income is bad, 50× income", () => {
    // income 1,00,000, needs 50,000, no debt, no age → reserve 0, so avail = 50,000.
    const d = data({ goals: [goal({ name: 'Luxury car', price: 5000000, date: '2027-12' })] });
    const P = plan(d, model({ inc: 100000, needs: 50000 }), FX, NOW);
    const g = P.goals[0];
    // 50,00,000 / 1,00,000 = 50 ≥ 24 → bad
    expect(g.incomeMultiple).toBe(50);
    expect(g.verdict).toBe('bad');
    expect(g.reason).toContain('50×');
    expect(g.monthly).toBe(0);
  });

  it('good: ₹1.5L phone in 12 months needs ₹12.5K/mo and fits in ₹30K', () => {
    // n = 12, infl 0, ret 0 → need = 150000 / 12 = 12500 ≤ 30000
    const r = assessGoals([goal({ name: 'Phone', price: 150000, date: '2027-11' })], 30000, 100000, 0, NOW, noSlip, FX);
    const g = r.results[0];
    expect(g.verdict).toBe('good');
    expect(g.monthly).toBe(12500);
    expect(g.effDate).toBe('2027-11');
    expect(g.priceAdj).toBe(150000);
    // used = 12500, ₹17.5K left for later goals
    expect(r.used).toBe(12500);
    expect(r.ltCut(1)).toBe(0);
  });

  it('good when buying on time does not move the long-term date (funded from the reserve)', () => {
    // n = 4: need = 400000 / 4 = 100000, remaining 30000 → cut 70000 for months 1..4; ltSlip 0 → good.
    const r = assessGoals([goal({ price: 400000, date: '2027-03' })], 30000, 100000, 0, NOW, () => 0, FX);
    const g = r.results[0];
    expect(g.verdict).toBe('good');
    expect(g.monthly).toBe(100000);
    expect(g.onTimeSlip).toBe(0);
    expect(g.waitDate).toBeNull();
    expect(g.reason).toContain('₹70K/mo of that comes from your');
    expect(r.ltCut(1)).toBe(70000);
    expect(r.ltCut(4)).toBe(70000);
    expect(r.ltCut(5)).toBe(0);
    // 30000 from free money + 70000 from the reserve = 100000 a month.
    expect(r.used).toBe(30000);
  });

  it('stretch by waiting: 10 more months makes it fit', () => {
    // n = 4: need = 400000 / 4 = 100000 > 30000.
    // wait k = 9: 400000 / 13 = 30769 > 30000; k = 10: 400000 / 14 = 28571.43 ≤ 30000 → k = 10.
    // ltSlip fixed at 30 > 24 → on-time invalid.
    const r = assessGoals([goal({ price: 400000, date: '2027-03' })], 30000, 100000, 0, NOW, () => 30, FX);
    const g = r.results[0];
    expect(g.verdict).toBe('stretch');
    // 2027-03 + 10 = 2028-01 = now + 14
    expect(g.waitDate).toBe('2028-01');
    expect(g.effDate).toBe('2028-01');
    expect(g.waitMonthly).toBeCloseTo(400000 / 14, 6);
    expect(g.monthly).toBeCloseTo(28571.43, 2);
    expect(g.onTimeSlip).toBeNull();
    expect(r.ltCut(1)).toBe(0);
  });

  it('stretch on time: cut the long-term reserve, it slips 4 months', () => {
    // need 100000, remaining 30000 → cut 70000 for months 1..4; ltSlip says 4 ≤ 24 → valid.
    const r = assessGoals([goal({ price: 400000, date: '2027-03', stretchChoice: 'onTime' })], 30000, 100000, 0, NOW, () => 4, FX);
    const g = r.results[0];
    expect(g.verdict).toBe('stretch');
    expect(g.monthly).toBe(100000);
    expect(g.onTimeSlip).toBe(4);
    expect(g.effDate).toBe('2027-03');
    // the wait option is still shown: 2028-01
    expect(g.waitDate).toBe('2028-01');
    // 100000 − 30000 = 70000 cut in months 1..4, none in month 5
    expect(r.ltCut(1)).toBe(70000);
    expect(r.ltCut(4)).toBe(70000);
    expect(r.ltCut(5)).toBe(0);
    // used = the whole 30000 available
    expect(r.used).toBe(30000);
  });

  it('stretch: falls back to the other option when the chosen one is invalid', () => {
    // onTime chosen but slip 30 > 24 → uses wait (k = 10, as above)
    const r = assessGoals([goal({ price: 400000, date: '2027-03', stretchChoice: 'onTime' })], 30000, 100000, 0, NOW, () => 30, FX);
    expect(r.results[0].verdict).toBe('stretch');
    expect(r.results[0].effDate).toBe('2028-01');
  });

  it('bad when neither option fits within 24 months', () => {
    // multiple = 2000000 / 100000 = 20 < 24, so the multiple rule alone doesn't decide it.
    // n = 3: need = 666,667 > 10000; wait k = 24: 2000000 / 27 = 74,074 > 10000 → invalid; ltSlip 99 > 24 → invalid.
    const r = assessGoals([goal({ price: 2000000, date: '2027-02' })], 10000, 100000, 0, NOW, () => 99, FX);
    const g = r.results[0];
    expect(g.incomeMultiple).toBe(20);
    expect(g.verdict).toBe('bad');
    expect(g.monthly).toBe(0);
    // earliest good: 2000000 / m ≤ 10000 → m ≥ 200 months from now → 2026-11 + 200 = 2043-07
    expect(g.earliest).toBe('2043-07');
    expect(r.used).toBe(0);
  });

  it('past date: bad when not fully saved, good with ₹0/mo when it is', () => {
    // date = now − 1 → n = −1
    const missing = assessGoals([goal({ price: 100000, saved: 40000, date: '2026-10' })], 50000, 100000, 0, NOW, noSlip, FX).results[0];
    expect(missing.verdict).toBe('bad');
    expect(missing.reason).toContain('passed');
    const done = assessGoals([goal({ price: 100000, saved: 100000, date: '2026-10' })], 50000, 100000, 0, NOW, noSlip, FX).results[0];
    expect(done.verdict).toBe('good');
    expect(done.monthly).toBe(0);
  });

  it('goals share what is available in ascending date order', () => {
    // Listed later-first. B (2027-11): 120000 / 12 = 10000. A (2027-05): 60000 / 6 = 10000.
    // avail 15000: A first (earlier date) → good, 5000 left; B needs 10000 > 5000 → not good.
    const a = goal({ id: 'a', price: 60000, date: '2027-05' });
    const b = goal({ id: 'b', price: 120000, date: '2027-11' });
    const r = assessGoals([b, a], 15000, 100000, 0, NOW, () => 99, FX);
    expect(r.results.map((x) => x.id)).toEqual(['a', 'b']);
    expect(r.results[0].verdict).toBe('good');
    // B wait: 120000 / (12 + k) ≤ 5000 → 12 + k ≥ 24 → k = 12 → 2028-11
    expect(r.results[1].verdict).toBe('stretch');
    expect(r.results[1].waitDate).toBe('2028-11');
    // used = 10000 + 5000
    expect(r.used).toBe(15000);
  });

  it('inflation raises the price: ₹1L in 12 months at 6% is ₹1.06L', () => {
    // priceAdj = 100000 × 1.06^(12/12) = 106000; need = 106000 / 12 = 8833.33
    const g = assessGoals([goal({ price: 100000, date: '2027-11' })], 30000, 100000, 6, NOW, noSlip, FX).results[0];
    expect(g.priceAdj).toBeCloseTo(106000, 6);
    expect(g.monthly).toBeCloseTo(8833.33, 2);
  });
});

describe('waterfall', () => {
  // Long-term: age 30 → 40 = 120 months, real return 0, have 0, target = 12 × 4000 × 25 = 12,00,000
  // → reserve = 1200000 / 120 = 10000.
  const ltSetup = { age: '30', targetAge: 40 };

  it('normal month: ₹18.4K guilt-free', () => {
    const d = data({
      ...ltSetup,
      // revolving card: max(1000, 68000 × 5%) = 3400 minimum; loan EMI 14200
      debts: [debt({ id: 'c', name: 'Card', kind: 'card', balance: 68000, apr: 36, minPay: 1000 }), debt({ id: 'l', name: 'Car loan', balance: 142000, minPay: 14200 })],
      // 24000 / 12 months = 2000/mo
      goals: [goal({ name: 'Trip', price: 24000, date: '2027-11' })]
    });
    // a3.emi is also 14200 here, but a loan exists, so it isn't added a second time.
    const P = plan(d, model({ inc: 100000, needs: 52000, emi: 14200, spendExEmi: 4000 }), FX, NOW);
    expect(P.ready).toBe(true);
    expect(P.lines.map((l) => l.key)).toEqual(['income', 'needs', 'debt', 'giving', 'longTerm', 'goals']);
    expect(line(P, 'debt').amount).toBe(17600); // 3400 + 14200 + 0 extra
    expect(line(P, 'giving').amount).toBe(0);
    expect(P.longTerm.target).toBe(1200000);
    expect(line(P, 'longTerm').amount).toBeCloseTo(10000, 6);
    expect(line(P, 'goals').amount).toBe(2000);
    // 100000 − 52000 − 17600 − 0 − 10000 − 2000 = 18400
    expect(P.guiltFree).toBeCloseTo(18400, 6);
    expect(P.shortfall).toBe(0);
    expect(P.biggest).toBeNull();
    expect(P.explain).toContain('₹18.4K');
  });

  it('spending more than income: guilt-free 0, shortfall ₹10K, Needs biggest', () => {
    const P = plan(data(), model({ inc: 50000, needs: 60000 }), FX, NOW);
    // 50000 − 60000 − 0 − 0 − 0 − 0 = −10000 → guiltFree 0, shortfall 10000
    expect(P.guiltFree).toBe(0);
    expect(P.shortfall).toBe(10000);
    expect(P.biggest).toBe('Needs');
    const nums = [P.guiltFree, P.shortfall, P.netWorth, ...P.lines.map((l) => l.amount), P.longTerm.target, P.longTerm.have, P.longTerm.reserve];
    expect(nums.some((x) => Number.isNaN(x))).toBe(false);
  });

  it('shortfall: biggest names the largest line, not always Needs', () => {
    const d = data();
    d.settings.givingPlan = 80000;
    // 100000 − 30000 needs − 80000 giving = −10000 → shortfall 10000; biggest = Giving (80000 > 30000)
    const P = plan(d, model({ inc: 100000, needs: 30000 }), FX, NOW);
    expect(P.shortfall).toBe(10000);
    expect(P.biggest).toBe('Giving');
  });

  it('not enough data: ready false, guilt-free 0', () => {
    const P = plan(data(), model({ inc: 100000, needs: 50000, months: [] }), FX, NOW);
    expect(P.ready).toBe(false);
    expect(P.guiltFree).toBe(0);
    expect(P.lines.every((l) => l.amount === 0)).toBe(true);
    expect(P.goals).toEqual([]);
  });

  it('EMI seen in statements with no loan added goes on the debt line', () => {
    const P = plan(data(), model({ inc: 100000, needs: 50000, emi: 14200 }), FX, NOW);
    expect(line(P, 'debt').amount).toBe(14200);
    expect(line(P, 'debt').explain).toContain('add this loan');
    // No debts entered → no payoff date.
    expect(P.debtFree).toBeNull();
  });

  it('giving line = planned monthly giving, plus zakat when Task 7 passes it in', () => {
    const d = data();
    d.settings.givingPlan = 2000;
    expect(line(plan(d, model({ inc: 100000 }), FX, NOW), 'giving').amount).toBe(2000);
    // 2000 + 30000 zakat / 12 = 4500
    expect(line(plan(d, model({ inc: 100000 }), FX, NOW, { zakatMonthly: 2500 }), 'giving').amount).toBe(4500);
  });

  it('debt-free month: ₹1.42L loan at ₹14.2K/mo clears after 10 payments', () => {
    const d = data({ debts: [debt({ balance: 142000, minPay: 14200 })] });
    // 142000 / 14200 = 10 → 2026-11 + 10 = 2027-09
    expect(plan(d, model({ inc: 100000 }), FX, NOW).debtFree).toBe('2027-09');
  });

  it('extra debt payment brings the long-term date forward', () => {
    // Loan 120000 at 0%, EMI 10000, extra 10000 → 20000/mo → clears in 6 months. Without extra: 12 months.
    // Reserve 10000 (see ltSetup). After debt-free, the debt line joins the long-term contribution:
    //   with extra:  10000k + 20000(k − 6) ≥ 1200000 → 30000k ≥ 1320000 → k = 44 → 2030-07
    //   no extra:    10000k + 10000(k − 12) ≥ 1200000 → 20000k ≥ 1320000 → k = 66 → 2032-05
    const d = data({ ...ltSetup, extra: 10000, debts: [debt({ balance: 120000, minPay: 10000 })] });
    const P = plan(d, model({ inc: 100000, needs: 50000, spendExEmi: 4000 }), FX, NOW);
    expect(line(P, 'debt').amount).toBe(20000);
    expect(P.debtFree).toBe('2027-05');
    expect(P.longTerm.projected).toBe('2030-07');
    expect(P.longTerm.projectedNoExtra).toBe('2032-05');
    // target month 2026-11 + 120 = 2036-11; 2036-11 − 2030-07 = 76 months ahead
    expect(P.longTerm.targetMonth).toBe('2036-11');
    expect(P.longTerm.status).toBe('ahead');
    expect(P.longTerm.monthsVsTarget).toBe(76);
  });

  it('on-time goal cuts the long-term reserve and the projected date slips', () => {
    // avail = 100000 − 60000 − 0 − 0 − 10000 = 30000.
    // Goal 200000 in 5 months: need 40000 > 30000. Wait: 200000 / 7 = 28571 ≤ 30000 → k = 2 (valid).
    // On time: cut 10000 for months 1..5 → reserve 10000 − 10000 = 0 in those months.
    //   Without cut: 10000k ≥ 1200000 → k = 120. With cut: 10000(k − 5) ≥ 1200000 → k = 125 → slip 5.
    const d = data({ ...ltSetup, goals: [goal({ name: 'Bike', price: 200000, date: '2027-04', stretchChoice: 'onTime' })] });
    const P = plan(d, model({ inc: 100000, needs: 60000, spendExEmi: 4000 }), FX, NOW);
    const g = P.goals[0];
    expect(g.verdict).toBe('stretch');
    expect(g.onTimeSlip).toBe(5);
    expect(g.monthly).toBe(40000);
    expect(line(P, 'longTerm').amount).toBeCloseTo(0, 6);
    expect(line(P, 'goals').amount).toBe(40000);
    // 100000 − 60000 − 0 − 0 − 0 − 40000 = 0
    expect(P.guiltFree).toBeCloseTo(0, 6);
    expect(P.longTerm.reserve).toBeCloseTo(10000, 6);
    // 2026-11 + 125 = 2037-04, 5 months behind 2036-11
    expect(P.longTerm.projected).toBe('2037-04');
    expect(P.longTerm.monthsVsTarget).toBe(-5);
    expect(P.longTerm.status).toBe('behind');
  });

  it('on time is not offered when the cut is bigger than the reserve', () => {
    // avail 30000, reserve 10000. Goal 400000 in 5 months: need 80000 → cut 50000 > 10000 reserve → invalid.
    // Wait: 400000 / (5 + k) ≤ 30000 → 5 + k ≥ 13.33 → k = 9 → 2027-04 + 9 = 2028-01
    const d = data({ ...ltSetup, goals: [goal({ price: 400000, date: '2027-04', stretchChoice: 'onTime' })] });
    const g = plan(d, model({ inc: 100000, needs: 60000, spendExEmi: 4000 }), FX, NOW).goals[0];
    expect(g.onTimeSlip).toBeNull();
    expect(g.verdict).toBe('stretch');
    expect(g.effDate).toBe('2028-01');
  });
});

describe('long-term goal', () => {
  it('retirement: target ₹1.2 Cr and reserve ₹33,333/mo over 30 years at real return 0', () => {
    // target = 600000 × 25 × 80% = 12,000,000
    // months = (60 − 30) × 12 = 360; reserve = 12000000 / 360 = 33333.33 (ret = infl → real return 0)
    const reserve = 12000000 / 360;
    const r = longTerm({ yearlySpend: 600000, have: 0, age: 30, lt: lt({ type: 'retirement', targetAge: 60, ret: 6, infl: 6 }), now: NOW, contrib: () => reserve });
    expect(r.target).toBe(12000000);
    expect(r.reserve).toBeCloseTo(33333.33, 2);
    expect(r.targetMonth).toBe('2056-11');
    // contrib = reserve exactly → reaches the target in month 360 → on time
    expect(r.projected).toBe('2056-11');
    expect(r.status).toBe('on');
    expect(r.monthsVsTarget).toBe(0);
  });

  it('freedom: target = yearly spending × multiple', () => {
    // 600000 × 25 = 15,000,000
    const r = longTerm({ yearlySpend: 600000, have: 0, age: 30, lt: lt({ targetAge: 50 }), now: NOW, contrib: () => 0 });
    expect(r.target).toBe(15000000);
    // 240 months, real return 0 → 15000000 / 240 = 62500
    expect(r.reserve).toBeCloseTo(62500, 6);
    // contrib 0 never reaches it
    expect(r.projected).toBeNull();
    expect(r.status).toBe('behind');
  });

  it('ahead when a debt is freed at month 12 and adds ₹17.6K/mo', () => {
    // contrib(k) = 33333.33 + (k > 12 ? 17600 : 0)
    // b(k) = 33333.33k + 17600(k − 12) ≥ 12000000 → 50933.33k ≥ 12211200 → k ≥ 239.75 → k = 240 → 2046-11
    const reserve = 12000000 / 360;
    const r = longTerm({ yearlySpend: 600000, have: 0, age: 30, lt: lt({ type: 'retirement', targetAge: 60 }), now: NOW, contrib: (k) => reserve + (k > 12 ? 17600 : 0) });
    expect(r.status).toBe('ahead');
    expect(r.projected).toBe('2046-11');
    expect(r.projected! < r.targetMonth!).toBe(true);
    // 360 − 240 = 120 months early
    expect(r.monthsVsTarget).toBe(120);
  });

  it('needs an age: no reserve until the current age is entered', () => {
    const r = longTerm({ yearlySpend: 600000, have: 0, age: null, lt: lt({ targetAge: 50 }), now: NOW, contrib: () => 0 });
    expect(r.status).toBe('needAge');
    expect(r.reserve).toBe(0);
    expect(r.targetMonth).toBeNull();
  });

  it('plan: unparseable age → needAge, reserve 0', () => {
    const P = plan(data({ age: 'abc', targetAge: 50 }), model({ inc: 100000, spendExEmi: 4000 }), FX, NOW);
    expect(P.longTerm.status).toBe('needAge');
    expect(line(P, 'longTerm').amount).toBe(0);
    expect(line(P, 'longTerm').explain).toContain('age');
  });

  it("goal savings aren't counted twice", () => {
    // have = max(0, 200000 bank + 0 investments − 50000 goal saved) = 150000
    const d = data({ goals: [goal({ price: 100000, saved: 50000, date: '2027-11' })] });
    const P = plan(d, model({ inc: 100000 }, { bankBal: 200000 }), FX, NOW);
    expect(P.longTerm.have).toBe(150000);
  });

  it('have includes investments and never goes below 0', () => {
    const d = data({ goals: [goal({ price: 100000, saved: 90000, date: '2027-11' })] });
    d.assets.investments = 30000;
    // 50000 + 30000 − 90000 = −10000 → 0
    expect(plan(d, model({ inc: 100000 }, { bankBal: 50000 }), FX, NOW).longTerm.have).toBe(0);
    // 100000 + 30000 − 90000 = 40000
    expect(plan(d, model({ inc: 100000 }, { bankBal: 100000 }), FX, NOW).longTerm.have).toBe(40000);
  });
});

describe('fix round 1', () => {
  it('float residue never shows as a "₹0 short" shortfall', () => {
    // From the fuzz: real return (1.07 / 1.01) − 1 ≠ 0 gives a non-integer reserve; the on-time stretch takes
    // every rupee of `avail`, so left = 0 exactly on paper but came out as −3.6e-12 in floating point.
    const d = data({ age: '42', goals: [goal({ name: 'G0', price: 205925, saved: 25070, ret: 1, date: '2027-05', stretchChoice: 'onTime' })] });
    d.settings.longTerm = lt({ targetAge: 56, ret: 7, infl: 1 });
    d.settings.givingPlan = 468;
    const P = plan(d, model({ inc: 140194, needs: 70802, spendExEmi: 58016 }, { bankBal: 218847 }), FX, NOW);
    expect(P.goals[0].verdict).toBe('stretch');
    expect(P.goals[0].effDate).toBe('2027-05'); // on time
    expect(P.shortfall).toBe(0);
    expect(P.guiltFree).toBe(0);
    expect(P.biggest).toBeNull();
    expect(P.explain).not.toContain('short');
    expect(P.explain).not.toContain('−₹0');
  });

  it('target age at or below the current age asks for a later one', () => {
    const d = data({ age: '60', targetAge: 50 });
    const P = plan(d, model({ inc: 100000, needs: 50000, spendExEmi: 4000 }), FX, NOW);
    expect(P.longTerm.status).toBe('needAge');
    expect(P.longTerm.reserve).toBe(0);
    expect(P.longTerm.projected).toBeNull();
    expect(line(P, 'longTerm').amount).toBe(0);
    expect(line(P, 'longTerm').explain).toBe('Choose a target age later than your current age (60).');
    // 100000 − 50000 = 50000, no huge shortfall
    expect(P.guiltFree).toBe(50000);
  });

  it('no income: income multiple is 0 (not Infinity) and the goal is bad', () => {
    const g = assessGoals([goal({ price: 100000, date: '2027-11' })], 0, 0, 0, NOW, () => 99, FX).results[0];
    expect(g.incomeMultiple).toBe(0);
    expect(g.verdict).toBe('bad');
    expect(g.reason).toContain('no income');
  });

  it('wait-only stretch with no reserve points to the target age, not "too much"', () => {
    // No age → reserve 0 → on-time impossible. avail = 100000 − 70000 = 30000.
    // 400000 in 4 months: wait k = 10 → 400000 / 14 = 28571 ≤ 30000 → stretch by waiting.
    const d = data({ goals: [goal({ price: 400000, date: '2027-03' })] });
    const g = plan(d, model({ inc: 100000, needs: 70000 }), FX, NOW).goals[0];
    expect(g.verdict).toBe('stretch');
    expect(g.reason).toContain('target age to see the buy-on-time option');
    expect(g.reason).not.toContain('too much');
  });

  it('on time is not offered when the long-term goal is out of reach even without the cut', () => {
    // age 20 → target age 125 = 1260 months, past the 1200-month projection horizon,
    // so the no-cut projection never arrives and the slip can't be measured → Infinity → no on-time option.
    const d = data({ age: '20', targetAge: 125, goals: [goal({ price: 200000, date: '2027-04', stretchChoice: 'onTime' })] });
    const g = plan(d, model({ inc: 100000, needs: 60000, spendExEmi: 4000 }), FX, NOW).goals[0];
    expect(g.onTimeSlip).toBeNull();
    expect(g.reason).not.toContain('keeps its date');
  });

  it('extra with no debts is left off the debt line but explained', () => {
    const P = plan(data({ extra: 5000 }), model({ inc: 100000 }), FX, NOW);
    expect(line(P, 'debt').amount).toBe(0);
    expect(line(P, 'debt').explain).toContain("Your extra ₹5K/mo isn't applied because no card or loan is added");
  });
});

describe('plan giving line with zakat', () => {
  it('Islamic on, zakat due 69800 → giving ≈ 5816.67 a month', () => {
    const d = data();
    d.settings.islamic = true;
    d.settings.silverPrice = 90;
    d.settings.goldPrice = 7750;
    d.assets.goldG = 40;
    d.assets.investments = 200000;
    d.debts = [debt({ kind: 'card', balance: 238000, revolving: false })];
    const P = plan(d, model({ inc: 100000 }, { bankBal: 2520000 }), FX, NOW);
    expect(line(P, 'giving').amount).toBeCloseTo(69800 / 12, 6);
  });
  it('Islamic on but no metal prices set → giving is only the planned amount', () => {
    const d = data();
    d.settings.islamic = true;
    d.settings.givingPlan = 1000;
    expect(line(plan(d, model({ inc: 100000 }, { bankBal: 2520000 }), FX, NOW), 'giving').amount).toBe(1000);
  });
  it('Islamic off → no zakat', () => {
    const d = data();
    d.assets.investments = 5000000;
    expect(line(plan(d, model({ inc: 100000 }), FX, NOW), 'giving').amount).toBe(0);
  });
});

describe('fix round 2', () => {
  it('no target age + known age plans with the suggested target age', () => {
    // age 33, freedom: suggestAge = max(50, 48) = 50
    const m = model({ inc: 100000, needs: 50000, spendExEmi: 4000 }, { bankBal: 100000 });
    const a = plan(data({ age: '33', targetAge: null }), m, FX, NOW);
    const b = plan(data({ age: '33', targetAge: 50 }), m, FX, NOW);
    expect(a.longTerm).toEqual(b.longTerm);
    expect(a.longTerm.status).not.toBe('needAge');
    expect(a.longTerm.reserve).toBeGreaterThan(0);
    expect(a.lines).toEqual(b.lines);
  });

  it('earliest counts money freed when earlier goals finish', () => {
    // avail 100000. G1 (good) takes 99947/mo: 28 months × 99947 = 2,798,516 ≈ price; its date is now+28 = 2029-03.
    // G2 price 400000 (saved 0, ret 0, infl 0) due now+30, income 10000 → 40× ≥ 24 → bad; processed after G1 (later date).
    // From S = 28 the full 100000 is free: 400000 / 100000 = 4 months → month 32.
    const g1 = goal({ id: 'a', name: 'A', price: 99947 * 28, date: addMonths(28) });
    const g2 = goal({ id: 'b', name: 'B', price: 400000, date: addMonths(30) });
    const { results } = assessGoals([g1, g2], 100000, 10000, 0, NOW, noSlip, FX);
    const r1 = results.find((r) => r.id === 'a')!;
    const r2 = results.find((r) => r.id === 'b')!;
    expect(r1.verdict).toBe('good');
    expect(r1.monthly).toBe(99947);
    expect(r2.verdict).toBe('bad');
    expect(r2.earliest).toBe(addMonths(32));
  });
});

describe('final fixes', () => {
  it('loan with EMI 0 (unknown): the observed EMI stays on the debt line', () => {
    // Imported loan, EMI not entered yet: minPay 0. Observed Loan EMI average 14200.
    // The loan is "EMI unknown": left out of the payoff and the minimums (0), so the fallback is the full 14200.
    const d = data({ debts: [debt({ id: 'l', name: 'Car loan', balance: 472000, apr: 9.5, minPay: 0 })] });
    const P = plan(d, model({ inc: 100000, needs: 50000, emi: 14200 }), FX, NOW);
    expect(line(P, 'debt').amount).toBe(14200);
    expect(line(P, 'debt').explain).toContain('14.2K');
    // No loan with a known EMI → no payoff date.
    expect(P.debtFree).toBeNull();
    // 100000 − 50000 − 14200 = 35800 guilt-free
    expect(P.guiltFree).toBeCloseTo(35800, 6);
  });

  it('some loans with EMI, one without: fallback = observed − known EMIs', () => {
    // Known loan: 10000 balance, 0% APR, EMI 5000 → clears in 2 months (2027-01).
    // Unknown loan: EMI 0. Observed EMI 14200 → fallback max(0, 14200 − 5000) = 9200.
    // Debt line = 5000 + 9200 = 14200.
    const d = data({ debts: [debt({ id: 'k', name: 'Bike loan', balance: 10000, minPay: 5000 }), debt({ id: 'u', name: 'Car loan', balance: 472000, apr: 9.5, minPay: 0 })] });
    const P = plan(d, model({ inc: 100000, needs: 50000, emi: 14200 }), FX, NOW);
    expect(line(P, 'debt').amount).toBe(14200);
    expect(P.debtFree).toBe('2027-01');
    // Known EMIs above the observed average: fallback never negative → 20000 + 0.
    const d2 = data({ debts: [debt({ id: 'k', balance: 100000, minPay: 20000 }), debt({ id: 'u', balance: 5000, minPay: 0 })] });
    expect(line(plan(d2, model({ inc: 100000, needs: 50000, emi: 14200 }), FX, NOW), 'debt').amount).toBe(20000);
  });

  it('every loan has an EMI: no observed-EMI fallback (unchanged)', () => {
    const d = data({ debts: [debt({ id: 'k', balance: 142000, minPay: 14200 })] });
    // 14200 EMI only; the observed 14200 is the same loan, not added twice.
    expect(line(plan(d, model({ inc: 100000, needs: 50000, emi: 14200 }), FX, NOW), 'debt').amount).toBe(14200);
  });

  it("bad goal: 'earliest' is never before the goal's own date", () => {
    // avail 1000, income 100. A: 2000 by now+2 → 1000/mo, good; takes everything (remaining 0) until month 2.
    // B: 3000 by now+12, 30× income → bad. From S = 2 the full 1000 is free: 3000 / 1000 = 3 months → month 5,
    // which is before B's own date (month 12). Clamped to the goal's date + 1 month = month 13.
    const a = goal({ id: 'a', name: 'A', price: 2000, date: addMonths(2) });
    const b = goal({ id: 'b', name: 'B', price: 3000, date: addMonths(12) });
    const { results } = assessGoals([a, b], 1000, 100, 0, NOW, noSlip, FX);
    expect(results.find((r) => r.id === 'a')!.verdict).toBe('good');
    const rb = results.find((r) => r.id === 'b')!;
    expect(rb.verdict).toBe('bad');
    expect(rb.earliest).toBe(addMonths(13));
  });
});

function addMonths(k: number) { return addM(NOW, k); }

describe('switching the view currency', () => {
  it('only rescales the guilt-free amount; old monthly rates do not change the plan', async () => {
    const { build } = await import('../model');
    const d: Data = blank('INR');
    d.accounts = { HDFC: { name: 'HDFC', kind: 'bank', currency: 'INR' } };
    d.settings.age = '33';
    let seq = 0;
    const tx = (date: string, desc: string, amt: number, bal: number) => ({ id: date + desc, acct: 'HDFC', date, desc, amt, bal, seq: seq++ });
    d.txns = ['2026-08', '2026-09', '2026-10'].flatMap((m, i) => [
      tx(`${m}-01`, 'SALARY ACME', 300000, 1000000 + i * 150000),
      tx(`${m}-03`, 'HOUSE RENT', -100000, 900000 + i * 150000),
      tx(`${m}-28`, 'AMAZON', -50000, 850000 + i * 150000)
    ]);
    const inr = plan(d, build(d, FX), FX, NOW);
    expect(inr.guiltFree).toBeGreaterThan(0);

    // View in USD. Today 1 INR = 0.012 USD; the old months had different rates (0.0125, 0.0118, 0.0121).
    const usdData: Data = { ...d, settings: { ...d.settings, currency: 'USD' } };
    const set = (r: number, date: string) => ({ base: 'USD', date, r: { INR: 1 / r, USD: 1 } });
    const usdFx = { ...EMPTY_FX('USD'), today: set(0.012, '2026-11-09'),
      months: { '2026-08': set(0.0125, '2026-08-01'), '2026-09': set(0.0118, '2026-09-01'), '2026-10': set(0.0121, '2026-10-01') } };
    const usd = plan(usdData, build(usdData, usdFx), usdFx, NOW);

    // Same plan, just converted at today's rate: ₹X guilt-free → $X × 0.012.
    expect(usd.guiltFree).toBeCloseTo(inr.guiltFree * 0.012, 2);
    expect(usd.shortfall).toBe(0);
  });
});
