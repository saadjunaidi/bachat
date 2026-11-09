import { clearSample, type AcctKind, type Data, type Debt, type Txn } from './types';
import type { Row } from './parse';

/**
 * Adds statement rows to an account. A transaction already imported (same account, date, amount,
 * balance and description) is skipped, so overlapping statements can be imported safely.
 * Identical rows inside one file are kept apart by counting occurrences.
 */
export function commit(d: Data, acct: string, rows: Row[], meta?: { kind: AcctKind; currency: string }): { data: Data; added: number; dup: number } {
  const base: Data = d.sample ? clearSample(d) : d;
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
    const withBal = rows.filter((r) => r.bal != null);
    const lb = withBal[withBal.length - 1];
    const bal = lb ? owedOf(withBal) : null;
    const at = debts.findIndex((x) => x.acct === acct);
    if (at >= 0) {
      if (bal != null && lb.date >= debts[at].asOf) debts = debts.map((x, j) => (j === at ? { ...x, balance: bal, asOf: lb.date } : x));
    } else {
      const nd: Debt = meta.kind === 'card'
        ? { id: 'd' + Date.now(), name: acct, kind: 'card', acct, currency: meta.currency, balance: bal ?? 0, asOf: last.date, apr: 36, minPay: 0, minPct: 5, revolving: false }
        : { id: 'd' + Date.now(), name: acct, kind: 'loan', acct, currency: meta.currency, balance: bal ?? 0, asOf: last.date, apr: 0, minPay: 0, revolving: false };
      debts = [...debts, nd];
    }
  }
  return { data: { ...base, txns, debts, accounts: { ...base.accounts, [acct]: info } }, added, dup };
}

/**
 * Amount owed from the last row's balance. Statements either show owed as positive (balance rises
 * with purchases) or as negative (balance falls with purchases). The last two balances against the
 * last row's amount tell which; a card in credit then owes 0. If it can't be told, use |balance|.
 */
function owedOf(rows: Row[]): number {
  const l = rows[rows.length - 1];
  const bal = l.bal as number;
  const p = rows[rows.length - 2];
  if (p && p.bal != null && l.amt) {
    const delta = bal - p.bal;
    if (delta * l.amt < 0) return Math.max(0, bal);
    if (delta * l.amt > 0) return Math.max(0, -bal);
  }
  return Math.abs(bal);
}
