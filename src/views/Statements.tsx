import { useEffect, useMemo, useRef, useState } from 'react';
import { analyse, extract, guessAcct, parseText, readFileRows, type Cell, type Parsed } from '../lib/parse';
import { commit } from '../lib/importer';
import { makeBackup, mergeData, readBackup, restoreData, saveBackupFile, type Backup } from '../lib/backup';
import { ago, CURRENCIES, dlong, getCurrency, money, sym } from '../lib/format';
import { sampleData } from '../lib/sample';
import { blank, kindOf, type AcctKind, type Assets, type ColumnMap, type Mode } from '../lib/types';
import { useStore } from '../store';
import { ConfirmButton, Panel } from '../components/ui';
import { useInstall } from '../components/install';

/* ---------- Import ---------- */
function Picker({ onRows }: { onRows: (rows: Cell[][], name: string) => void }) {
  const [over, setOver] = useState(false);
  const [paste, setPaste] = useState('');
  const { toast } = useStore();
  const read = async (f: File) => {
    try { onRows(await readFileRows(f), guessAcct(f.name)); }
    catch { toast("We couldn't read that file. Try saving it as CSV."); }
  };
  return (
    <>
      <div className="panel-h"><h2>Add a statement</h2><span className="small muted">Excel (.xls, .xlsx) or CSV</span></div>
      <label className={'drop' + (over ? ' over' : '')} htmlFor="file"
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) read(f); }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>
        <b>Choose a file or drop it here</b>
        <span className="small muted">Download the statement from net banking as Excel or CSV. PDFs can't be read.</span>
        <input id="file" type="file" accept=".csv,.xls,.xlsx,.txt,.tsv" className="sr" onChange={(e) => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ''; }} />
      </label>
      <details>
        <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>Or paste the rows from a spreadsheet</summary>
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Copy the table including the header row, then paste here" aria-label="Pasted statement rows" />
          <div><button className="btn plain" onClick={() => (paste.trim() ? onRows(parseText(paste), 'My bank account') : toast('Paste some rows first'))}>Read pasted rows</button></div>
        </div>
      </details>
      <p className="small muted">Overlapping statements are fine. Transactions you've already imported are skipped automatically.</p>
    </>
  );
}

