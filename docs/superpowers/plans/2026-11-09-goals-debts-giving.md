# Goals, Debts, Giving & Multi-currency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a long-term goal, short-term goals with affordability verdicts, credit cards and loans with a payoff plan, zakat and sadaqah, a monthly guilt-free amount, a currency setting, and multi-currency accounts normalised to one view currency.

**Architecture:** All money logic lives in pure, tested modules in `src/lib/`:
- `fx.ts`: exchange rates.
- `model.ts`: builds monthly totals, now converting currencies.
- `debt.ts`: payoff simulation.
- `plan.ts`: the monthly waterfall, the long-term goal and the verdicts.
- `giving.ts`: zakat and charity.

Views are thin. `plan()` is the single source for every headline number, so Overview, Goals and Debts can never disagree.

**Tech Stack:** React 19, TypeScript strict, Vite 6, Vitest 3, Chart.js 4. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-11-09-goals-debts-giving-design.md`. Read it in full, including the "Resolutions from the builder check" and the multi-currency addendum. Both override earlier sections.

## Global Constraints

- No new runtime dependencies.
- Colours come only from the existing CSS variables in `src/styles.css`, so they work in light and dark mode. No hard-coded backgrounds.
- The layout works at phone width with six tabs.
- The **only** network request is for exchange rates. It is made only when an account, debt, goal, gift or asset uses a currency other than the view currency. The request carries only currency codes and dates.
- Rates URL: `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{latest|YYYY-MM-DD}/v1/currencies/{base}.json`. Fallback: `https://{latest|YYYY-MM-DD}.currency-api.pages.dev/v1/currencies/{base}.json`. `base` is lowercase.
- Old `localStorage` data (`bachat.v1`) and v1 backup codes must still load.
- With Islamic guidance off, zakat and the spiritual-reward wording are not rendered at all.
- Every headline figure has an `Explain` disclosure that shows the calculation with the user's own numbers.
- Constants (in `src/lib/plan.ts` unless noted):
  - `STRETCH_MAX_MONTHS = 24`
  - `BAD_INCOME_MULTIPLE = 24`
  - `CARD_MIN_PCT_DEFAULT = 5`
  - `GOLD_NISAB_G = 87.48`, `SILVER_NISAB_G = 612.36` (`giving.ts`)
  - `ZAKAT_RATE = 0.025`
  - `LUNAR_YEAR_DAYS = 354`
  - `FX_TTL_MS = 12 * 3600e3` (`fx.ts`)
- Default needs categories: `Rent & housing, Groceries, Bills & utilities, Mobile & internet, Transport, Fuel & vehicle, Health, Insurance, Education, Family support, Fees & charges, Taxes`.
- Suggested target age:
  - Freedom: `max(50, age + 15)`.
  - Retirement: `max(60, age + 10)`.

## Review Focus

