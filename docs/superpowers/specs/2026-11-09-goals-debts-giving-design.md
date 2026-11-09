# Bachat: goals, debts, giving and the guilt-free amount

Date: 2026-11-09 · Status: draft for approval

## Why

Bachat is for anyone who wants to understand their money. Inflation keeps rising, and many people have no clear picture of where they stand, what they can afford, or how long their debt will hang over them. Today the app shows money in and out and simple goals. This round turns it into a full picture: what you own, what you owe, what you're working towards, what you give, and **how much you can spend on yourself each month without guilt**.

Halal and ethical investment advice will come later. This round must leave room for it but not build it.

## Success and failure

The owner named two failures, and they are the main acceptance criteria:

1. **The numbers are confusing.** Every headline figure needs a short "how we worked this out" explanation that uses the user's own numbers (for example: "₹1,00,000 income − ₹52,000 needs − ₹17,600 debt payments − … = ₹18,500").
2. **A calculation is wrong.** Every calculation lives in pure functions in `src/lib/` and has unit tests with worked examples checked by hand.

## Goals (this round)

1. **Currency setting.** The user picks one currency. Every amount uses it.
2. **One long-term goal.** The user chooses *financial freedom* or *retirement at age N*.
3. **Short-term goals.** Any number of them, such as a car, a phone, or a trip. Each gets an affordability verdict: **good deal / stretch / bad deal**.
4. **Credit cards and loans.** The user can add them by hand or import their statements. They feed into net worth, the goal verdicts, and a debt payoff plan.
5. **Debt payoff plan.** The default is highest interest first. The user can switch to smallest balance first and add an extra monthly amount.
6. **Zakat calculator.**
7. **Sadaqah and charity log.** It shows contribution to society for everyone, and spiritual reward when Islamic guidance is on.
8. **Guilt-free amount.** A monthly number that stands on its own and is shown prominently on Overview.
9. **Six tabs:** Overview · Spending · Goals · Debts · Giving · Statements.

## Non-goals

- Investment advice of any kind, halal or otherwise. That comes later.
- Live prices or exchange rates. The app makes **no network requests**, and the CSP and README promise that. Gold and silver prices are entered by the user.
- More than one currency at a time, or currency conversion.
- Bank or card syncing, accounts, servers. Everything stays in the browser, as today.
- Rulings on whether a particular loan or investment is permissible.

## Anti-goals (a failure even if the feature works)

- A figure the user can't trace back to their own inputs.
- Counting the same money twice. Examples: a card purchase plus the bank payment of that card bill, or a loan EMI counted as both spending and a debt payment.
- Making non-Muslim users wade through religious content. With Islamic guidance off, zakat and the spiritual-reward framing are hidden completely.
- Moralising about the guilt-free amount. It belongs to the user.
- Breaking existing users' data. Old saved data and old backup codes must load.

## Constraints

- Existing stack: React 19 + TypeScript (strict), Vite, Chart.js, Vitest. **No new runtime dependencies.**
- State is a single `Data` object in `localStorage` (`bachat.v1`) through `store.tsx`. Backup codes (`backup.ts`) must include every new field, and restoring an old code must still work.
- Every colour comes from the existing CSS theme variables, so it works in **light and dark mode**. No hard-coded backgrounds. This was caught in a mockup.
- The layout must work on a phone. With six tabs the bottom bar gets tight, so labels may need to shrink or the icons show alone on narrow screens.
- The existing pure-logic and UI split stays the same: maths in `src/lib/*`, screens in `src/views/*`.

## Decided with the owner

- **Navigation:** six tabs, each feature with its own tab (mockup option A).
- **Goals screen:** long-term goal card at the top, short-term goal cards below with a coloured verdict and a one-line reason, and a "where your monthly money goes" breakdown at the bottom (mockup approved).
- **Debts screen:** totals (owed, interest per month, debt-free date), a list of debts, and a "fastest way out" panel with the strategy choice, an extra-per-month slider, the payoff order with dates, interest saved, and how much sooner the long-term goal is reached (mockup approved).
- **Giving screen:** the Islamic guidance switch, the zakat calculator, and the sadaqah log with "your impact on society" and "spiritual reward" (mockup approved, then fixed for dark mode).
- **Good deal** = affordable by the chosen date without delaying any other goal and without taking on debt. **Bad deal** = clearly out of reach, as in the owner's example of a ₹50 lakh car on ₹1 lakh/month income.
- **Debt strategy:** the user chooses, and the default is highest interest first.
- **Sadaqah value:** contribution to society for everyone; spiritual reward added for Muslims (when Islamic guidance is on).
- **Guilt-free amount:** a standalone number for the user. It isn't tied to giving.
- **One currency per user**, chosen in settings.