function Mapper({ p, onCancel, onDone }: { p: Parsed; onCancel: () => void; onDone: () => void }) {
  const { data, setData, toast, setUi, go: nav } = useStore();
  const [map, setMap] = useState<ColumnMap>(p.map);
  const [acct, setAcct] = useState(p.acct);
  const [kind, setKind] = useState<AcctKind>(p.kind ?? 'bank');
  const [cur, setCur] = useState(p.currency ?? data.settings.currency ?? getCurrency());
  const ex = useMemo(() => extract(p, map), [p, map]);
  const prev = ex.rows.slice(-6).reverse();
  const accts = data.sample ? [] : Object.keys(data.accounts);
  const sel = (k: keyof ColumnMap, label: string, none = false) => (
    <div className="field">
      <label htmlFor={'m-' + k}>{label}</label>
      <select id={'m-' + k} value={String(map[k])} onChange={(e) => setMap({ ...map, [k]: +e.target.value })}>
        {(none || (map[k] as number) < 0) && <option value="-1">— none —</option>}
        {p.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
      </select>
    </div>
  );
  const go = () => {
    const name = acct.trim() || 'My bank account';
    const r = commit(data, name, ex.rows, { kind, currency: cur });
    setData(() => ({ ...r.data, mappings: { ...r.data.mappings, [p.sig]: { map, acct: name, kind, currency: cur } } }));
    toast(`${name}: ${r.added} added${r.dup ? ', ' + r.dup + ' already imported' : ''}${data.sample ? ' · sample data cleared' : ''}`);
    const nd = kind === 'bank' ? undefined : r.data.debts.find((x) => x.acct === name);
    if (nd && (!nd.apr || !nd.minPay)) { setUi({ editDebt: nd.id }); nav('debts'); }
    else onDone();
  };
  return (
    <>
      <div className="panel-h"><h2>Check the columns</h2><button className="linkbtn small" onClick={onCancel}>Start over</button></div>
      {p.known && <p className="pill good" style={{ alignSelf: 'start' }}>Same layout as your {p.known} import</p>}
      <div className="field"><label htmlFor="m-acct">Which account is this?</label>
        <input id="m-acct" type="text" list="acctlist" value={acct} onChange={(e) => setAcct(e.target.value)} placeholder="e.g. HDFC Savings" />
        <datalist id="acctlist">{accts.map((a) => <option key={a} value={a} />)}</datalist></div>
      <div className="field"><span className="label" id="m-kind-l">What is this statement?</span>
        <div className="seg" role="group" aria-labelledby="m-kind-l">
          {([['bank', 'Bank account'], ['card', 'Credit card'], ['loan', 'Loan']] as [AcctKind, string][]).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>
          ))}
        </div></div>
      <div className="field"><label htmlFor="m-cur">Currency of this account</label>
        <select id="m-cur" value={cur} onChange={(e) => setCur(e.target.value)}>
          {(CURRENCIES.includes(cur) ? CURRENCIES : [cur, ...CURRENCIES]).map((c) => <option key={c} value={c}>{c}</option>)}
        </select></div>
      <div className="field"><label htmlFor="m-mode">How does the statement show money in and out?</label>
        <select id="m-mode" value={map.mode} onChange={(e) => setMap({ ...map, mode: e.target.value as Mode })}>
          <option value="split">Separate Withdrawal and Deposit columns</option>
          <option value="drcr">One Amount column with a Dr / Cr column</option>
          <option value="signed">One Amount column, minus means money out</option>
        </select></div>
      <div className="mapgrid">
        {sel('date', 'Date')}{sel('desc', 'Description')}
        {map.mode === 'split' ? <>{sel('debit', 'Withdrawal / Debit')}{sel('credit', 'Deposit / Credit')}</> : <>{sel('amount', 'Amount')}{map.mode === 'drcr' && sel('drcr', 'Dr / Cr')}</>}
        {sel('balance', 'Balance', true)}
      </div>
      <div className="panel-h"><h2 style={{ fontSize: '.95rem' }}>Preview · latest {prev.length} of {ex.rows.length} transactions</h2>{ex.skipped > 0 && <span className="small muted">{ex.skipped} non-transaction rows skipped</span>}</div>
      <div className="scroll"><table>
        <thead><tr><th>Date</th><th>Description</th><th className="r">Amount</th><th className="r">Balance</th></tr></thead>
        <tbody>{prev.length ? prev.map((r, i) => (
          <tr key={i}><td>{dlong(r.date)}</td><td>{r.desc}</td><td className={'r ' + (r.amt > 0 ? 'up' : '')}>{r.amt > 0 ? '+' : '−'}{money(Math.abs(r.amt))}</td><td className="r">{r.bal != null ? money(r.bal) : '–'}</td></tr>
        )) : <tr><td colSpan={4}>No transactions found with these columns. Check the choices above.</td></tr>}</tbody>
      </table></div>
      <div className="formactions"><button className="btn" disabled={!ex.rows.length || !acct.trim()} onClick={go}>Import {ex.rows.length} transactions</button></div>
    </>
  );
}

