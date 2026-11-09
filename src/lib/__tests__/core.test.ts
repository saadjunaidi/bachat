import { describe, expect, it } from 'vitest';
import { analyse, extract, parseText, pdate, num, type Parsed } from '../parse';
import { autoCat, payee } from '../categories';
import { commit } from '../importer';
import { makeBackup, mergeData, readBackup, restoreData } from '../backup';
import { build } from '../model';
import { monthsTo, needed } from '../finance';
import { blank } from '../types';
import { short, money } from '../format';

const ok = (p: ReturnType<typeof analyse>) => { if ('error' in p) throw new Error(p.error); return p as Parsed; };

// Layout 1: separate Withdrawal / Deposit columns, header below bank details, totals row at the end
const BANK1 = [
  ['DETAILED STATEMENT'], ['Account No: XXXX1234'],
  ['S No.', 'Value Date', 'Transaction Date', 'Cheque Number', 'Transaction Remarks', 'Withdrawal Amount(INR)', 'Deposit Amount(INR)', 'Balance(INR)'],
  ['1', '01/10/2026', '01/10/2026', '', 'UPI/SWIGGY/XXiggy@icici/Sent using/ICICI Bank/219381274934/PTM', '632', '0', '848988.61'],
  ['2', '04/11/2026', '04/11/2026', '', 'INF/INFT/046554391491/oct month salar/TOTALCART TECHN', '0', '60000', '908988.61'],
  ['', '', '', '', 'Total', '632', '60000', '']
];
// Layout 2: Amount + Dr/Cr, balance with its own Dr/Cr, date with time, opening-balance row, out of order
const BANK2 = [
  ['Sl. No.', 'Transaction Date', 'Value Date', 'Description', 'Chq /Ref No.', 'Amount', 'Dr / Cr', 'Balance', 'Dr / Cr'],
  ['', '', '', 'OPENING BALANCE', '', '', '', '40,000.00', 'CR'],
  ['1', '18-10-2026 18:02', '18-10-2026', 'PCI/6924/Ralph Lauren Canada Co/rpoHal181026/18:02', '629112578700', '31,224.58', 'DR', '22,45,969.17', 'CR'],
  ['2', '02-11-2026 21:24', '02-11-2026', 'Recd:IMPS/630627094807/Talk is Ch/KKBK/X4553/IMPS0', 'IMPS', '3,76,469.48', 'CR', '25,92,439.76', 'CR'],
  ['3', '19-08-2026 22:25', '19-08-2026', 'UPI/Saad Junaidi/ICIC/213625598298/NA', 'UPI', '10,000.00', 'DR', '16,17,286.59', 'CR'],
  ['4', '11-04-2026 23:02', '11-04-2026', 'ATW/6924/+D-960, NFCDelhiDLIN110426/23:02', '61', '20,000.00', 'DR', '8,82,907.11', 'CR']
];

describe('parsing', () => {
  it('reads dates in Indian formats', () => {
    expect(pdate('05/10/2026')?.getMonth()).toBe(9);
    expect(pdate('05-10-26')?.getFullYear()).toBe(2026);
    expect(pdate('05 Oct 2026')?.getDate()).toBe(5);
    expect(pdate('2026-10-05')?.getDate()).toBe(5);
    expect(pdate('31/02/2026')).toBeNull();
    expect(pdate(46296)?.getMonth()).toBe(9); // Excel serial for 1 Oct 2026
  });
  it('reads Indian amounts', () => {
    expect(num('1,85,000.00')).toBe(185000);
    expect(num('₹ 649')).toBe(649);
    expect(num('(1,200)')).toBe(-1200);
    expect(num('2,340.50 Dr')).toBe(2340.5);
  });
  it('maps the Withdrawal / Deposit layout and skips non-transaction rows', () => {
    const p = ok(analyse(BANK1, {}));
    expect(p.map.mode).toBe('split');
    expect(p.map.date).toBe(2);
    const { rows, skipped } = extract(p, p.map);
    expect(rows).toHaveLength(2);
    expect(skipped).toBe(1);
    expect(rows[0]).toMatchObject({ date: '2026-10-01', amt: -632, bal: 848988.61 });
    expect(rows[1].amt).toBe(60000);
  });
  it('maps the Amount + Dr/Cr layout and sorts by date', () => {
    const p = ok(analyse(BANK2, {}));
    expect(p.map).toMatchObject({ mode: 'drcr', amount: 5, drcr: 6, balance: 7, date: 1 });
    const { rows } = extract(p, p.map);
    expect(rows.map((r) => r.date)).toEqual(['2026-04-11', '2026-08-19', '2026-10-18', '2026-11-02']);
    expect(rows[3]).toMatchObject({ amt: 376469.48, bal: 2592439.76 });
  });
  it('reads pasted spreadsheet rows', () => {
    const p = ok(analyse(parseText('Date\tNarration\tDebit\tCredit\tBalance\n05 Nov 2026\tPOS 4521XXXX NETFLIX.COM\t649\t\t1,20,000.00'), {}));
    const { rows } = extract(p, p.map);
    expect(rows[0]).toMatchObject({ amt: -649, bal: 120000 });
  });
  it('rejects files without a header row', () => {
    expect('error' in analyse([['hello'], ['world']], {})).toBe(true);
  });
});

