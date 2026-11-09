import type { ColumnMap, Data } from './types';
import { iso } from './format';

export type Cell = string | number | Date | null | undefined | boolean;

export interface Parsed {
  headers: string[];
  body: Cell[][];
  map: ColumnMap;
  sig: string;
  known: string | null;
  acct: string;
}

export interface Row { date: string; desc: string; amt: number; bal: number | null }

const MON: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };

function mk(y: number, m: number, d: number): Date | null {
  if (y < 1990 || y > 2100 || m < 0 || m > 11 || d < 1 || d > 31) return null;
  const x = new Date(y, m, d);
  return x.getMonth() === m ? x : null;
}

/** Indian bank dates are day-first: 05/10/2026, 05-10-26, 05 Oct 2026, 2026-10-05, or Excel date cells. */
export function pdate(v: Cell): Date | null {
  if (v instanceof Date && !isNaN(v.getTime())) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 864e5));
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const s = String(v ?? '').trim();
  if (!s) return null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return mk(+m[1], +m[2] - 1, +m[3]);
  if ((m = s.match(/^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{2,4})\b/))) { let y = +m[3]; if (y < 100) y += 2000; return mk(y, +m[2] - 1, +m[1]); }
  if ((m = s.match(/^(\d{1,2})[\s\-/]*([A-Za-z]{3,4})[A-Za-z]*[\s\-/,]*(\d{2,4})\b/))) {
    let y = +m[3]; if (y < 100) y += 2000;
    const mo = MON[m[2].toLowerCase()];
    if (mo != null) return mk(y, mo, +m[1]);
  }
  return null;
}

/** "1,85,000.00", "₹ 649", "$1,234.50", "PKR 1,000", "(1,200)", "2,340.50 Dr" -> number */
export function num(v: Cell): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).trim();
  s = s.replace(/\s*(cr|dr)\.?$/i, '').replace(/[A-Za-z$€£¥₹৳₨﷼]+\.?/g, '').replace(/[,\s]/g, '');
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s);
  s = s.replace(/[()\-+]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : neg ? -n : n;
}