function ImportPanel() {
  const { data, toast, go } = useStore();
  const [p, setP] = useState<Parsed | null>(null);
  const onRows = (rows: Cell[][], name: string) => {
    const a = analyse(rows, data.mappings);
    if ('error' in a) { toast(a.error); return; }
    setP({ ...a, acct: a.known || name });
    setTimeout(() => document.getElementById('imp')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  };
  return (
    <Panel className="span2" id="imp">
      {p ? <Mapper key={p.sig + p.body.length} p={p} onCancel={() => setP(null)} onDone={() => { setP(null); go('overview'); }} /> : <Picker onRows={onRows} />}
    </Panel>
  );
}

const KIND: Record<AcctKind, string> = { bank: 'Bank', card: 'Card', loan: 'Loan' };

/* ---------- Other things you own ---------- */
function NumField({ id, label, value, onSave }: { id: string; label: string; value: number; onSave: (n: number) => void }) {
  const [t, setT] = useState(value ? String(value) : '');
  useEffect(() => setT(value ? String(value) : ''), [value]);
  return (
    <div className="field"><label htmlFor={id}>{label}</label>
      <input id={id} type="text" inputMode="decimal" value={t} placeholder="0" onChange={(e) => setT(e.target.value)}
        onBlur={() => { const n = Math.max(0, parseFloat(t.replace(/,/g, '')) || 0); if (n !== value) onSave(n); setT(n ? String(n) : ''); }} /></div>
  );
}

function OwnPanel() {
  const { data, setData } = useStore();
  const a = data.assets, st = data.settings;
  const set = (p: Partial<Assets>) => setData((d) => ({ ...d, assets: { ...d.assets, ...p } }));
  const price = (p: { goldPrice?: number; silverPrice?: number }) => setData((d) => ({ ...d, settings: { ...d.settings, ...p } }));
  const cur = CURRENCIES.includes(a.currency) ? CURRENCIES : [a.currency, ...CURRENCIES];
  return (
    <Panel className="span3" id="own" title="Other things you own">
      <p className="small muted">Used for your net worth, long-term goal and zakat.</p>
      <div className="form two">
        <NumField id="o-gold" label="Gold (grams)" value={a.goldG} onSave={(n) => set({ goldG: n })} />
        <NumField id="o-silver" label="Silver (grams)" value={a.silverG} onSave={(n) => set({ silverG: n })} />
        <NumField id="o-inv" label="Investments" value={a.investments} onSave={(n) => set({ investments: n })} />
        <NumField id="o-owed" label="Money owed to you" value={a.owed} onSave={(n) => set({ owed: n })} />
        <NumField id="o-stock" label="Business stock" value={a.stock} onSave={(n) => set({ stock: n })} />
        <NumField id="o-other" label="Other" value={a.other} onSave={(n) => set({ other: n })} />
        <div className="field"><label htmlFor="o-cur">Currency of these amounts</label>
          <select id="o-cur" value={a.currency} onChange={(e) => set({ currency: e.target.value })}>
            {cur.map((c) => <option key={c} value={c}>{c}</option>)}
          </select></div>
        <NumField id="o-gp" label={`Gold price per gram (${sym(st.currency)})`} value={st.goldPrice} onSave={(n) => price({ goldPrice: n })} />
        <NumField id="o-sp" label={`Silver price per gram (${sym(st.currency)})`} value={st.silverPrice} onSave={(n) => price({ silverPrice: n })} />
      </div>
    </Panel>
  );
}

/* ---------- Backup ---------- */
function BackupPanel() {
  const { data, setData, toast, go } = useStore();
  const [code, setCode] = useState('');
  const [show, setShow] = useState(false);
  const [text, setText] = useState('');
  const [found, setFound] = useState<Backup | null>(null);
  const [err, setErr] = useState('');
  const ta = useRef<HTMLTextAreaElement>(null);
  const has = !data.sample && data.txns.length > 0;
  const canShare = typeof navigator !== 'undefined' && 'canShare' in navigator;

  useEffect(() => {
    if (!has) { setCode(''); return; }
    let live = true;
    makeBackup(data).then((c) => live && setCode(c)).catch(() => live && setCode(''));
    return () => { live = false; };
  }, [data, has]);

  useEffect(() => {
    setFound(null); setErr('');
    if (!text.trim()) return;
    const t = setTimeout(() => { readBackup(text).then(setFound).catch((e: Error) => setErr(e.message)); }, 250);
    return () => clearTimeout(t);
  }, [text]);

  const stamp = () => setData((d) => ({ ...d, lastBackup: new Date().toISOString() }));
  const selectCode = () => { setShow(true); setTimeout(() => { ta.current?.focus(); ta.current?.select(); }, 20); stamp(); };
  const copy = async () => {
    try { await navigator.clipboard.writeText(code); stamp(); toast('Backup code copied. Paste it somewhere safe.'); }
    catch { selectCode(); toast('The code is selected. Copy it with your keyboard or long-press.'); }
  };
  const file = async (share: boolean) => {
    try { const how = await saveBackupFile(code, share); stamp(); toast(how === 'shared' ? 'Backup shared' : 'Backup file saved to your downloads'); }
    catch (e) { if ((e as Error).name !== 'AbortError') toast("Couldn't save the file. Use Copy backup code instead."); }
  };
  const readFile = (f: File) => f.text().then(setText).catch(() => setErr("Couldn't read that file."));
  const fresh = data.lastBackup && Date.now() - Date.parse(data.lastBackup) < 30 * 864e5;

  return (
    <Panel className="span3" id="bk" title="Back up or move to another device"
      aside={<span className={'pill ' + (fresh ? 'good' : 'warn')}>{data.lastBackup ? 'Last backup ' + ago(data.lastBackup) : 'Not backed up yet'}</span>}>
      <div className="grid cols2">
        <div className="stack">
          <p className="label">1 · On this device</p>
          <p className="small muted">Save a backup file, or copy the backup code into a note or a message to yourself. It holds your transactions, categories, goals and settings.</p>
          <div className="formactions">
            <button className="btn" disabled={!code} onClick={() => file(false)}>{has ? (code ? 'Download backup file' : 'Preparing…') : 'Nothing to back up yet'}</button>
            {canShare && <button className="btn plain" disabled={!code} onClick={() => file(true)}>Share backup…</button>}
            <button className="btn plain" disabled={!code} onClick={copy}>Copy backup code</button>
            {code && <button className="linkbtn small" onClick={() => (show ? setShow(false) : selectCode())}>{show ? 'Hide code' : 'Show code'}</button>}
          </div>
          {show && <textarea ref={ta} readOnly value={code} aria-label="Backup code" />}
          {code && <p className="small muted">{data.txns.length} transactions · {Object.keys(data.accounts).length} accounts · {data.goals.length} goals · {Math.max(1, Math.round(code.length / 1024))} KB</p>}
        </div>
        <div className="stack">
          <p className="label">2 · On the new device</p>
          <p className="small muted">Open Bachat, go to Statements, then choose the backup file or paste the code.</p>
          <label className="btn plain" htmlFor="rs-file" style={{ justifySelf: 'start', cursor: 'pointer' }}>Choose backup file
            <input id="rs-file" type="file" accept=".txt,.json,text/plain,application/json" className="sr" onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ''; }} /></label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="…or paste your backup code (starts with BACHAT)" aria-label="Paste backup code" />
          {err && <p className="small down">{err}</p>}
          {found && (
            <div className="privacy" style={{ background: 'var(--surface-2)' }}>
              <div className="stack" style={{ gap: 8 }}>
                <b>Backup from {new Date(found.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</b>
                <span className="small muted">{found.state.txns.length} transactions · {Object.keys(found.state.accounts || {}).length} accounts · {(found.state.goals || []).length} goals</span>
                <div className="formactions">
                  {has ? (
                    <ConfirmButton className="btn" confirmText="Tap again to replace everything here" onConfirm={() => { setData(() => restoreData(found)); setText(''); toast(`Restored ${found.state.txns.length} transactions`); go('overview'); }}>Replace data on this device</ConfirmButton>
                  ) : (
                    <button className="btn" onClick={() => { setData(() => restoreData(found)); setText(''); toast(`Restored ${found.state.txns.length} transactions`); go('overview'); }}>Restore this backup</button>
                  )}
                  {has && <button className="btn plain" onClick={() => { const r = mergeData(data, found); setData(() => r.data); setText(''); toast(`Added ${r.added} new transactions from the backup`); }}>Add to data on this device</button>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <p className="small muted">Anyone with your backup can read your transactions. Keep it to yourself.</p>
    </Panel>
  );
}

/* ---------- Page ---------- */
export function Statements() {
  const { data, setData, M, toast, go } = useStore();
  const inst = useInstall();
  const [name, setName] = useState(data.settings.selfName);
  useEffect(() => setName(data.settings.selfName), [data.settings.selfName]);
  const accs = M.names.map((n) => M.acc[n]);

  return (
    <>
      <div className="head"><div><p className="label">Statements</p><h1>Import from your bank</h1></div></div>
      <div className="privacy">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
        <p>Your statements are read inside this browser and saved only on this device. Nothing is uploaded to a server. <a href="/privacy.html">Privacy</a></p>
      </div>
      <div className="grid cols3">
        <ImportPanel />
        <Panel title="Your accounts">
          <div>
            {accs.length ? accs.map((a) => (
              <div className="acct" key={a.name}>
                <div style={{ minWidth: 0 }}><b style={{ overflowWrap: 'anywhere' }}>{a.name}</b><p className="small muted"><span className="pill info">{KIND[kindOf(data.accounts[a.name])]} · {data.accounts[a.name]?.currency || data.settings.currency}</span> {a.n} transactions · {dlong(a.first)} → {dlong(a.last)}</p></div>
                <div style={{ textAlign: 'right' }}><b className="num">{a.bal != null ? money(a.bal) : '–'}</b><p className="small muted">{a.balDate ? 'on ' + dlong(a.balDate) : 'no balance column'}</p></div>
                <div style={{ gridColumn: '1/-1' }}>
                  <ConfirmButton className="linkbtn small danger-link" confirmText={'Tap again to remove ' + a.name}
                    onConfirm={() => { setData((d) => { const accounts = { ...d.accounts }; delete accounts[a.name]; return { ...d, txns: d.txns.filter((t) => t.acct !== a.name), accounts }; }); toast(a.name + ' removed'); }}>
                    Remove this account's transactions</ConfirmButton>
                </div>
              </div>
            )) : <p className="muted">No accounts yet.</p>}
          </div>
          {data.sample && <p className="small muted">These are sample accounts. Your first import replaces them.</p>}
        </Panel>
        <OwnPanel />
        <BackupPanel />
        <Panel className="span3" title="Settings">
          <div className="form two">
            <div className="field"><label htmlFor="s-name">Your name as it appears on transfers</label>
              <input id="s-name" type="text" placeholder="e.g. Saad Junaidi" value={name} onChange={(e) => setName(e.target.value)}
                onBlur={() => { if (name.trim() !== data.settings.selfName) { setData((d) => ({ ...d, settings: { ...d.settings, selfName: name.trim() } })); toast('Saved'); } }} />
              <span className="small muted">Money moved between your own accounts is then left out of income and spending.</span></div>
            <div className="field"><label>App</label>
              <div className="formactions">
                {!inst.installed && inst.canPrompt && <button className="btn" onClick={inst.prompt}>Install Bachat</button>}
                {!inst.installed && !inst.canPrompt && inst.ios && <span className="small muted">To install: tap Share, then “Add to Home Screen”.</span>}
                <button className="btn plain" onClick={() => { setData((d) => ({ ...sampleData(), settings: { ...sampleData().settings, age: d.settings.age || '33' } })); go('overview'); }}>Load sample data</button>
                <ConfirmButton confirmText="Tap again to delete everything" onConfirm={() => { setData(() => blank()); toast('All data deleted from this device'); }}>Delete all my data</ConfirmButton>
              </div></div>
          </div>
        </Panel>
      </div>
    </>
  );
}