1. **A user whose spending is greater than their income.** The waterfall shows guilt-free 0, the shortfall and its biggest cause, with no `NaN` or negative guilt-free. The test goes in Task 6.
2. **A currency with no rate available** (offline on first run, or a currency the source doesn't have). The amounts aren't silently treated as 1:1. They're left out of totals and listed in `M.fxMissing`, and a banner asks for a manual rate. The test goes in Task 4.
3. **A debt with APR 0 or minimum payment 0.** The payoff ends (no infinite loop) and reports `never` when there's no extra money. The test goes in Task 5.
4. **A goal date in the past, or this month.** Its verdict is "bad" unless already fully saved, which is "good". It doesn't divide by zero. The test goes in Task 6.
5. **The view currency changes after data exists.** Stored amounts are untouched and totals re-convert. The test goes in Task 4.

---

### Task 0: Put the project under version control

The folder is not a git repository. The commit steps in this plan need one.

- [ ] **Step 1:** `cd /Users/saadjunaidi/bachat && git init && git add -A && git commit -m "chore: baseline before goals/debts/giving"`. Expected: a commit is created, and `.superpowers/`, `node_modules`, `dist` are ignored (already in `.gitignore`).
- [ ] **Step 2:** `npm test`. Expected: all existing tests pass (the baseline).

---

### Task 1: Data model and migration

**Files:**
- Modify: `src/lib/types.ts`, `src/lib/storage.ts`
- Test: `src/lib/__tests__/migrate.test.ts`

**Interfaces (Produces):**
```ts
export type AcctKind = 'bank' | 'card' | 'loan';
export interface AccountInfo { name: string; kind?: AcctKind; currency?: string }
export interface Debt { id: string; name: string; kind: 'card' | 'loan'; acct?: string; currency: string; balance: number; asOf: string; apr: number; minPay: number; minPct?: number; revolving: boolean }
export interface ShortGoal { id: string; name: string; price: number; currency: string; date: string /*YYYY-MM*/; saved: number; ret: number; stretchChoice: 'wait' | 'onTime' }
export interface Gift { id: string; date: string; amount: number; currency: string; kind: 'sadaqah' | 'zakat' | 'charity'; cause?: string }
export interface Assets { currency: string; goldG: number; silverG: number; investments: number; owed: number; stock: number; other: number }
export interface LongTerm { type: 'freedom' | 'retirement'; targetAge: number | null; mult: 25 | 30 | 33; ret: number; infl: number; retirePct: number }
export interface Settings {
  selfName: string; age: string; currency: string; longTerm: LongTerm;
  islamic: boolean; nisab: 'silver' | 'gold'; goldPrice: number; silverPrice: number; // per gram, view currency
  zakatDate: string | null; givingPlan: number; impact: { meal: number; school: number } | null;
  strategy: 'avalanche' | 'snowball'; extra: number;
  needs: Record<string, boolean>;       // user overrides of the default needs set
  fxOverrides: Record<string, number>;  // "USD" -> units of view currency per 1 USD
}
// Data: accounts: Record<string, AccountInfo>; goals: ShortGoal[]; debts: Debt[]; gifts: Gift[]; assets: Assets; (other fields unchanged)
export function migrate(raw: any): Data
```
- Defaults:
  - `currency 'INR'`
  - `longTerm {type:'freedom', targetAge:null, mult: raw.settings.mult ?? 30, ret: raw.settings.ret ?? 12, infl: raw.settings.infl ?? 6, retirePct: 80}`
  - `islamic false`, `nisab 'silver'`, `goldPrice 0`, `silverPrice 0`, `zakatDate null`, `givingPlan 0`
  - `impact`: `{meal:60, school:25000}` for INR, `{meal:200, school:60000}` for PKR, otherwise `null`
  - `strategy 'avalanche'`, `extra 0`, `needs {}`, `fxOverrides {}`
  - `debts []`, `gifts []`, `assets` all 0 in the view currency
- An old `Goal` `{target, date, link, saved, ret}` becomes a `ShortGoal`:
  - `{price: target, saved: link ? 0 : saved, currency, stretchChoice: 'wait'}`
  - Set `Data.notice = 'goalsMigrated'` (new optional string) when any old goal had `link: true`.

- [ ] **Step 1: Write the failing tests** in `migrate.test.ts`:
  - `migrate` of a v1 object `{txns:[], goals:[{id:'g1',name:'Car',target:500000,date:'2027-06',link:true,saved:9,ret:7}], settings:{mult:25,ret:10,infl:5,age:'33'}}`:
    - `goals[0]` → `{price:500000, saved:0, currency:'INR', stretchChoice:'wait'}`
    - `settings.longTerm.mult === 25`, `.ret === 10`, `.infl === 5`
    - `notice === 'goalsMigrated'`
    - `debts` → `[]`
  - `migrate` of current-shape data is idempotent: `migrate(migrate(x))` deep-equals `migrate(x)`.
  - `accounts` without `kind` stay without `kind` (meaning bank), and `kindOf(acc)` returns `'bank'`. Export `kindOf` from `types.ts`.
- [ ] **Step 2:** `npx vitest run src/lib/__tests__/migrate.test.ts`. Expected: FAIL (`migrate` not exported).
- [ ] **Step 3: Implement.**
  - `storage.loadData` calls `migrate(JSON.parse(...))`.
  - Remove `Settings.mult/ret/infl` from the top level.
  - Fix compile errors in `views/Goals.tsx` minimally (it is rewritten in Task 11). Read `st.longTerm.*` for now and keep it compiling.
- [ ] **Step 4:** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** `git commit -am "feat: data model for debts, gifts, assets, long-term goal; migrate old data"`

---

### Task 2: Currency-aware formatting and parsing

**Files:** Modify `src/lib/format.ts`, `src/lib/parse.ts`. Test: `src/lib/__tests__/currency.test.ts`.

**Interfaces (Produces):**
- `setCurrency(code: string): void`: the module-level view currency.
- `getCurrency(): string`
- `money(n: number, cur?: string): string`
- `short(n: number, cur?: string): string`
- `sym(cur: string): string`
- `SOUTH_ASIAN = ['INR','PKR','BDT','NPR','LKR']`
- `CURRENCIES: string[]`: the picker list. Start with INR, PKR, USD, EUR, GBP, AED, SAR, BDT, NPR, LKR, CAD, AUD, SGD, MYR, QAR, KWD, OMR, BHD, TRY, IDR, ZAR, NGN, EGP, then all of `Intl.supportedValuesOf('currency')` when available.

Rules:
- Symbols:
  - Explicit map: `{INR:'₹', PKR:'Rs ', BDT:'৳', NPR:'Rs ', LKR:'Rs ', AED:'AED ', SAR:'SAR ', QAR:'QAR ', KWD:'KWD ', OMR:'OMR ', BHD:'BHD '}`.
  - Otherwise the `narrowSymbol` from `Intl.NumberFormat('en', {style:'currency', currency})`.
- Grouping: `en-IN` for South Asian currencies, `en` for everything else.
- Short forms:
  - South Asian currencies keep `L` / `Cr`.
  - Everything else uses `K` / `M` / `B` (thresholds 1e3, 1e6, 1e9), with the same rounding as the existing `f()`.

- [ ] **Step 1: Write the failing tests:**
  - `money(185000)` → `'₹1,85,000'` (the default is INR).
  - `short(1234567)` → `'₹12.3 L'`
  - `money(185000,'PKR')` → `'Rs 1,85,000'`
  - `short(12345678,'PKR')` → `'Rs 1.23 Cr'`
  - `money(1500,'USD')` → `'$1,500'`
  - `short(2_500_000,'USD')` → `'$2.5M'`
  - `short(-4200,'EUR')` → `'−€4.2K'`
  - `money(1500,'AED')` → `'AED 1,500'`
  - After `setCurrency('USD')`, `money(10)` → `'$10'`. Reset to INR in `afterEach`.
  - `num('$1,234.50')` → `1234.5`, `num('€ 99')` → `99`, `num('PKR 1,000')` → `1000`, `num('Rs. 500 Dr')` → `500`, `num('AED -20')` → `-20`
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - In `num()`, replace the `₹|inr|rs` strip with one that removes any run of letters or currency symbols (`/[A-Za-z$€£¥₹৳₨﷼]+\.?/g`) after checking for a trailing `cr` or `dr`. Keep the existing negative handling.
  - Replace the literal "(₹)" labels and the "₹50 lakh" placeholder in views with `sym(getCurrency())`. Find them with `grep -rn "₹" src/views src/components`.
  - Replace "30× (safer for India)" with "30× (safer when inflation is high)".
- [ ] **Step 4:** `npm test`. Expected: PASS, including the old `'formats rupees the Indian way'` test, unchanged.
- [ ] **Step 5:** Commit: `feat: currency-aware formatting and amount parsing`.

---

### Task 3: Exchange rates (`fx.ts`), security headers and README

**Files:** Create `src/lib/fx.ts`. Modify `nginx.conf` (3 CSP lines), `firebase.json`, `README.md`, and `public/privacy.html` if it states "no requests". Test: `src/lib/__tests__/fx.test.ts`.

**Interfaces (Produces):**
```ts
export interface RateSet { base: string; date: string; r: Record<string, number> } // 1 base = r[CUR] CUR (codes uppercase)
export interface Fx { view: string; today: RateSet | null; months: Record<string, RateSet>; overrides: Record<string, number>; fetchedAt: number | null; failed: boolean }
export const EMPTY_FX = (view: string): Fx
export function toView(amt: number, cur: string, fx: Fx, month?: string): number | null // null = no rate
export function foreignCurrencies(d: Data): string[]   // all currencies in accounts/debts/goals/gifts/assets ≠ view
export async function loadFx(view: string, curs: string[], months: string[], opts?: { fetch?: typeof fetch; now?: number; storage?: Storage }): Promise<Fx>
```
Rules:
- `toView` lookup order:
  1. `overrides[cur]`, which is view units per 1 `cur`, so the result is `amt * override`.
  2. Otherwise, if `month` is given, the `months[month]` rate set; otherwise `today`.
  3. If the chosen set has no rate for `cur`, fall back to `today`.
  4. If there's still no rate, return `null`.
- The result is `amt / set.r[cur]`.
- When `cur === view`, return `amt` unchanged.
- `loadFx`:
  - With `curs` empty, return `EMPTY_FX(view)` **without calling fetch**.
  - Cache key `bachat.rates`, holding `{[view]: {today, fetchedAt, months}}`.
  - Re-fetch today's rates only when `now - fetchedAt > FX_TTL_MS`.
  - Fetch each missing month's snapshot for date `YYYY-MM-01` once; past months never re-fetch.
  - For each request, try the jsDelivr URL first, then the pages.dev fallback.
  - On total failure, return the cached sets with `failed: true`.
  - Uppercase the response keys.
  - Only months that contain foreign-currency transactions are passed in by callers.

- [ ] **Step 1: Write the failing tests** with a fake `fetch` (a counter plus canned JSON `{date:'2026-11-09', pkr:{usd:0.0036, aed:0.0132}}`) and a `Map`-backed fake `Storage`:
  - `loadFx('PKR', [], [])` makes 0 fetch calls.
  - `loadFx('PKR', ['USD'], [])` makes 1 call, and the URL contains `@latest/v1/currencies/pkr.json`. With that result, `toView(100,'USD',fx)` is ≈ 27777.78 (`toBeCloseTo(27777.78, 1)`).
  - A second `loadFx` within 12 h using the same storage makes 0 new calls. At `now + 13h` it makes 1 call.
  - When the first URL rejects, the pages.dev URL is tried, and the result is still loaded.
  - When both reject and there's no cache: `failed === true`, and `toView(1,'USD',fx) === null`.
  - When both reject and there is a cache: the cached rates are returned with `failed === true`.
  - `overrides: {USD: 280}` makes `toView(2,'USD',fx) === 560`, even with a fetched rate present.
  - `toView(5,'PKR',fx) === 5` (the view currency is untouched).
  - A month snapshot is used for a `month` argument. A missing month falls back to today.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement `fx.ts`.** Then:
  - Change `connect-src 'self'` → `connect-src 'self' https://cdn.jsdelivr.net https://*.currency-api.pages.dev` in all 3 nginx lines and in firebase.json.
  - README: replace the "**no requests to any other site**" sentence with: "The only request it ever makes is for exchange rates, and only if you add an account in a second currency. That request contains currency codes and dates, never your data."
- [ ] **Step 4:** `npm test`. Expected: PASS. `grep -c "currency-api" nginx.conf firebase.json`. Expected: `3` and `1`.
- [ ] **Step 5:** Commit: `feat: live exchange rates with cache, fallback and manual override`.

---

### Task 4: Model: currency conversion, needs, account kinds, net worth

**Files:** Modify `src/lib/model.ts`, `src/lib/categories.ts`. Test: `src/lib/__tests__/model.test.ts`.

**Interfaces:**
- **Consumes:** `toView`, `Fx`, `EMPTY_FX` (Task 3); `kindOf` (Task 1).
- **Produces:**
  - `build(d: Data, fx?: Fx): Model`. `fx` defaults to `EMPTY_FX(d.settings.currency)`.
  - `ATxn` gains `orig: { amt: number; cur: string } | null`. `amt` is in the view currency. `orig` is set only when converted.
  - `Model` gains:
    - `fxMissing: string[]`
    - `needs: Record<string, number>`: per-month needs total, keyed by month.
    - `a3.needs: number`, `a3.emi: number`, `a3.spendExEmi: number`
    - `bankBal: number`: today's rate, bank accounts only.
    - `debtTotal: number`: the sum of `d.debts` balances, converted at today's rate.
    - `assetsTotal: number`: the investments, owed, stock and other fields of `d.assets` + `goldG*goldPrice` + `silverG*silverPrice`, converted where needed.
    - `netWorth: number` = `bankBal + assetsTotal − debtTotal`.
  - `categories.ts`: `export const NEEDS_DEFAULT: Set<string>`; `export function isNeed(cat: string, s: Settings): boolean`. `s.needs[cat]` overrides the default.
- Rules:
  - Transactions convert at their month's rate (`toView(t.amt, accCur, fx, t.m)`).
  - Balances (`acc.bal`, `trend`) convert at today's rate.
  - A transaction whose rate is `null` is left out of `A` and its currency is added to `fxMissing`.
  - `end` and `isComplete` consider only accounts whose `kindOf` is `'bank'`. If there is none, consider all accounts.
  - `totalBal` keeps its meaning: bank accounts only.

- [ ] **Step 1: Write the failing tests:**
  - **Mixed currencies:**
    - A PKR view, a PKR account with income 300000 in 2026-10, and a USD account with expense −100 in 2026-10.
    - `fx` with `months['2026-10'].r.USD = 0.0036` and `today.r.USD = 0.0035`.
    - Expected: `MO['2026-10'].exp` ≈ 27777.78. The USD transaction's `orig` is `{amt:-100, cur:'USD'}`. A USD account balance of 1000 → `bankBal` includes ≈ 285714.29 (today's rate).
  - **Missing rate:** the same data with `EMPTY_FX('PKR')` → `fxMissing` is `['USD']` and `MO['2026-10'].exp === 0`.
  - **View currency changes:** `build` of the same `Data` with view `USD` and a rate set gives different totals, and `d.txns[0].amt` is unchanged (spy on it, or deep-compare a snapshot taken before).
  - **A card purchase counted once:**
    - Card account (`kind:'card'`) with a purchase of −5000, category Shopping.
    - Bank account paying `CREDIT CARD PAYMENT` −5000.
    - Expected: the month's `exp === 5000`, and `cats['Shopping'] === 5000`.
  - **Needs:**
    - Rent 42000 and Shopping 10000 → `needs[m] === 42000`.
    - With `settings.needs = {Shopping: true}` → 52000.
    - `Loan EMI` is never counted as a need.
  - **EMI and spending:** `a3.emi` = the average of `Loan EMI`, and `a3.spendExEmi = a3.exp − a3.emi`.
  - **Completeness ignores loans:** a loan account whose last transaction is 2026-05 doesn't change `complete` when the bank account runs to 2026-10-28.
  - **Net worth:**
    - `assets {investments:100000, goldG:10}` with `goldPrice:7000`, plus one debt with balance 20000.
    - Expected: `netWorth === bankBal + 170000 − 20000`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Keep the existing exported names and behaviour for single-currency data. The old tests in `core.test.ts` must pass unchanged.
