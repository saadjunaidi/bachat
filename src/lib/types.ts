export type CatType = 'income' | 'expense' | 'investment' | 'transfer';

export interface Txn {
  id: string;
  acct: string;
  date: string; // YYYY-MM-DD
  desc: string;
  amt: number; // + money in, − money out
  bal: number | null;
  seq: number;
}

export type AcctKind = 'bank' | 'card' | 'loan';
export interface AccountInfo { name: string; kind?: AcctKind; currency?: string }
export const kindOf = (acc: AccountInfo | undefined): AcctKind => acc?.kind ?? 'bank';

export interface Debt { id: string; name: string; kind: 'card' | 'loan'; acct?: string; currency: string; balance: number; asOf: string; apr: number; minPay: number; minPct?: number; revolving: boolean }
export interface ShortGoal { id: string; name: string; price: number; currency: string; date: string /* YYYY-MM */; saved: number; ret: number; stretchChoice: 'wait' | 'onTime' }
export interface Gift { id: string; date: string; amount: number; currency: string; kind: 'sadaqah' | 'zakat' | 'charity'; cause?: string }
export interface Assets { currency: string; goldG: number; silverG: number; investments: number; owed: number; stock: number; other: number }
export interface LongTerm { type: 'freedom' | 'retirement'; targetAge: number | null; mult: 25 | 30 | 33; ret: number; infl: number; retirePct: number }

export type Mode = 'split' | 'drcr' | 'signed';

export interface ColumnMap {
  date: number;
  desc: number;
  debit: number;
  credit: number;
  amount: number;
  drcr: number;
  balance: number;
  mode: Mode;
}

export interface Settings {
  selfName: string;
  age: string;
  currency: string;
  longTerm: LongTerm;
  islamic: boolean;
  nisab: 'silver' | 'gold';
  goldPrice: number; // per gram, view currency
  silverPrice: number;
  zakatDate: string | null;
  givingPlan: number;
  impact: { meal: number; school: number } | null;
  strategy: 'avalanche' | 'snowball';
  extra: number;
  needs: Record<string, boolean>; // user overrides of the default needs set
  fxOverrides: Record<string, number>; // "USD" -> units of view currency per 1 USD
}

export interface Data {
  accounts: Record<string, AccountInfo>;
  txns: Txn[];
  rules: Record<string, string>; // payee (lowercase) -> category
  overrides: Record<string, string>; // txn id -> category
  goals: ShortGoal[];
  debts: Debt[];
  gifts: Gift[];
  assets: Assets;
  mappings: Record<string, { map: ColumnMap; acct: string }>; // header signature -> mapping
  settings: Settings;
  sample: boolean;
  lastBackup?: string;
  notice?: string;
}

const impactFor = (cur: string) => (cur === 'INR' ? { meal: 60, school: 25000 } : cur === 'PKR' ? { meal: 200, school: 60000 } : null);

export function defaultSettings(currency = 'INR', legacy: { mult?: number; ret?: number; infl?: number } = {}): Settings {
  return {
    selfName: '', age: '', currency,
    longTerm: { type: 'freedom', targetAge: null, mult: (legacy.mult ?? 30) as LongTerm['mult'], ret: legacy.ret ?? 12, infl: legacy.infl ?? 6, retirePct: 80 },
    islamic: false, nisab: 'silver', goldPrice: 0, silverPrice: 0, zakatDate: null, givingPlan: 0,
    impact: impactFor(currency), strategy: 'avalanche', extra: 0, needs: {}, fxOverrides: {}
  };
}

export const DEFAULT_SETTINGS: Settings = defaultSettings();

const blankAssets = (currency: string): Assets => ({ currency, goldG: 0, silverG: 0, investments: 0, owed: 0, stock: 0, other: 0 });

export function blank(): Data {
  return { accounts: {}, txns: [], rules: {}, overrides: {}, goals: [], debts: [], gifts: [], assets: blankAssets('INR'), mappings: {}, settings: defaultSettings(), sample: false };
}

/** Bring any stored or restored shape (v1 or current) up to the current Data shape. Idempotent. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrate(raw: any): Data {
  const r = raw && typeof raw === 'object' ? raw : {};
  const rs = r.settings && typeof r.settings === 'object' ? r.settings : {};
  const { mult, ret, infl, ...rest } = rs;
  const currency: string = rest.currency || 'INR';
  const base = defaultSettings(currency, { mult, ret, infl });
  const settings: Settings = { ...base, ...rest, currency, longTerm: { ...base.longTerm, ...(rest.longTerm || {}) } };
  if (!('impact' in rest)) settings.impact = impactFor(currency);

  let linked = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const goals: ShortGoal[] = (Array.isArray(r.goals) ? r.goals : []).map((g: any) => {
    if (g && 'price' in g) return { stretchChoice: 'wait', currency, ...g };
    if (g?.link) linked = true;
    const { target, link, ...keep } = g || {};
    return { ...keep, price: target ?? 0, saved: link ? 0 : g?.saved ?? 0, currency, stretchChoice: 'wait' };
  });

  const accounts: Record<string, AccountInfo> = {};
  for (const [k, a] of Object.entries((r.accounts || {}) as Record<string, AccountInfo>)) accounts[k] = { ...a, currency: a?.currency || currency };
  const stamp = <T extends { currency?: string }>(x: T): T => (x && !x.currency ? { ...x, currency } : x);

  const d: Data = {
    ...blank(),
    ...r,
    goals,
    debts: Array.isArray(r.debts) ? r.debts.map(stamp) : [],
    gifts: Array.isArray(r.gifts) ? r.gifts.map(stamp) : [],
    assets: { ...blankAssets(currency), ...(r.assets || {}) },
    accounts,
    settings
  };
  if (linked) d.notice = 'goalsMigrated';
  return d;
}