describe('categories', () => {
  it('finds payees and categories', () => {
    expect(payee('UPI/SWIGGY/XXiggy@icici/Sent using')).toBe('Swiggy');
    expect(payee('PCI/6924/Ralph Lauren Canada Co/rpo')).toBe('Ralph Lauren Canada Co');
    expect(payee('ATL/6924/800001/+JAMIA NAGAR')).toBe('ATM cash');
    expect(autoCat('UPI/SWIGGY INS/XXmart@icici', -315)).toBe('Groceries');
    expect(autoCat('UPI/SWIGGY/x@icici', -632)).toBe('Food delivery');
    expect(autoCat('ACH D- ICICI PRU MF SIP', -25000)).toBe('Investments');
    expect(autoCat('UPI/Saad Junaidi/ICIC/2136', -10000, 'saad junaidi')).toBe('Transfer between accounts');
    expect(autoCat('UPI/Coca Cola Store/x@ybl', -100)).toBe('Other UPI payments'); // "ola" must not match "cola"
    expect(autoCat('Recd:IMPS/123/Talk is Ch/KKBK', 50000)).toBe('Other income');
  });
});

describe('import', () => {
  it('creates and updates a Debt when a card statement is committed', () => {
    const r1 = [{ date: '2026-10-01', desc: 'SHOP', amt: -500, bal: 60000 }, { date: '2026-10-05', desc: 'SHOP2', amt: -100, bal: -60600 }];
    const a = commit(blank(), 'Visa', r1, { kind: 'card', currency: 'USD' });
    expect(a.data.accounts.Visa).toMatchObject({ kind: 'card', currency: 'USD' });
    expect(a.data.debts[0]).toMatchObject({ kind: 'card', acct: 'Visa', currency: 'USD', balance: 60600, asOf: '2026-10-05', apr: 36, minPay: 0, minPct: 5, revolving: false });
    const b = commit(a.data, 'Visa', [{ date: '2026-11-02', desc: 'SHOP3', amt: -9, bal: 70000 }], { kind: 'card', currency: 'USD' });
    expect(b.data.debts).toHaveLength(1);
    expect(b.data.debts[0].balance).toBe(70000);
    expect(b.data.debts[0].asOf).toBe('2026-11-02');
  });
  it('does not roll a debt back with an older statement, and handles negative-for-owed balances', () => {
    const m = { kind: 'card' as const, currency: 'INR' };
    const a = commit(blank(), 'C', [{ date: '2026-10-30', desc: 'X', amt: -5, bal: 70000 }], m);
    const b = commit(a.data, 'C', [{ date: '2026-09-30', desc: 'Y', amt: -5, bal: 50000 }], m);
    expect(b.data.debts[0].balance).toBe(70000);
    const n = commit(blank(), 'N', [{ date: '2026-10-01', desc: 'A', amt: -60, bal: -60 }, { date: '2026-10-02', desc: 'B', amt: -100.49, bal: -160.49 }], m);
    expect(n.data.debts[0].balance).toBe(160.49);
  });
  it('keeps assets when importing over sample data', () => {
    const d = { ...blank(), sample: true, assets: { ...blank().assets, goldG: 10 } };
    expect(commit(d, 'A', [{ date: '2026-10-01', desc: 'X', amt: -1, bal: null }]).data.assets.goldG).toBe(10);
  });
  it('card payments are transfers, not income', () => {
    const d = commit(blank(), 'V', [{ date: '2026-10-01', desc: 'SHOP', amt: -120.5, bal: null }, { date: '2026-10-02', desc: 'PAYMENT RECEIVED - THANK YOU', amt: 500, bal: null }], { kind: 'card', currency: 'INR' }).data;
    const M = build(d);
    expect(M.MO['2026-10'].inc).toBe(0);
    expect(M.MO['2026-10'].exp).toBe(120.5);
  });
  it('loan account transactions are transfers and do not change spending', () => {
    const rows = [{ date: '2026-10-05', desc: 'EMI DEBIT', amt: -9000, bal: 100000 }];
    const d = commit(blank(), 'Car loan', rows, { kind: 'loan', currency: 'INR' }).data;
    expect(d.debts[0]).toMatchObject({ kind: 'loan', apr: 0, minPay: 0, balance: 100000 });
    const M = build(d);
    expect(M.MO['2026-10'].exp).toBe(0);
  });
  it('skips transactions already imported when statements overlap', () => {
    const p = ok(analyse(BANK1, {}));
    const { rows } = extract(p, p.map);
    const a = commit(blank(), 'ICICI', rows);
    expect(a.added).toBe(2);
    const b = commit(a.data, 'ICICI', rows);
    expect(b.added).toBe(0);
    expect(b.dup).toBe(2);
    expect(b.data.txns).toHaveLength(2);
  });
  it('keeps genuinely identical rows within one file', () => {
    const rows = [{ date: '2026-10-01', desc: 'UPI/TEA STALL', amt: -20, bal: null }, { date: '2026-10-01', desc: 'UPI/TEA STALL', amt: -20, bal: null }];
    expect(commit(blank(), 'X', rows).added).toBe(2);
  });
  it('builds monthly totals and the latest balance', () => {
    const p = ok(analyse(BANK2, {}));
    const d = commit({ ...blank(), settings: { ...blank().settings, selfName: 'Saad Junaidi' } }, 'Kotak', extract(p, p.map).rows).data;
    const M = build(d);
    expect(M.totalBal).toBe(2592439.76);
    expect(M.MO['2026-08'].exp).toBe(0); // self transfer not counted as spending
    expect(M.MO['2026-10'].cats['Shopping']).toBeCloseTo(31224.58);
  });
});