- [ ] **Step 4:** `npm test && npm run typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: model converts currencies, splits needs, net worth`.

---

### Task 5: Debt payoff simulation

**Files:** Create `src/lib/debt.ts`. Test: `src/lib/__tests__/debt.test.ts`.

**Interfaces (Produces):**
```ts
export interface PayDebt { id: string; name: string; kind: 'card' | 'loan'; balance: number; apr: number; minPay: number; minPct?: number }
export interface PayoffResult { order: { id: string; month: number }[]; months: number; interest: number; never: string[]; payments: number[] /* total paid per month index */ }
export function minPayment(d: PayDebt, bal: number): number // card: max(minPay, (minPct ?? 5)% of bal); loan: minPay; never more than bal + this month's interest
export function payoff(debts: PayDebt[], strategy: 'avalanche' | 'snowball', extra: number, maxMonths?: number /*600*/): PayoffResult
export function compare(debts: PayDebt[], strategy: 'avalanche' | 'snowball', extra: number): { base: PayoffResult; chosen: PayoffResult; interestSaved: number; monthsSaved: number }
export function monthlyDebtPayment(debts: PayDebt[]): number // sum of minPayment at current balances
export function toPayDebts(d: Data, fx: Fx): PayDebt[]  // revolving cards + loans, balances in view currency
```
Algorithm (from the spec), per month:
1. Add interest `bal * apr/1200` to every debt.
2. Pay every debt its `minPayment`.
3. `pool = extra + the minimums of debts already paid off`. Apply the pool to the target debt; any money left over moves to the next target in the same month.
   - **Avalanche** target: highest `apr`, ties broken by smallest balance.
   - **Snowball** target: smallest balance, ties broken by highest `apr`.