## How it works

### Currency

- `settings.currency`: an ISO code, default `INR` (so existing users see no change).
- `format.ts`: `money()` and `short()` take the currency from one module-level setter, called whenever settings change, so no call site needs updating.
  - INR, PKR, BDT, NPR and LKR keep lakh/crore grouping and the `L` / `Cr` short forms.
  - Every other currency uses the usual `K` / `M` / `B` and its locale's grouping.
- Replace the 14 hard-coded `₹` / "rupees" / "India" strings in the UI with currency-aware text (for example "30× (safer when inflation is high)").
- `parse.ts` `num()`: strip any currency symbol or code, not only ₹ / Rs / INR.

### Accounts, cards and loans

- `Data.accounts[name]` gets `kind: 'bank' | 'card' | 'loan'` (missing = `bank`).
- New `Data.debts: Debt[]`:
  ```ts
  interface Debt {
    id: string; name: string; kind: 'card' | 'loan';
    acct?: string;          // linked imported account, if any
    balance: number;        // amount owed today (positive)
    asOf: string;           // YYYY-MM-DD the balance is from
    apr: number;            // yearly interest %
    minPay: number;         // card: minimum payment; loan: EMI
    minPct?: number;        // card only: minimum as % of balance (default 5)
  }
  ```
  When a debt is linked to an imported account and that account has a balance column, the latest statement balance replaces `balance` and `asOf`.
- **Import:** the Statements import flow asks "What is this statement?", with the choices bank account, credit card, or loan. Choosing card or loan creates (or links) a `Debt` and asks for the APR and minimum payment or EMI if they're not known yet.
- **No double counting:**
  - **Card statements:** purchases are spending, categorised exactly like bank spending. Payments into the card are `Credit card bill` (transfer). The bank-side payment is already categorised as `Credit card bill` (transfer) today, so each purchase is counted once, as spending, on the card.
  - **Loan statements:** every row is a transfer. They only update the outstanding balance. The bank-side EMI keeps its `Loan EMI` category for the spending view, but the money plan below treats it as a debt payment, not a need.

### Net worth

Net worth = bank balances + other assets the user entered for zakat (gold, silver, investments, money owed to them) − total debt balances. It's shown on Overview with its breakdown.

### Monthly money plan (the waterfall)

This is one pure function, `plan(data, model)`, used by Overview, Goals and Debts so the same numbers appear everywhere. It's based on the **3-month average** the app already uses (`M.a3`).

```
Income (3-month avg)
− Needs              spending in categories marked as needs (3-month avg)
− Debt payments      sum of minimum payments / EMIs (+ chosen extra)
− Giving             zakat due ÷ 12 (if Islamic guidance on) + planned monthly sadaqah
− Long-term goal     monthly amount reserved for it
− Short-term goals   monthly amount for each good/stretch goal, in date order
= Guilt-free amount  (never shown below 0)
```

- **Needs vs. wants:** each expense category has a default flag that the user can change on the Spending screen.
  - Needs: rent & housing, groceries, bills & utilities, mobile & internet, transport, fuel & vehicle, health, insurance, education, family support, fees & charges, taxes.
  - Everything else is a want, and wants are what the guilt-free amount replaces.
  - `Loan EMI`, `Donations` and transfers are left out of needs because they appear on their own lines.
- If the result is below 0, show 0 plus the shortfall and the biggest line causing it ("Your goals need ₹8,000 more than you have each month. The Luxury car goal is the biggest.").
- If there are fewer than 1 full month of statements, show "Import a full month of statements to see this."

### Long-term goal

- `settings.longTerm = { type: 'freedom' | 'retirement', age?: number, retireAge?: number, mult: 25|30|33, ret: number, infl: number, retirePct: number }`. It reuses the existing `mult`, `ret` and `infl` settings, and their current values carry over when old data loads.
- **Target**, in today's money:
  - Freedom: yearly spending × multiple.
  - Retirement: yearly spending × `retirePct` (default 80%) × multiple.
- **Already have** = bank balances + investments entered for zakat, in today's money.
- **Monthly reserve:**
  - Retirement: `needed(target, have, monthsUntil(retireAge), realReturn)`.
  - Freedom with a target age: the same calculation.
  - Freedom with no target age: the user's current 3-month average saving, and the projection shows the year reached (existing behaviour).
