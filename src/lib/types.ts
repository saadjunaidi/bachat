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

export interface Goal {
  id: string;
  name: string;
  target: number;
  date: string; // YYYY-MM
  link: boolean; // counts total bank balance
  saved: number;
  ret: number; // expected yearly return %
}

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
  mult: number;
  ret: number;
  infl: number;
}

export interface Data {
  accounts: Record<string, { name: string }>;
  txns: Txn[];
  rules: Record<string, string>; // payee (lowercase) -> category
  overrides: Record<string, string>; // txn id -> category
  goals: Goal[];
  mappings: Record<string, { map: ColumnMap; acct: string }>; // header signature -> mapping
  settings: Settings;
  sample: boolean;
  lastBackup?: string;
}

export const DEFAULT_SETTINGS: Settings = { selfName: '', age: '', mult: 30, ret: 12, infl: 6 };

export function blank(): Data {
  return { accounts: {}, txns: [], rules: {}, overrides: {}, goals: [], mappings: {}, settings: { ...DEFAULT_SETTINGS }, sample: false };
}