4. Record `order` when a balance reaches ≤ 0.005.
5. Stop when all debts are cleared or at `maxMonths` (then `months = Infinity`).

`never` lists debts whose minimum payment is ≤ their first month's interest when `extra === 0`.

- [ ] **Step 1: Write the failing tests:**
  - A single loan `{balance:100000, apr:12, minPay:8884.88}` takes `months === 12` (standard EMI), with `interest` ≈ 6618.56 (±1).
  - Avalanche vs. snowball with a card `{balance:68000, apr:42, minPay:3400}` and a loan `{balance:472000, apr:9.5, minPay:14200}`, `extra:10000`:
    - Avalanche `order[0].id === card`. Snowball also clears the card first here (it has the smaller balance).
    - Add a third debt `{balance:20000, apr:5, minPay:1000}`: snowball now clears it first, and avalanche still clears the card first.
  - `compare(..., 10000).interestSaved > 0`, and `monthsSaved > 0`.
  - A card `{balance:100000, apr:36, minPay:2000, minPct:0}` with `extra:0`: `never` contains its id, and `months === Infinity`, returned within `maxMonths`.
  - APR 0, minPay 0, extra 0: it terminates, with `months === Infinity` and the id in `never`.
  - `minPayment` of a card with balance 1000, `minPct` 5, `minPay` 200 is 200. With balance 10000 it is 500.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement `debt.ts`.
- [ ] **Step 4:** `npx vitest run src/lib/__tests__/debt.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: debt payoff simulation (avalanche/snowball)`.

---

### Task 6: The plan: waterfall, long-term goal, verdicts

**Files:** Create `src/lib/plan.ts`. Test: `src/lib/__tests__/plan.test.ts`.

**Interfaces:**
- **Consumes:** `Model` (Task 4), `payoff`, `toPayDebts`, `monthlyDebtPayment` (Task 5), `needed`, `monthsTo`, `mrate` (`finance.ts`), `zakatFor` (Task 7: build Task 7 first, or stub giving at 0 and wire it in Task 7).
- **Produces:**
```ts
export interface PlanLine { key: 'income' | 'needs' | 'debt' | 'giving' | 'longTerm' | 'goals'; label: string; amount: number; explain: string }
export interface LongTermResult { target: number; have: number; reserve: number; yearlySpend: number; targetMonth: string | null; projected: string | null; status: 'ahead' | 'on' | 'behind' | 'needAge'; monthsVsTarget: number | null; projectedNoExtra: string | null }
export type Verdict = 'good' | 'stretch' | 'bad';
export interface GoalResult { id: string; verdict: Verdict; priceAdj: number; monthly: number; effDate: string; waitDate: string | null; waitMonthly: number | null; onTimeSlip: number | null; earliest: string | null; incomeMultiple: number; reason: string }
export interface Plan { ready: boolean; lines: PlanLine[]; guiltFree: number; shortfall: number; biggest: string | null; longTerm: LongTermResult; goals: GoalResult[]; debtFree: string | null; netWorth: number }
export function suggestAge(type: LongTerm['type'], age: number): number
export function longTerm(input: { yearlySpend: number; have: number; age: number | null; lt: LongTerm; now: string; contrib: (k: number) => number }): LongTermResult
export function assessGoals(goals: ShortGoal[], avail: number, income: number, infl: number, now: string, ltSlip: (cut: number, months: number) => number, fx: Fx): { results: GoalResult[]; used: number; ltCut: (k: number) => number }
export function plan(d: Data, M: Model, fx: Fx, now: string): Plan
```