describe('backup', () => {
  const big = () => {
    const d = blank();
    for (let i = 0; i < 700; i++) d.txns.push({ id: 'A|' + i, acct: 'A', date: '2026-10-01', desc: 'UPI/SWIGGY ₹ test ' + i, amt: -i, bal: 1e5 - i, seq: i });
    d.accounts = { A: { name: 'A' } };
    d.goals = [{ id: 'g1', name: '₹50 lakh', price: 5e6, currency: 'INR', date: '2027-06', saved: 0, ret: 7, stretchChoice: 'wait' }];
    return d;
  };
  it('round-trips through a compressed code, even with line breaks', async () => {
    const code = await makeBackup(big());
    expect(code.startsWith('BACHAT1:')).toBe(true);
    const b = await readBackup(code.replace(/(.{76})/g, '$1\n'));
    const d = restoreData(b);
    expect(d.txns).toHaveLength(700);
    expect(d.goals[0].name).toBe('₹50 lakh');
    expect(d.sample).toBe(false);
  });
  it('explains damaged or wrong input', async () => {
    const code = await makeBackup(big());
    await expect(readBackup(code.slice(0, -40))).rejects.toThrow(/incomplete or damaged/);
    await expect(readBackup('hello')).rejects.toThrow(/doesn't look like a Bachat backup/);
  });
  it('v2 round-trips debts and gifts', async () => {
    const d = big();
    d.debts = [{ id: 'd1', name: 'Card', kind: 'card', currency: 'INR', balance: 1000, asOf: '2026-10-01', apr: 36, minPay: 100, revolving: true }];
    d.gifts = [{ id: 'f1', date: '2026-10-01', amount: 100, currency: 'INR', kind: 'sadaqah' }];
    const b = await readBackup(await makeBackup(d));
    expect(b.v).toBe(2);
    const r = restoreData(b);
    expect(r.debts[0].apr).toBe(36);
    expect(r.gifts).toHaveLength(1);
  });
  it('restores a v1 backup with an old-shape goal', async () => {
    const v1 = JSON.stringify({ app: 'bachat', v: 1, at: '2026-01-01T00:00:00Z', state: { accounts: {}, txns: [], rules: {}, overrides: {}, mappings: {}, settings: {}, goals: [{ id: 'g1', name: 'Car', target: 500000, date: '2027-06', saved: 0, ret: 7 }] } });
    const r = restoreData(await readBackup(v1));
    expect(r.goals[0].price).toBe(500000);
  });
  it('merge keeps current debts and adds new ones', async () => {
    const mk = (apr: number) => ({ id: 'd1', name: 'Card', kind: 'card' as const, currency: 'INR', balance: 1000, asOf: '2026-10-01', apr, minPay: 100, revolving: true });
    const theirs = blank(); theirs.debts = [mk(10), { ...mk(20), id: 'd2' }];
    const b = await readBackup(await makeBackup(theirs));
    const mine = blank(); mine.debts = [mk(36)];
    const r = mergeData(mine, b);
    expect(r.data.debts).toHaveLength(2);
    expect(r.data.debts.find((x) => x.id === 'd1')!.apr).toBe(36);
  });
  it('rejects newer backup versions but loads a missing v', async () => {
    const mk = (v?: number) => JSON.stringify({ app: 'bachat', ...(v === undefined ? {} : { v }), at: '2026-01-01T00:00:00Z', state: { txns: [] } });
    await expect(readBackup(mk(3))).rejects.toThrow(/newer version of Bachat/);
    expect(restoreData(await readBackup(mk())).txns).toEqual([]);
  });
  it('merge: gifts by id (current wins) and assets rule', async () => {
    const gift = (id: string, amount: number) => ({ id, date: '2026-10-01', amount, currency: 'INR', kind: 'sadaqah' as const });
    const theirs = blank(); theirs.gifts = [gift('f1', 1), gift('f2', 2)]; theirs.assets = { ...theirs.assets, goldG: 50 };
    const b = await readBackup(await makeBackup(theirs));
    const mine = blank(); mine.gifts = [gift('f1', 99)]; mine.assets = { ...mine.assets, silverG: 5 };
    const r = mergeData(mine, b);
    expect(r.data.gifts).toHaveLength(2);
    expect(r.data.gifts.find((g) => g.id === 'f1')!.amount).toBe(99);
    expect(r.data.assets.goldG).toBe(0);
    expect(r.data.assets.silverG).toBe(5);
    expect(mergeData(blank(), b).data.assets.goldG).toBe(50);
  });
  it('merges without duplicating', async () => {
    const full = big();
    const b = await readBackup(await makeBackup(full));
    const part = { ...full, txns: full.txns.slice(0, 300) };
    const r = mergeData(part, b);
    expect(r.added).toBe(400);
    expect(r.data.txns).toHaveLength(700);
    expect(r.data.goals).toHaveLength(1);
  });
});

describe('finance', () => {
  it('works out monthly saving and time to goal', () => {
    const n = needed(5_000_000, 3_600_000, 7, 0.07);
    expect(n).toBeGreaterThan(170_000);
    expect(n).toBeLessThan(185_000);
    expect(monthsTo(5_000_000, 3_600_000, n, 0.07)).toBe(7);
    expect(needed(100, 200, 5, 0)).toBe(0);
  });
  it('formats rupees the Indian way', () => {
    expect(short(1234567)).toBe('₹12.3 L');
    expect(short(10000000)).toBe('₹1 Cr');
    expect(money(185000)).toBe('₹1,85,000');
  });
});

describe('sample data', () => {
  it('fills every new screen with a ready plan', async () => {
    const { sampleData } = await import('../sample');
    const { plan } = await import('../plan');
    const { EMPTY_FX } = await import('../fx');
    const { addM, thisMonth } = await import('../format');
    const d = sampleData();
    const M = build(d);
    const now = addM(M.months[M.months.length - 1], 1); // sample ends last month, so now is the month after
    expect(now).toBe(thisMonth());
    const P = plan(d, M, EMPTY_FX('INR'), now);
    expect(d.sample).toBe(true);
    expect(P.ready).toBe(true);
    expect(P.guiltFree).toBeGreaterThan(0);
    expect(P.debtFree).not.toBeNull();
    const v = (n: string) => P.goals.find((r) => r.id === d.goals.find((g) => g.name === n)!.id)!.verdict;
    expect(v('New phone')).toBe('good');
    expect(v('Umrah')).toBe('stretch');
    expect(v('Luxury car')).toBe('bad');
  });
});
