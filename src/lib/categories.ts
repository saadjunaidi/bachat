import type { CatType, Data, Settings, Txn } from './types';

export const CATS: [string, CatType][] = [
  ['Salary', 'income'], ['Business income', 'income'], ['Interest & dividends', 'income'], ['Refunds & cashback', 'income'], ['Other income', 'income'],
  ['Rent & housing', 'expense'], ['Loan EMI', 'expense'], ['Groceries', 'expense'], ['Food delivery', 'expense'], ['Dining out', 'expense'],
  ['Transport', 'expense'], ['Fuel & vehicle', 'expense'], ['Bills & utilities', 'expense'], ['Mobile & internet', 'expense'],
  ['Subscriptions & apps', 'expense'], ['Shopping', 'expense'], ['Health', 'expense'], ['Insurance', 'expense'], ['Education', 'expense'],
  ['Travel', 'expense'], ['Entertainment', 'expense'], ['Personal care', 'expense'], ['Home & services', 'expense'], ['Donations', 'expense'],
  ['Family support', 'expense'], ['Cash withdrawal', 'expense'], ['Fees & charges', 'expense'], ['Taxes', 'expense'],
  ['Other UPI payments', 'expense'], ['Uncategorized', 'expense'],
  ['Investments', 'investment'], ['Transfer between accounts', 'transfer'], ['Credit card bill', 'transfer']
];

export const CTYPE: Record<string, CatType> = Object.fromEntries(CATS);

const PAL = ['#2F8F6B', '#D49A2A', '#4C7CC4', '#C2564B', '#8A6BC1', '#3AA3A8', '#B0745A', '#7A9A3C', '#CC6F9A', '#5E7186', '#A48A3A', '#6B8E9E', '#9C5B8F', '#4F9E8A', '#C77C3B'];
export const CCOL: Record<string, string> = {};
CATS.forEach(([c], i) => { CCOL[c] = PAL[i % PAL.length]; });
CCOL['Uncategorized'] = '#8C9690';
CCOL['Other UPI payments'] = '#A3AFA8';

export const TYPE_LABEL: Record<CatType, string> = { income: 'Money in', expense: 'Spending', investment: 'Investing', transfer: 'Not counted' };