**Rules** (spec sections "Monthly money plan", "Long-term goal", "Short-term goal verdict", and resolutions 2–8):

- **`ready`** is `false` when `M.a3.months.length === 0`. In that case `plan` returns zeroed lines and `guiltFree: 0`.
- **The lines, in order:**

  | Line | Amount |
  |---|---|
  | `income` | `a3.inc` |
  | `needs` | `a3.needs` |
  | `debt` | `monthlyDebtPayment(toPayDebts) + settings.extra`. If there is no loan debt and `a3.emi > 0`, add `a3.emi`, with an explain sentence that tells the user to add the loan. |
  | `giving` | `(islamic ? zakatDue/12 : 0) + givingPlan` |
  | `longTerm` | `max(0, LT.reserve − ltCutNow)` |
  | `goals` | the sum of the goals' `monthly` |

- **`guiltFree`** = `income − the sum of the rest`, floored at 0. `shortfall` = the negative part as a positive number. `biggest` = the name of the largest of the non-income lines or the individual goals.
- **Long-term goal:**
  - `yearlySpend = 12 * a3.spendExEmi`.
  - `target = yearlySpend * mult * (retirement ? retirePct/100 : 1)`.
  - `have = max(0, M.bankBal + investments − Σ goal.saved)`.
  - `realRet = (1+ret/100)/(1+infl/100) − 1`.
  - With `age` or `targetAge` null: `status: 'needAge'` and `reserve 0`.
  - Otherwise `targetMonth = now + (targetAge − age)*12`, and `reserve = needed(target, have, months, realRet)`.
  - `projected` comes from simulating `have` growing at `realRet` plus `contrib(k)` until `target`.
  - `contrib(k) = reserve − ltCut(k) + (k > debtFreeMonthIdx ? debtLine : 0)`.
  - `status`: `'on'` within ±1 month, otherwise `'ahead'` or `'behind'`.
  - `projectedNoExtra` is the same calculation with `extra = 0`, and it powers the "N months earlier" line.
- **Verdicts:** `avail = income − needs − debt − giving − LT.reserve`, floored at 0. Process the goals in ascending order of `goal.date`; `remaining` starts as `avail`. For each goal:
  - Set `n = mdiff(now, date)`, `priceAdj = toView(price)*(1+infl/100)^(n/12)`, `need = n<=0 ? (saved>=price ? 0 : Infinity) : needed(priceAdj, saved, n, ret/100)`, and `incomeMultiple = price / income`.
  - **good:** `need <= remaining`. Then `remaining −= need`.
  - **wait option:** the smallest `k` in 1..24 with `needed(priceAdj_k, saved, n+k) <= remaining`.
  - **on-time option:** `slip = ltSlip(need − remaining, n)`, which is valid if `slip <= 24`.
  - **bad** if `incomeMultiple >= 24`, or if neither option is valid. `earliest` = the smallest `k ≤ 600` for which it would be good, or `null`.
  - **stretch** otherwise. Use `stretchChoice`, unless the chosen option is invalid, in which case use the other one.
    - **wait:** `monthly = waitMonthly`, `effDate = date + k`, `remaining −= waitMonthly`.
    - **onTime:** `monthly = need`, `remaining = 0`, and `ltCut += need − remaining` for months `1..n`.
  - **Order:** processing follows the original `date`. The spec's "the waited date becomes its order" is circular, so this is a builder's call; record it in the PR description.
  - **`reason`** is one plain sentence, with numbers formatted by `short()`. Examples:
    - "Fits: ₹12.5K/mo leaves every other goal on time."
    - "Buy Mar 2027 and freedom slips 4 months, or wait until Aug 2027 and nothing slips."
    - "That's 50× your monthly income. You'd need a loan. Earliest without debt: 2034."

- [ ] **Step 1: Write the failing tests.** Hand-check every expected value, and write the arithmetic in a comment above each assertion.
  - `suggestAge('freedom', 33) === 50`, `suggestAge('freedom', 40) === 55`, `suggestAge('retirement', 55) === 65`.
  - **The owner's example:** income 100000/mo, needs 50000, no debt, a goal "Luxury car" priced 5000000, due 2027-12 from `now` 2026-11.
    - Expected: `verdict 'bad'`, `incomeMultiple === 50`, and `reason` contains `'50×'`.
  - **Good:** the same income, a phone priced 150000 due 12 months out, `infl 0`, `ret 0`, `avail 30000`.
    - Expected: `need === 12500`, `verdict 'good'`, `monthly === 12500`.
  - **Stretch by waiting:**
    - Price 400000 due in 4 months with `avail` 30000 (`need` 100000 > 30000).
    - Waiting k=10 makes it 400000/14 ≈ 28571 ≤ 30000 → `stretch`, `waitDate = now+14`, using the default choice `wait`.
    - The test fixes `ltSlip` to return 30 (over the limit), so on-time is invalid.
  - **Stretch on time:** the same goal with `stretchChoice 'onTime'` and `ltSlip` returning 4 → `monthly 100000`, `onTimeSlip 4`.
  - **Bad, neither option fits:** price 2000000, due in 3 months, income 100000 (multiple 20 < 24), `avail` 10000, `ltSlip` returning 99 → `bad`.
  - **Past date:** date = `now − 1`, `saved < price` → `bad`. `saved >= price` → `good` with `monthly 0`.
  - **Waterfall, normal month:**
    - Inputs: income 100000, needs 52000, a revolving card minimum 3400, a loan EMI 14200, extra 0, giving 0, LT reserve 10000, goal monthly 2000.
    - Expected: `guiltFree === 18400`, and `lines.map(l=>l.key)` is in the documented order.
  - **Spending more than income:** income 50000, needs 60000 → `guiltFree 0`, `shortfall 10000` (+ the other lines), `biggest === 'Needs'`. Nothing is `NaN`.
  - **Not enough data:** `ready: false` and `guiltFree: 0`.
  - **EMI with no loan added:** `a3.emi` 14200 and no loan debt → the `debt` line includes 14200, and its explain text contains `'add this loan'`.
  - **Long-term, retirement:**
    - `yearlySpend` 600000, `mult` 25, `retirePct` 80 → `target === 12000000`.
    - `have` 0, `age` 30, `targetAge` 60, `ret` = `infl` (realRet 0) → `reserve === 12000000/360` = 33333.33.
  - **Long-term status:** with `contrib` = `reserve` exactly → `status 'on'`. With a debt freed at month 12 adding 17600/mo → `'ahead'`, and `projected < targetMonth`.
  - **Goal savings aren't counted twice:** a goal with `saved` 50000 and `bankBal` 200000 → `have === 150000`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement `plan.ts`. Each `PlanLine.explain` and `LongTermResult` field must be computable for display without recomputing anything in views.
