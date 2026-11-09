import { blank, type AcctKind, type Data, type Debt, type Txn } from './types';
import type { Row } from './parse';

/**
 * Adds statement rows to an account. A transaction already imported (same account, date, amount,
 * balance and description) is skipped, so overlapping statements can be imported safely.
 * Identical rows inside one file are kept apart by counting occurrences.
 */
export function commit(d: Data, acct: string, rows: Row[], meta?: { kind: AcctKind; currency: string }): { data: Data; added: number; dup: number } {
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
  const info = { ...(base.accounts[acct] || { name: acct, currency: base.settings.currency }), ...(meta || {}) };
  let debts = base.debts;
  const last = rows[rows.length - 1];
  if (meta && meta.kind !== 'bank' && last) {
    const bal = last.bal == null ? null : Math.abs(last.bal);
    const at = debts.findIndex((x) => x.acct === acct);
    if (at >= 0) {
      if (bal != null) debts = debts.map((x, j) => (j === at ? { ...x, balance: bal, asOf: last.date } : x));
    } else {
      const nd: Debt = meta.kind === 'card'
        ? { id: 'd' + Date.now(), name: acct, kind: 'card', acct, currency: meta.currency, balance: bal ?? 0, asOf: last.date, apr: 36, minPay: 0, minPct: 5, revolving: false }
        : { id: 'd' + Date.now(), name: acct, kind: 'loan', acct, currency: meta.currency, balance: bal ?? 0, asOf: last.date, apr: 0, minPay: 0, revolving: false };
      debts = [...debts, nd];
    }
  }
  return { data: { ...base, txns, debts, accounts: { ...base.accounts, [acct]: info } }, added, dup };
}