- **Real return** = (1 + return) / (1 + inflation) − 1, as today. All figures are in today's money, and the explanation says so.

### Short-term goal verdict

- Each goal: `{ id, name, price, date (YYYY-MM), saved, ret }`. Existing `Goal`s are converted: `target` becomes `price`. `link: true` goals become `saved = 0`, and a one-time note explains that the bank balance is now counted toward the long-term goal.
- **Inflation-adjusted price:** price × (1 + inflation)^(years until date).
- **Available for short-term goals** = what's left after needs, debt payments, giving and the long-term reserve. It's shared among goals in date order: the earliest goal gets first claim on it.

| Verdict | Rule |
|---|---|
| **Good deal** | The monthly amount needed by the chosen date fits in what's still available, and no debt is needed. |
| **Stretch** | It doesn't fit by the chosen date, but either (a) it fits if pushed back no more than 24 months, or (b) it fits on time if the long-term reserve is cut, delaying the long-term goal by no more than 24 months. Show both choices with dates ("Buy in Mar → freedom slips 4 months, or wait until Aug 2027 → nothing slips"). |
| **Bad deal** | Neither choice works within 24 months, **or** the price is ≥ 24 months of average income. Show the earliest date it becomes a good deal (if within 50 years) and the multiple of monthly income. |

- A goal that would need borrowing is never better than **stretch**. With these rules there is no borrowing path, so that is automatic. The explanation still mentions a loan when the gap is large.
- The 24-month thresholds are constants in `finance.ts` with a comment. They aren't user settings.

### Debt payoff

- `payoff(debts, strategy, extra)` is a month-by-month simulation that stops after 50 years. Each month:
  1. Add interest (APR/12) to each balance.
  2. Pay every debt its minimum. For cards, the minimum is the larger of `minPay` and `minPct`% of the balance. A loan's payment is its EMI.
  3. Put `extra` plus any freed-up minimums from paid-off debts toward the target debt: highest APR first (avalanche), or smallest balance first (snowball). Ties go to the other rule.
- **Outputs:**
  - The payoff month for each debt, in order.
  - The debt-free month.
  - Total interest.
  - Interest saved and months saved compared with paying minimums only (`extra = 0`).
- **Effect on the long-term goal:** once debt-free, the total monthly debt payment moves to the long-term reserve. The goal date is shown with and without the chosen extra, which gives "freedom moves 11 months earlier".
- **Warnings:**
  - When a card's minimum doesn't cover its monthly interest, warn: "This card will never be paid off at the minimum."
  - When debt APR is above the long-term expected return, say so plainly ("Paying off this card earns you a guaranteed 42%. No investment reliably beats that.").

### Zakat (shown only when Islamic guidance is on)

- **Inputs:**
  - Cash and bank: filled in from statement balances; the user can change it.
  - Gold grams and silver grams, with a price per gram the user enters.
  - Investments, business stock, money owed to the user.
  - Deductions: debts due in the next 12 months, i.e. card balances + 12 × each loan EMI, capped at the loan balance. The user can change this.
- **Nisab:** 87.48 g gold or 612.36 g silver × the price the user entered. The basis is a setting, **default silver**.
- **Zakat** = 2.5% × zakatable wealth if wealth ≥ nisab, otherwise 0 with "below nisab".
- **Zakat date:** the user sets the date. The next due date is shown, a lunar year (354 days) later. Payments are logged against the current year's zakat.

### Sadaqah and charity

- `Data.gifts: { id, date, amount, kind: 'sadaqah' | 'zakat' | 'charity', cause?: string }[]`. Transactions in the `Donations` category also appear in the list (read-only, marked "from your statements") so nothing is entered twice.
- An optional **monthly giving plan** feeds the waterfall.
- **Contribution to society** (always shown):
  - Total given this year and all time.
  - % of income given.
  - "What it adds up to" in everyday terms, such as meals or a child's school year. Each comes from a cost the user can change. Defaults are set for INR and PKR. Other currencies start with the impact line hidden until the user enters costs.
- **Spiritual reward** (Islamic guidance on): Quran 2:261 (a grain that grows seven ears, a hundred grains in each, "multiplied up to 700×") and the hadith "charity does not decrease wealth". This is a reflection, not a number made out of money.

### Overview additions

A new top row:
- **Guilt-free this month**: the hero card, with an explanation that opens to show the waterfall.
- **Net worth**.
- **Debt-free by**: hidden when there's no debt.
- **Long-term goal year**.