- [ ] **Step 4:** `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: monthly plan, long-term goal, affordability verdicts`.

---

### Task 7: Zakat and giving

**Files:** Create `src/lib/giving.ts`. Test: `src/lib/__tests__/giving.test.ts`. Wire `zakatFor` into `plan()`'s giving line.

**Interfaces (Produces):**
```ts
export interface ZakatInput { cash: number; goldG: number; silverG: number; goldPrice: number; silverPrice: number; investments: number; owed: number; stock: number; other: number; deductions: number; basis: 'silver' | 'gold' }
export interface ZakatResult { wealth: number; nisab: number; above: boolean; due: number; lines: { label: string; amount: number }[] }
export function zakat(i: ZakatInput): ZakatResult
export function deductionsDue(debts: PayDebt[]): number // cards: balance; loans: min(12*minPay, balance)
export function nextZakatDate(anchor: string, today: string): string // anchor + k*354 days, first date >= today (YYYY-MM-DD)
export function zakatFor(d: Data, M: Model, fx: Fx, today: string): ZakatResult // cash = M.bankBal; assets from d.assets; deductions from toPayDebts + paid-in-full cards
export interface GivingSummary { year: number; allTime: number; pctIncome: number; meals: number | null; schoolYears: number | null; entries: { date: string; amount: number; kind: string; cause?: string; fromStatement: boolean }[] }
export function givingSummary(d: Data, M: Model, fx: Fx, year: string): GivingSummary // includes M.A txns in 'Donations' as fromStatement
```

- [ ] **Step 1: Write the failing tests:**
  - **Silver basis, above nisab:**
    - `silverPrice 90` → `nisab === 612.36*90` = 55112.4.
    - cash 2520000, gold 40g at 7750 (310000), investments 200000, deductions 238000 → `wealth === 2792000` and `due === 69800`.
  - **Gold basis, below nisab:** `goldPrice 7750` → `nisab === 677970`. With wealth 500000 → `above false`, `due 0`.
  - **Deductions:** a card with balance 68000 plus a loan with balance 472000 and EMI 14200 → `68000 + 170400 = 238400`. A loan with balance 50000 and EMI 14200 contributes 50000.
  - **Next zakat date:** `nextZakatDate('2026-03-14','2026-11-09') === '2027-03-03'` (2026-03-14 + 354 days).
  - **Giving summary:**
    - Two logged gifts of 20000 and 2500 in 2026, plus one `Donations` transaction of −20000 in 2026.
    - Expected: `year === 42500`, and one entry has `fromStatement: true`.
    - With `impact {meal:50, school:25000}`: `meals === 850`, `schoolYears === 1.7`. With `impact` null, both are null.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement `giving.ts`. In `plan()`, the giving line is `(islamic && zakat.above ? zakat.due/12 : 0) + givingPlan`. Add a plan test: with Islamic guidance on and zakat due 69800 → the giving line is ≈ 5816.67.
- [ ] **Step 4:** `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: zakat calculator and giving summary`.

---

### Task 8: Backup v2

**Files:** Modify `src/lib/backup.ts`. Test: add to `core.test.ts` under `describe('backup')`.

- `makeBackup` writes `v: 2`, and `state` includes `debts, gifts, assets`. `settings` now contains the new fields.
- `restoreData` goes through `migrate()` (Task 1), so v1 codes load.
- `mergeData` merges `debts` and `gifts` by `id`, keeping the current entries when both sides have one. `assets`: keep the current values if any is non-zero, otherwise take the incoming ones.

- [ ] **Step 1: Write the failing tests:**
  - A v2 round trip keeps `debts[0].apr` and `gifts.length`.
  - A hand-built v1 JSON backup with an old-shape goal restores to a `ShortGoal` with `price`.
  - Merging data that has debt `d1` with a backup that has debts `d1` and `d2` → 2 debts, and `d1` keeps the current values.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: backup v2 with debts, gifts, assets`.

---

### Task 9: Store, settings, six tabs, Explain component

**Files:** Modify `src/store.tsx`, `src/App.tsx`, `src/styles.css`, `src/components/ui.tsx`. Create `src/components/Settings.tsx`.

**Interfaces (Produces):**
- `View` adds `'debts' | 'giving'`. `VIEWS` order: overview, spending, goals, debts, giving, statements.
- `useStore()` adds `fx: Fx` and `P: Plan` (memoised `plan(data, M, fx, thisMonth())`). `M` is now `build(data, fx)`.
- **Rates effect:** when `foreignCurrencies(data)` or the months of foreign-currency transactions change, call `loadFx` and set `fx`. When `settings.currency` changes, call `setCurrency` **before** render (synchronously inside the `useMemo` that builds `M`).
- `ui.tsx`: `export function Explain({ children }: { children: ReactNode })`. It is a `<details className="explain"><summary>How we worked this out</summary>…</details>`, styled with theme variables only.
- `ui.tsx`: `export function FxNote({ orig }: { orig: { amt: number; cur: string } | null })`. It shows the original amount and currency in a small muted line when `orig` is set.
- `Settings.tsx`: a sheet opened from a gear button in the header. It contains:
  - The view currency (`<select>` from `CURRENCIES`).
  - Islamic guidance (checkbox).
  - Current age.
  - Manual exchange rates: one number input per foreign currency, written to `settings.fxOverrides`.
  - The rates status line: "Rates from {date}", "Couldn't update rates (offline). Using {date}", or "No rate for USD. Enter one below.", driven by `fx.failed` and `M.fxMissing`.
- `App.tsx`:
  - A banner when `M.fxMissing.length`: "Some amounts in {list} aren't included because there's no exchange rate yet." with a button that opens Settings.
  - A banner when `data.notice === 'goalsMigrated'`, explaining once, with a dismiss button that clears it: "Goals that counted your bank balance now start at 0 saved. Your bank balance counts toward your long-term goal instead."
  - Debts tab icon: a card (`<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>`). Giving tab icon: a heart (`<path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z"/>`).