// Ordered: the first match wins, so specific keywords come before general ones.
const RAW_RULES: [string, string][] = [
  ['credit card', 'Credit card bill'], ['cc payment', 'Credit card bill'], ['cred club', 'Credit card bill'],
  ['ac xfr', 'Transfer between accounts'], ['self transfer', 'Transfer between accounts'], ['own account', 'Transfer between accounts'], ['sweep', 'Transfer between accounts'],
  ['refund', 'Refunds & cashback'], ['cashback', 'Refunds & cashback'], ['reversal', 'Refunds & cashback'],
  ['salary', 'Salary'], ['salar', 'Salary'], ['sal cr', 'Salary'], ['payroll', 'Salary'],
  ['freelance', 'Business income'], ['invoice', 'Business income'],
  ['int.pd', 'Interest & dividends'], ['interest', 'Interest & dividends'], ['dividend', 'Interest & dividends'], ['findiv', 'Interest & dividends'],
  ['sip', 'Investments'], ['mutual fund', 'Investments'], ['groww', 'Investments'], ['zerodha', 'Investments'], ['upstox', 'Investments'], ['kuvera', 'Investments'], ['indmoney', 'Investments'], ['nps', 'Investments'], ['ppf', 'Investments'],
  ['emi', 'Loan EMI'], ['loan', 'Loan EMI'],
  ['house rent', 'Rent & housing'], ['rent pay', 'Rent & housing'], ['nobroker', 'Rent & housing'], ['maintenance', 'Rent & housing'],
  ['swiggy ins', 'Groceries'], ['instamart', 'Groceries'], ['blinkit', 'Groceries'], ['zepto', 'Groceries'], ['bigbasket', 'Groceries'], ['dmart', 'Groceries'], ['jiomart', 'Groceries'], ['al karim', 'Groceries'], ['grocer', 'Groceries'], ['more retail', 'Groceries'],
  ['swiggy', 'Food delivery'], ['zomato', 'Food delivery'], ['eatsure', 'Food delivery'], ['noon food', 'Food delivery'],
  ['restaurant', 'Dining out'], ['cafe', 'Dining out'], ['starbucks', 'Dining out'], ['tim horton', 'Dining out'], ['haldiram', 'Dining out'], ['coffee', 'Dining out'],
  ['uber', 'Transport'], ['ola', 'Transport'], ['rapido', 'Transport'], ['metro', 'Transport'], ['fastag', 'Transport'],
  ['hpcl', 'Fuel & vehicle'], ['iocl', 'Fuel & vehicle'], ['bpcl', 'Fuel & vehicle'], ['petrol', 'Fuel & vehicle'], ['fuel', 'Fuel & vehicle'], ['tyre', 'Fuel & vehicle'], ['motors', 'Fuel & vehicle'],
  ['bses', 'Bills & utilities'], ['tata power', 'Bills & utilities'], ['electricity', 'Bills & utilities'], ['igl', 'Bills & utilities'], ['water bill', 'Bills & utilities'], ['gas bill', 'Bills & utilities'],
  ['airtel', 'Mobile & internet'], ['jio', 'Mobile & internet'], ['vodafone', 'Mobile & internet'], ['broadband', 'Mobile & internet'], ['fibernet', 'Mobile & internet'],
  ['netflix', 'Subscriptions & apps'], ['spotify', 'Subscriptions & apps'], ['hotstar', 'Subscriptions & apps'], ['youtube', 'Subscriptions & apps'], ['prime video', 'Subscriptions & apps'], ['apple', 'Subscriptions & apps'], ['google play', 'Subscriptions & apps'], ['google one', 'Subscriptions & apps'], ['anthropic', 'Subscriptions & apps'], ['claude', 'Subscriptions & apps'], ['openai', 'Subscriptions & apps'], ['playstation', 'Subscriptions & apps'], ['canva', 'Subscriptions & apps'],
  ['nykaa', 'Personal care'], ['tira', 'Personal care'], ['salon', 'Personal care'],
  ['amazon', 'Shopping'], ['flipkart', 'Shopping'], ['myntra', 'Shopping'], ['ajio', 'Shopping'], ['croma', 'Shopping'], ['ikea', 'Shopping'], ['decathlon', 'Shopping'], ['zara', 'Shopping'], ['inditex', 'Shopping'], ['massimo', 'Shopping'], ['uniqlo', 'Shopping'], ['levi', 'Shopping'], ['ralph lauren', 'Shopping'], ['h&m', 'Shopping'], ['westside', 'Shopping'], ['caratlane', 'Shopping'], ['skechers', 'Shopping'],
  ['apollo', 'Health'], ['pharm', 'Health'], ['1mg', 'Health'], ['hospital', 'Health'], ['clinic', 'Health'], ['medical', 'Health'], ['practo', 'Health'],
  ['lic', 'Insurance'], ['insurance', 'Insurance'], ['generali', 'Insurance'], ['policybazaar', 'Insurance'], ['premium', 'Insurance'],
  ['school', 'Education'], ['udemy', 'Education'], ['coursera', 'Education'], ['tuition', 'Education'],
  ['irctc', 'Travel'], ['indigo', 'Travel'], ['air india', 'Travel'], ['makemytrip', 'Travel'], ['goibibo', 'Travel'], ['oyo', 'Travel'], ['airbnb', 'Travel'], ['aed', 'Travel'], ['forex', 'Travel'],
  ['bookmyshow', 'Entertainment'], ['pvr', 'Entertainment'], ['inox', 'Entertainment'], ['steam', 'Entertainment'],
  ['urban company', 'Home & services'], ['laundry', 'Home & services'],
  ['gofndme', 'Donations'], ['gofundme', 'Donations'], ['sharethemea', 'Donations'], ['donation', 'Donations'], ['charity', 'Donations'], ['zakat', 'Donations'],
  ['atm', 'Cash withdrawal'], ['atw/', 'Cash withdrawal'], ['atl/', 'Cash withdrawal'], ['nwd', 'Cash withdrawal'], ['cash wdl', 'Cash withdrawal'],
  ['chrg', 'Fees & charges'], ['charges', 'Fees & charges'], ['program fee', 'Fees & charges'], ['annual fee', 'Fees & charges'], ['cardfee', 'Fees & charges'],
  ['income tax', 'Taxes'], ['advance tax', 'Taxes'], ['tds', 'Taxes']
];