The rest of Overview is unchanged.

### Sample data

`sample.ts` gains one credit card, one car loan, two short-term goals (one good deal, one bad deal), a long-term goal, and a few gifts, so a first-time visitor sees every screen filled in.

### Persistence and backup

- `loadData()` fills in defaults for every new field and converts old goals (see above). The storage key is unchanged.
- `makeBackup` includes `debts`, `gifts`, and the new settings. The backup version becomes `v: 2`, and `readBackup` accepts v1 and v2.
- Merge (`backup.ts`) merges debts and gifts by `id`.

### Tests (required: these back up the "calculations are wrong" criterion)

Each case below has a hand-checked worked example in `src/lib/__tests__/`:
- `money` / `short` for INR (lakh/crore), PKR, USD, EUR.
- `num()` with `$`, `€`, `Rs`, `PKR`.
- The waterfall:
  - A normal month.
  - A shortfall that is floored at 0.
  - No full month of data.
- Long-term target and reserve for freedom and for retirement.
- Verdicts:
  - Good deal, stretch by waiting, stretch by delaying the long-term goal.
  - Bad deal by threshold.
  - The owner's example: income 1,00,000, price 50,00,000 → **bad**, about 50× income.
- Payoff:
  - Avalanche vs. snowball order.
  - Interest saved.
  - A card whose minimum doesn't cover the interest.
  - A loan finishing on time at its EMI.
- Zakat: above and below nisab on each basis, and deductions.
- Card import: a card purchase and its bank payment produce spending counted once.
- Loading old data and v1 backup codes.

## Left to the builder

- The visual details inside the approved layouts, using the existing components (`Kpi`, `Panel`, pills, `prog`).
- Icons for the Debts and Giving tabs.
- How to fit six tabs on a narrow phone bottom bar.
- The exact wording of explanations, as long as each one shows the user's own numbers.
- Where the Islamic guidance switch and currency picker live (a small settings panel reachable from the header is fine).

## Resolutions from the builder check

These override anything above that conflicts with them.