- `styles.css`: below 420px wide, bottom-bar labels go to 10px and icons stay at 22px, so all six tabs fit with no horizontal scroll.

- [ ] **Step 1:** Implement, then `npm run typecheck && npm test`. Expected: PASS.
- [ ] **Step 2:** `npm run dev`. In Chrome at 375px and at desktop width:
  - Six tabs are visible with no horizontal scroll.
  - The Settings sheet opens.
  - Switching the currency to USD changes the symbols on Overview to `$`.
  - Toggling dark mode keeps everything readable.
  - Debts and Giving show a placeholder.
- [ ] **Step 3:** Commit: `feat: settings sheet, six tabs, live rates in store`.

---

### Task 10: Statements: account kind, currency, debts, assets

**Files:** Modify `src/views/Statements.tsx`, `src/lib/types.ts` (the mapping gets `kind` and `currency`), `src/lib/importer.ts`. Test: add to `core.test.ts` `describe('import')`.

**Interfaces:**
- `commit(d, acct, rows, meta?: { kind: AcctKind; currency: string })`: stores `meta` on `accounts[acct]`. For `card` or `loan` with no `Debt` linked (`acct` matching), it creates one with defaults: card `{apr:36, minPay:0, minPct:5, revolving:false}`, loan `{apr:0, minPay:0}`. The balance is taken from the last row's `bal`, as an absolute value, if present. `asOf` is the last row's date.
- When a linked account has a balance column, a later import updates the `Debt`'s `balance` and `asOf`.
- `mappings[sig]` stores `{ map, acct, kind, currency }`, and `analyse` prefills them.
- Mapper UI adds:
  - "What is this statement?": a segmented choice of Bank account / Credit card / Loan.
  - "Currency of this account": a `<select>`, defaulting to the view currency.
  - After importing a card or loan, if `apr` or `minPay` is 0, the app jumps to the Debts tab with the new debt's edit form open, through `ui.editDebt` (add `editDebt: string | null` to `UI`).
- New panel **"Other things you own"** (`id="own"`), with inputs for gold g, silver g, investments, money owed to you, business stock and other, plus a currency select. It writes `data.assets`. Gold and silver prices live in Settings when Islamic guidance is off, and on the Giving tab when it is on; both write `settings.goldPrice` and `settings.silverPrice`. Put the price inputs in this panel too, so they are always reachable.
- The account list shows a kind badge and the currency code.

- [ ] **Step 1: Write the failing tests:**
  - Committing a card statement creates `debts[0]` with `kind 'card'` and `acct` set. Re-committing a newer statement with `bal` 70000 updates `balance` to 70000.
  - A loan import's rows don't change `MO[m].exp`. Mark loan-account transactions as type `transfer` in `build`: account kind `loan` → `type: 'transfer'`. Assert `exp` is unchanged.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement, including the `build()` rule "loan-account txns are transfers".
- [ ] **Step 4:** `npm test && npm run typecheck`. Expected: PASS. Manual check: import a CSV marked as a USD credit card. The account shows "Card · USD", and Debts lists it.
- [ ] **Step 5:** Commit: `feat: import cards and loans in any currency; other assets panel`.

---

### Task 11: Goals view

**Files:** Rewrite `src/views/Goals.tsx`.

The layout is the approved mockup:
1. **Long-term card.** Freedom/Retirement toggle. Target age input, prefilled with `suggestAge` and editable. If no age is set, ask for the current age inline. Four facts: target, have (with % of target), monthly reserve, and projected date with an on track/ahead/behind pill. Below it, an `Explain` with the formula and the user's numbers ("in today's money"). Settings: multiple (25/30/33), return %, inflation %, and retirement % of spending (shown only for retirement).
2. **Short-term goal cards** in date order. Each card has:
   - The name, a coloured left border and a verdict pill: good → `var(--accent)`, stretch → `var(--gold)`, bad → the existing danger colour variable.
   - The price (and the inflation-adjusted price if different), the date, a progress bar, and `reason`.
   - **Stretch:** a two-button choice, "Buy on time (freedom slips N months)" / "Wait until {date}", saved to `stretchChoice`.
   - **Bad:** the earliest date and the income multiple.
   - Edit and Remove.
3. **Add/Edit goal form:** name, price, currency (default the view currency), date, already saved, expected return %.
4. **"Where your monthly money goes" panel:** the `P.lines` as rows with amounts, then guilt-free in bold, with each line's `explain` in an `Explain`.

