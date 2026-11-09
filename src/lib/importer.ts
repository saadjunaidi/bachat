import { blank, type Data, type Txn } from './types';
import type { Row } from './parse';

/**
 * Adds statement rows to an account. A transaction already imported (same account, date, amount,
 * balance and description) is skipped, so overlapping statements can be imported safely.
 * Identical rows inside one file are kept apart by counting occurrences.
 */
export function commit(d: Data, acct: string, rows: Row[]): { data: Data; added: number; dup: number } {
  const base: Data = d.sample ? { ...blank(), settings: d.settings } : d;
  const have = new Set(base.txns.filter((t) => t.acct === acct).map((t) => t.id));
  const occ: Record<string, number> = {};
  const txns: Txn[] = base.txns.slice();
  let added = 0, dup = 0;
  const seqBase = Date.now();
  rows.forEach((r, i) => {
    const k = acct + '|' + r.date + '|' + r.amt + '|' + (r.bal == null ? '' : r.bal) + '|' + r.desc.toLowerCase().slice(0, 48);
    occ[k] = (occ[k] || 0) + 1;
    const id = k + '#' + occ[k];
    if (have.has(id)) { dup++; return; }
    have.add(id);
    txns.push({ id, acct, date: r.date, desc: r.desc, amt: r.amt, bal: r.bal, seq: seqBase + i });
    added++;
  });
  return { data: { ...base, txns, accounts: { ...base.accounts, [acct]: base.accounts[acct] || { name: acct, currency: base.settings.currency } } }, added, dup };
}