1. **Cards paid in full.**
   - `Debt` gets `revolving: boolean`. When a card is added or imported, the user is asked "Do you clear this card in full every month?" (default: yes → `revolving: false`).
   - A paid-in-full card: its current balance is still subtracted in net worth (it's owed). It is **not** on the waterfall's debt line and **not** in the payoff plan, because its purchases are already counted as spending.
   - A revolving card: its minimum is on the debt line and it is in the payoff plan.
2. **Long-term reserve (owner decided):**
   - Both financial freedom and retirement **require a target age**. The app suggests one and the user can change it.
     - Freedom suggestion: 50, or current age + 15 if that is later.
     - Retirement suggestion: 60, or current age + 10 if that is later.
     - If no current age is entered, ask for it on the long-term card before showing a reserve.
   - The monthly reserve is always `needed(target, have, monthsUntil(targetAge), realReturn)`.
   - The "freedom with no target age" path in the long-term goal section is removed.
   - Saving above the reserve is left for short-term goals and the guilt-free amount.
3. **Stretch goals:**
   - The goal card offers both options. The user's choice is saved per goal as `stretchChoice: 'wait' | 'onTime'`, default `'wait'`.
   - With **wait**, the goal's effective date becomes the pushed-back date. The pushed-back date is also its place in the date order.
   - With **on time**, the cut is taken out of the long-term reserve, and the long-term projected date moves later accordingly.
4. **Long-term date:**
   - The current age stays `settings.age`. The target age is a new `longTerm.targetAge`.
   - The reserve is what's *needed* to hit the target.
   - The **projected** date is calculated from what is *actually* put aside after stretch "on time" cuts, plus debt payments freed once each debt is paid off. That projected date is what moves ("11 months earlier", "slips 4 months"), and it is what Overview shows, with "on track / ahead / behind" against the target.
5. **Other assets for everyone:**
   - A new **"Other things you own"** panel on the Statements tab: gold (g), silver (g), investments, money owed to you, business stock, and other.
   - It is stored as `Data.assets`. Zakat reads from it, so the values are entered once.
   - Net worth and the long-term "already have" use it whether or not Islamic guidance is on.
6. **Yearly spending for the target** = 12 × the 3-month average of all spending, **excluding `Loan EMI`**, because EMIs end. Card purchases and donations are included, because both continue in later life.
7. **Goal savings aren't counted twice:** the long-term "already have" = bank balances + investments − the sum of short-term goals' `saved`. It never goes below 0.
8. **EMIs with no loan added:**
   - If `Loan EMI` spending exists but no loan `Debt` exists, the debt line uses the observed 3-month EMI average, labelled "Loan payments (add this loan to plan its payoff)".
   - Card and loan accounts are left out of the `model.ts` "data is current up to" check, so a loan statement that is rarely updated doesn't empty the 3-month average.

## Addendum: accounts in more than one currency (added after approval)

**Why:** some users hold accounts in several currencies, for example a PKR salary account plus a USD or AED account. They want to import all of them and see everything in one currency of their choice.

**This replaces two earlier statements:** the non-goals "More than one currency at a time, or currency conversion" and "no live prices or exchange rates". The owner chose **live rates fetched automatically**. Gold and silver prices are still entered by the user.

### Decided with the owner
- Any account (bank, card, loan) can be in its own currency, and its statements can be imported.
- The user picks one **view currency**, and every total, chart, goal, the guilt-free amount and zakat appear in it.
- Exchange rates are **fetched live**. That is the only network request the app makes.

### How it works
- **Data:**
  - `settings.currency` becomes the **view currency**.
  - `Data.accounts[name].currency` is added; when missing, it is the view currency at the time of migration.
  - Each transaction keeps its original amount in its account's currency. Conversion happens only in `model.ts` and `plan()`, so stored data never changes when rates or the view currency change.
- **Import:** the Statements flow adds "Currency of this account" (default: the view currency). The choice is remembered with the account's saved column mapping.
- **Rates source:** the free, keyless `@fawazahmed0/currency-api`, served from `cdn.jsdelivr.net` with a `currency-api.pages.dev` fallback.
  - It covers PKR, INR, AED, SAR, USD, GBP, EUR and about 200 more currencies.
  - It has dated snapshots (`@YYYY-MM-DD`), which the historical conversion below needs.
  - The request contains **only currency codes and dates**. No amounts, names or account details are ever sent.
- **What converts at which rate:**
  - Transactions and monthly totals use the rate for their own month (the first of the month), so past months don't change when today's rate moves.
  - Balances, debts, net worth, goals, zakat and the guilt-free amount use today's rate.
- **Caching and offline:**
  - Rates are kept in `localStorage` (`bachat.rates`), keyed by date and base currency.
  - Today's rate is fetched at most once every 12 hours, and only when there is a second currency.
  - Offline, the last saved rate is used, marked with "Rates from 3 Nov".
  - A rate the user has typed in replaces the fetched one for that currency pair, so the app still works if the source disappears.
- **Showing the original amount:**
  - Converted figures show a small marker, with "original amount and rate used" on hover or tap.
  - Transaction rows show the original amount, with the converted amount beneath it.
  - Every explanation lists the rates it used.
- **Goals and debts:** each one stores its own currency, the view currency at creation by default. Changing the view currency converts what's displayed, not what's stored.
- **Security headers:** add `https://cdn.jsdelivr.net https://*.currency-api.pages.dev` to `connect-src` in both `nginx.conf` and `firebase.json`.
- **README and privacy wording:**
  - Replace "makes no requests to any other site" with "the only request it makes is for exchange rates, and that request carries no personal data".
  - Rates are fetched only when an account in a second currency exists, so single-currency users still make zero requests.
- **Tests:**
  - Conversion of totals across mixed-currency accounts.
  - Historical vs today's rate.
  - A cache hit with no fetch.
  - Offline fallback to the last saved rate.
  - A typed-in rate taking priority.
  - Changing the view currency without changing stored data.
  - `fetch` is mocked, so tests make no network calls.

### Calls made by Claude for this addendum
- The rates source, and the rule that single-currency users make no requests.
- Historical monthly rates for transactions, today's rate for balances and goals.
- A 12-hour refresh, the offline fallback, and typed-in rates that override fetched ones.

## Calls made by Claude (not discussed with the owner)

- Default currency INR, so existing users see no change. Lakh/crore style for South Asian currencies.
- Needs/wants category defaults, editable by the user.
- Waterfall order and the 3-month average basis.
- Old goals that counted the bank balance become short-term goals with `saved = 0`, because the bank balance now counts toward the long-term goal.
- Verdict thresholds: 24 months of delay, and 24 months of income.
- Card minimum default of 5% of the balance.
- Zakat nisab default **silver** (the more cautious view; it's a setting). Debts due within 12 months are deducted.
- Impact-on-society defaults only for INR and PKR.
- The spiritual-reward framing quotes scripture rather than putting a money figure on reward.