- [ ] **Step 1:** Implement, then `npm run typecheck`. Expected: PASS.
- [ ] **Step 2:** Dev server, sample data (Task 15 adds sample goals; until then, add the owner's example by hand: income from sample data, "Luxury car", 5000000, 13 months out). Check:
  - It shows **BAD DEAL** with "×" in the reason.
  - Changing the stretch choice changes the guilt-free amount on Overview after reload.
  - It's readable in dark mode at 375px.
- [ ] **Step 3:** Commit: `feat: goals screen with long-term goal and verdicts`.

---

### Task 12: Debts view

**Files:** Create `src/views/Debts.tsx`.

The layout is the approved mockup:
- **KPI row:**
  - Total owed (`M.debtTotal`).
  - Interest per month (Σ `bal*apr/1200`).
  - Debt-free date (`P.debtFree`, or "Never at minimums" when `months` is Infinity).
- **Debt list:** name, kind, currency, APR, balance, minimum or EMI, "statement imported {date}" when linked, and Edit/Remove. The edit form covers name, kind, currency, balance, APR, min payment, min % (cards), and "I clear this card in full every month" (`!revolving`).
- **"Fastest way out" panel:**
  - Strategy toggle → `settings.strategy`.
  - Extra per month: a range input (0 up to `P.guiltFree + settings.extra`, step 500) with the number shown → `settings.extra`.
  - An ordered list from `compare().chosen.order`: "Clear {name} by {month}".
  - "You save {interestSaved} in interest" and "{long-term} moves N months earlier" (`LT.projectedNoExtra` vs `LT.projected`).
  - An `Explain` with the rules.
- **Warnings:** for each id in `never`: "{name} will never be paid off at the minimum." For each debt with APR > `longTerm.ret`: "Paying off {name} earns you a guaranteed {apr}%. No investment reliably beats that."
- **Empty state** with "Add a card or loan" and "Import a statement".

- [ ] **Step 1:** Implement, then `npm run typecheck`. Expected: PASS.
- [ ] **Step 2:** Dev server. Add the mockup's card and loan (card `68000 @ 42%, min 3400, revolving`; loan `472000 @ 9.5%, EMI 14200`) and set extra to 10000. The card is listed first. Moving the slider changes the dates and the interest saved. The guilt-free amount on Overview drops by the extra.
- [ ] **Step 3:** Commit: `feat: debts screen with payoff plan`.

---

### Task 13: Giving view

**Files:** Create `src/views/Giving.tsx`.

The layout is the approved mockup (the dark-mode-fixed version):
- **Zakat panel**, rendered only when `settings.islamic`:
  - Zakat date input → `settings.zakatDate`, and "Next due {nextZakatDate}".
  - Nisab basis toggle; gold and silver price inputs.
  - The `zakat().lines` table: cash (from statements), gold, silver, investments, money owed, stock, deductions. Each figure has an edit link to the "Other things you own" panel (`go('statements','own')`).
  - Zakatable wealth with ✓ above nisab / below nisab, "Zakat due", and an `Explain`.
  - A "Log zakat payment" button that creates a `Gift` with kind `zakat`.
- **Sadaqah and charity panel:**
  - Year total, all-time total, % of income, and "+ Log a gift" (date, amount, currency, kind, cause).
  - Monthly giving plan input → `settings.givingPlan`.
  - Two tinted boxes using `background: color-mix(in srgb, var(--accent) 14%, transparent)` and the matching border:
    - **"Your impact on society"**: meals, school years and % of income. When `impact` is null, show "Add local costs to see what your giving adds up to" with inline inputs.
    - **"Spiritual reward"**, only when `islamic`: Quran 2:261 paraphrased ("Like a grain that sprouts seven ears, in every ear a hundred grains, multiplied up to 700×") and the hadith "Charity does not decrease wealth" (Muslim). No money figure.
  - The entries list, with "from your statements" marked.
- When `!settings.islamic`, the page title is "Giving", and there is no zakat or religious wording anywhere.

- [ ] **Step 1:** Implement, then `npm run typecheck`. Expected: PASS.
- [ ] **Step 2:** Dev server, both modes:
  - With Islamic guidance off, there is no "Zakat", "Quran" or "hadith" text in the DOM. Check with the browser's find, or `document.body.innerText.includes('Zakat') === false`.
  - With it on, the zakat figures match the hand values in the Task 7 test when entered.
  - Dark mode is readable.
- [ ] **Step 3:** Commit: `feat: giving screen with zakat and sadaqah`.

---

### Task 14: Overview hero row and the needs toggle on Spending

**Files:** Modify `src/views/Overview.tsx`, `src/views/Spending.tsx`.

- **Overview:** a new first KPI row above the existing one.
  - **Hero "Guilt-free this month"** with `P.guiltFree` and the sub-line "Yours to enjoy. Goals, debts and giving are already covered."
    - When `shortfall > 0`: "Short {shortfall}/mo. {biggest} is the biggest."
    - When `!ready`: "Import a full month of statements to see this."
    - Plus an `Explain` listing `P.lines`.
  - **Net worth:** `M.netWorth`, with the sub-line "{assets} owned − {debts} owed".
  - **Debt-free by:** hidden when there are no debts.
  - **Long-term goal:** the projected year and status.
  - The existing month KPIs stay below.
- **Spending:** each category row in "By category" gets a small "Need / Want" toggle, which writes `settings.needs[cat]`. `Loan EMI`, `Donations` and transfers show "Planned separately" with no toggle.

- [ ] **Step 1:** Implement, then `npm run typecheck`. Expected: PASS.
- [ ] **Step 2:** Dev server. The guilt-free amount equals income − the sum of the other lines, as shown in the `Explain` (check the arithmetic by hand once). Toggling Shopping to "Need" lowers the guilt-free amount by Shopping's 3-month average.
- [ ] **Step 3:** Commit: `feat: guilt-free hero, net worth on overview; needs/wants on spending`.

---

### Task 15: Sample data, final verification

**Files:** Modify `src/lib/sample.ts`, `README.md` (features list).

- Sample additions:
  - A "HDFC Credit Card" account (`kind 'card'`, INR) with 8–12 purchases per month and a bank-side `CREDIT CARD PAYMENT` the next month.
  - A revolving card debt of 68000 at 42%, minimum 3400.
  - A car-loan debt of 472000 at 9.5%, EMI 14200, with a matching bank `EMI` transaction each month.
  - Goals: "New phone" 150000 due in 12 months (should be good), "Umrah" 400000 due in 4 months (stretch), "Luxury car" 5000000 due in 13 months (bad).
  - `longTerm {type:'freedom', targetAge:50}` with `age '33'` (already set).
  - `assets {goldG:40, investments:200000}`, `goldPrice 7750`, `silverPrice 90`.
  - Gifts: 20000 and 2500.
  - `islamic` stays false by default.
- Add a sample test to `core.test.ts`: the `plan()` of `sampleData()` is `ready`, with verdicts `['good','stretch','bad']` in date order. If the generated numbers don't produce that, tune the sample amounts, not the rules.
- README features list: add Goals (long-term + verdicts), Debts, Giving, Currencies.

- [ ] **Step 1:** Write the sample test, implement, then `npm test`. Expected: PASS.
- [ ] **Step 2:** `npm run build`. Expected: success with no type errors. Then `npm run preview`, and in Chrome walk every tab at 375px and desktop width, in light and dark mode. Check:
  - No console errors.
  - With no foreign currency, there are no network requests to anything other than localhost (DevTools Network panel).
  - After adding a USD account, exactly one request goes to `cdn.jsdelivr.net`.
- [ ] **Step 3:** Commit: `feat: sample data shows every new screen`.