/** CSV / TSV (pasted from a spreadsheet) / semicolon-separated text into rows. */
export function parseText(text: string): string[][] {
  text = text.replace(/\r\n?/g, '\n');
  const first = text.split('\n')[0];
  const delim = text.includes('\t') ? '\t' : first.split(';').length > first.split(',').length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"' && cur === '') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}

const HK = [/date/i, /narration|description|particulars|remarks|details/i, /withdraw|debit/i, /deposit|credit/i, /amount/i, /balance/i, /dr\s*\/?\s*cr|cr\s*\/?\s*dr/i];
const headerScore = (r: Cell[]) => HK.reduce((s, re) => s + (r.some((c) => typeof c === 'string' && c.length < 45 && re.test(c)) ? 1 : 0), 0);

export function guessMap(h: string[]): ColumnMap {
  const find = (re: RegExp, not?: RegExp) => h.findIndex((x) => re.test(x) && !(not && not.test(x)));
  let date = find(/^(txn|tran|transaction)\.?\s*date/i);
  if (date < 0) date = find(/date/i, /value/i);
  if (date < 0) date = find(/date/i);
  const desc = find(/narration|description|particulars|remarks|details/i);
  const debit = find(/withdraw|debit/i);
  const credit = find(/deposit|credit/i);
  const amount = find(/amount/i, /withdraw|deposit|debit|credit/i);
  const drcr = h.findIndex((x, i) => /^(dr\s*\/\s*cr|cr\s*\/\s*dr|type|cr\/dr|dr\/cr)$/i.test(x.trim()) && (amount < 0 || i > amount));
  const balance = find(/balance/i);
  const mode = debit >= 0 && credit >= 0 ? 'split' : amount >= 0 && drcr >= 0 ? 'drcr' : 'signed';
  return { date, desc, debit, credit, amount, drcr, balance, mode };
}

/** Finds the header row (banks put logos, addresses and account details above it) and guesses the columns. */
export function analyse(rows: Cell[][], mappings: Data['mappings']): Parsed | { error: string } {
  rows = rows.map((r) => (r || []).map((c) => (c == null ? '' : c)));
  let best = -1, bs = 0;
  for (let i = 0; i < Math.min(rows.length, 40); i++) { const sc = headerScore(rows[i]); if (sc > bs) { bs = sc; best = i; } }
  if (bs < 2) return { error: "We couldn't find the column headings. Make sure the file includes the header row (Date, Description, Withdrawal, Deposit…)." };
  const width = Math.max(...rows.slice(best, best + 50).map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => String(rows[best][i] ?? '').trim() || 'Column ' + (i + 1));
  const body = rows.slice(best + 1).filter((r) => r.some((c) => String(c).trim() !== ''));
  const sig = headers.join('|').toLowerCase();
  const saved = mappings[sig];
  return { headers, body, map: saved ? { ...saved.map } : guessMap(headers), sig, known: saved ? saved.acct : null, acct: saved ? saved.acct : '' };
}

export function extract(p: { headers: string[]; body: Cell[][] }, m: ColumnMap): { rows: Row[]; skipped: number } {
  const out: (Row & { k: number })[] = [];
  let skipped = 0;
  p.body.forEach((r) => {
    const d = m.date >= 0 ? pdate(r[m.date]) : null;
    const desc = String(m.desc >= 0 ? r[m.desc] ?? '' : '').replace(/\s+/g, ' ').trim();
    let amt = 0;
    if (m.mode === 'split') amt = Math.abs(num(r[m.credit])) - Math.abs(num(r[m.debit]));
    else if (m.mode === 'drcr') {
      const a = Math.abs(num(r[m.amount]));
      const t = String(r[m.drcr] ?? '').trim().toUpperCase();
      amt = t[0] === 'C' ? a : t[0] === 'D' ? -a : 0;
    } else amt = num(r[m.amount]);
    if (!d || !desc || !amt) { skipped++; return; }
    let bal: number | null = null;
    if (m.balance >= 0 && String(r[m.balance] ?? '').trim() !== '') {
      const raw = r[m.balance];
      bal = num(raw);
      const nx = p.headers[m.balance + 1];
      if (/dr\.?\s*$/i.test(String(raw)) || (nx && /dr\s*\/?\s*cr/i.test(nx) && /^d/i.test(String(r[m.balance + 1] ?? '').trim()))) bal = -Math.abs(bal);
    }
    out.push({ date: iso(d), desc, amt: Math.round(amt * 100) / 100, bal, k: 0 });
  });
  // Some banks list newest first. Put oldest first, keeping the bank's order within a day so the last row holds the closing balance.
  if (out.length > 1 && out[0].date > out[out.length - 1].date) out.reverse();
  out.forEach((r, k) => (r.k = k));
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.k - b.k));
  return { rows: out.map(({ k: _k, ...r }) => r), skipped };
}

export const isSpreadsheet = (name: string) => /\.(xlsx?|xlsm)$/i.test(name);

/** Reads a statement file. The Excel reader is loaded only when an Excel file is chosen. */
export async function readFileRows(file: File): Promise<Cell[][]> {
  if (isSpreadsheet(file.name)) {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true });
    let rows: Cell[][] = [];
    for (const sn of wb.SheetNames) {
      const rr = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[sn], { header: 1, raw: true, defval: '' });
      if (rr.length > rows.length) rows = rr;
    }
    return rows;
  }
  return parseText(await file.text());
}

export function guessAcct(name: string) {
  const n = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\b(statement|acct?|account|xls|export|\d{4,})\b/gi, '').replace(/\s+/g, ' ').trim();
  return n.length >= 3 && n.length <= 30 ? n : 'My bank account';
}