// Short keywords must stand alone (so "ola" doesn't match "cola"); longer ones can appear anywhere.
const RULES: [RegExp, string][] = RAW_RULES.map(([k, c]) => {
  const e = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [k.length <= 4 ? new RegExp('(^|[^a-z])' + e + '([^a-z]|$)') : new RegExp(e), c];
});

const BAD_SEG = /^(upi|imps\d*|neft|rtgs|inft|inf|mmt|na|upi ?intent|sent using.*|sent from.*|pay via.*|payment.*|collect.*|you are pa.*|pay|recd:imps|ach d-?|ach|bil|bpay|pci|pcd|vin|vsi|pos)$/i;

function tidy(s: string) {
  s = s.replace(/[^A-Za-z&.' ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);
  return s.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

/** A readable payee name from a bank narration, e.g. "UPI/SWIGGY/xx@icici/..." -> "Swiggy". */
export function payee(desc: string): string {
  const d = desc.trim();
  if (/^(atl|atw|nwd|atm)\b/i.test(d) || /atm wdl|cash wdl/i.test(d)) return 'ATM cash';
  const segs = d.split('/').map((s) => s.trim());
  if (segs.length > 1) {
    for (let i = 1; i < segs.length; i++) {
      const s = segs[i];
      if (/[a-z]{3,}/i.test(s) && !BAD_SEG.test(s) && !/@/.test(s) && !/^[A-Z]{4}\d/.test(s)) {
        const t = tidy(s);
        if (t.length >= 3) return t;
      }
    }
  }
  const c = d
    .replace(/^(pos|ach d-?|ach|nach dr|neft cr-?|neft|bil|bpay|imps|rtgs)\s*/i, '')
    .replace(/\b\w*x{3,}\w*\b/gi, ' ')
    .replace(/\d{3,}/g, ' ');
  const t = tidy(c.split(/[/:]/)[0]);
  return t || d.slice(0, 24);
}

export function autoCat(desc: string, amt: number, selfName = ''): string {
  const l = desc.toLowerCase();
  const sn = selfName.trim().toLowerCase();
  if (sn.length > 2 && l.includes(sn)) return 'Transfer between accounts';
  for (const [re, c] of RULES) {
    if (re.test(l)) {
      if (amt > 0 && c === 'Loan EMI') return 'Other income';
      if (amt > 0 && c === 'Cash withdrawal') return 'Other income';
      return c; // a credit in an expense category is a refund and reduces that category's spend
    }
  }
  if (amt > 0) return 'Other income';
  if (/^upi/i.test(desc)) return 'Other UPI payments';
  return 'Uncategorized';
}

export function catOf(t: Txn, p: string, d: Data): string {
  return d.overrides[t.id] || d.rules[p.toLowerCase()] || autoCat(t.desc, t.amt, d.settings.selfName);
}

export const NEEDS_DEFAULT: Set<string> = new Set([
  'Rent & housing', 'Groceries', 'Bills & utilities', 'Mobile & internet', 'Transport', 'Fuel & vehicle',
  'Health', 'Insurance', 'Education', 'Family support', 'Fees & charges', 'Taxes'
]);

/** Loan EMI and Donations are planned separately, so are never needs. */
export function isNeed(cat: string, s: Settings): boolean {
  if (cat === 'Loan EMI' || cat === 'Donations') return false;
  return s.needs[cat] ?? NEEDS_DEFAULT.has(cat);
}
