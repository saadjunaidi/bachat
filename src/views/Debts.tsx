import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { addM, CURRENCIES, dlong, getCurrency, mdiff, mlabel, money, sym, thisMonth } from '../lib/format';
import { CARD_MIN_PCT_DEFAULT, compare, toPayDebts } from '../lib/debt';
import { toView } from '../lib/fx';
import type { Debt } from '../lib/types';
import { useStore } from '../store';
import { ConfirmButton, Explain, Kpi, Panel } from '../components/ui';

const fresh = (): Debt => ({ id: '', name: '', kind: 'card', currency: getCurrency(), balance: 0, asOf: '', apr: 0, minPay: 0, minPct: CARD_MIN_PCT_DEFAULT, revolving: true });
const FORM_ID = 'debtform';
const scrollToForm = () => setTimeout(() => document.getElementById(FORM_ID)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30);

function DebtForm({ editing, onDone }: { editing: Debt | null; onDone: () => void }) {
  const { setData, toast } = useStore();
  const [d, setD] = useState<Debt>(editing || fresh());
  useEffect(() => { setD(editing || fresh()); }, [editing]);
  const set = (p: Partial<Debt>) => setD((x) => ({ ...x, ...p }));
  const isCard = d.kind === 'card';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!d.name.trim() || !(d.balance >= 0)) return;
    const debt: Debt = { ...d, name: d.name.trim(), id: d.id || 'd' + Date.now(), asOf: d.asOf || new Date().toISOString().slice(0, 10) };
    if (debt.kind === 'loan') { debt.revolving = true; delete debt.minPct; }
    setData((x) => {
      const i = x.debts.findIndex((y) => y.id === debt.id);
      const debts = x.debts.slice();
      if (i >= 0) debts[i] = debt; else debts.push(debt);
      return { ...x, debts };
    });
    toast(editing ? 'Debt updated' : 'Debt added');
    onDone();
  };
  const curs = CURRENCIES.includes(d.currency) ? CURRENCIES : [d.currency, ...CURRENCIES];

  return (
    <form className="form" onSubmit={submit}>
      <div className="form two">
        <div className="field"><label htmlFor="d-name">Name</label>
          <input id="d-name" type="text" required placeholder="e.g. HDFC card, car loan" value={d.name} onChange={(e) => set({ name: e.target.value })} /></div>
        <div className="field"><label htmlFor="d-kind">Kind</label>
          <select id="d-kind" value={d.kind} onChange={(e) => { const kind = e.target.value as Debt['kind']; set({ kind, revolving: true, minPct: kind === 'card' ? d.minPct ?? CARD_MIN_PCT_DEFAULT : undefined }); }}>
            <option value="card">Credit card</option><option value="loan">Loan</option>
          </select></div>
      </div>
      <div className="form two">
        <div className="field"><label htmlFor="d-bal">Balance owed ({sym(d.currency)})</label>
          <input id="d-bal" type="number" inputMode="decimal" step="any" min={0} required value={d.balance || ''} onChange={(e) => set({ balance: +e.target.value })} /></div>
        <div className="field"><label htmlFor="d-cur">Currency</label>
          <select id="d-cur" value={d.currency} onChange={(e) => set({ currency: e.target.value })}>
            {curs.map((c) => <option key={c} value={c}>{c}</option>)}
          </select></div>
      </div>
      <div className="form two">
        <div className="field"><label htmlFor="d-apr">Yearly interest (APR) %</label>
          <input id="d-apr" type="number" inputMode="decimal" step="any" min={0} value={d.apr || ''} onChange={(e) => set({ apr: +e.target.value })} /></div>
        <div className="field"><label htmlFor="d-min">{isCard ? 'Minimum payment' : 'Monthly EMI'} ({sym(d.currency)})</label>
          <input id="d-min" type="number" inputMode="decimal" step="any" min={0} value={d.minPay || ''} onChange={(e) => set({ minPay: +e.target.value })} /></div>
      </div>
      {isCard && (
        <>
          <div className="field"><label htmlFor="d-pct">Minimum as % of balance</label>
            <input id="d-pct" type="number" inputMode="decimal" step="any" min={0} value={d.minPct ?? ''} onChange={(e) => set({ minPct: e.target.value === '' ? undefined : +e.target.value })} /></div>
          <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={!d.revolving} onChange={(e) => set({ revolving: !e.target.checked })} />
            I clear this card in full every month
          </label>
        </>
      )}
      <div className="formactions">
        <button className="btn" type="submit">{editing ? 'Save debt' : 'Add debt'}</button>
        <button className="btn plain" type="button" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

export function Debts() {
  const { data, setData, P, fx, M, ui, setUi, toast, go } = useStore();
  const st = data.settings;
  const [formFor, setFormFor] = useState<string | 'new' | null>(null);

  // A freshly imported debt with no APR/minimum arrives via ui.editDebt: open its form once, then clear the flag.
  useEffect(() => {
    if (!ui.editDebt) return;
    setFormFor(ui.editDebt);
    setUi({ editDebt: null });
    scrollToForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.editDebt]);

  const pd = useMemo(() => toPayDebts(data, fx), [data, fx]);
  const cmp = useMemo(() => compare(pd, st.strategy, st.extra), [pd, st.strategy, st.extra]);
  const nameOf = (id: string) => data.debts.find((x) => x.id === id)?.name || id;
  const now = thisMonth();
  const view = getCurrency();

  const interestMo = pd.reduce((s, x) => s + (x.balance * x.apr) / 1200, 0);
  const debtFree = P.debtFree ?? (Number.isFinite(cmp.chosen.months) ? addM(now, cmp.chosen.months) : null);
  const editing = formFor && formFor !== 'new' ? data.debts.find((x) => x.id === formFor) || null : null;
  const formOpen = formFor === 'new' || !!editing;
  const sliderMax = Math.max(0, Math.round(P.guiltFree + st.extra));
  const lt = st.longTerm;
  const ltName = lt.type === 'retirement' ? 'Retirement' : 'Financial freedom';
  const earlier = P.longTerm.projected && P.longTerm.projectedNoExtra ? mdiff(P.longTerm.projected, P.longTerm.projectedNoExtra) : 0;
  const high = data.debts.filter((x) => x.apr > lt.ret && x.balance > 0 && !(x.kind === 'card' && !x.revolving));
  const set = (p: Partial<typeof st>) => setData((d) => ({ ...d, settings: { ...d.settings, ...p } }));
  const open = (id: string | 'new') => { setFormFor(id); scrollToForm(); };
  const done = () => setFormFor(null);

  if (!data.debts.length && !formOpen) {
    return (
      <>
        <div className="head"><div><p className="label">Debts</p><h1>Your fastest way out</h1></div></div>
        <div className="panel"><div className="empty">
          <h2>No debts added yet</h2>
          <p style={{ margin: '8px 0 14px' }}>Add a card or loan to see how fast you can clear it.</p>
          <div className="formactions">
            <button className="btn" onClick={() => open('new')}>Add a card or loan</button>
            <button className="btn plain" onClick={() => go('statements')}>Import a statement</button>
          </div>
        </div></div>
      </>
    );
  }

  const rows = data.debts.map((x) => {
    const bal = toView(x.balance, x.currency, fx);
    return { x, bal, int: bal === null ? null : (bal * x.apr) / 1200, cleared: x.kind === 'card' && !x.revolving };
  });

  return (
    <>
      <div className="head"><div><p className="label">Debts</p><h1>Your fastest way out</h1></div></div>
      <div className="grid cols3">
        <Kpi label="Total owed" value={money(M.debtTotal)} sub={<Explain><p>{rows.length ? rows.map((r) => `${r.x.name} ${money(r.x.balance, r.x.currency)}`).join(' + ') : 'Nothing'} = {money(M.debtTotal)}{rows.some((r) => r.x.currency !== view) ? `, converted to ${view} at today's rate` : ''}.</p></Explain>} />
        <Kpi label="Interest per month" value={money(interestMo)} sub={<Explain>
          {pd.length ? <p>{pd.map((x) => `${nameOf(x.id)}: ${money(x.balance)} × ${x.apr}% ÷ 12 = ${money((x.balance * x.apr) / 1200)}`).join('; ')}. Total {money(interestMo)}. Cards you clear in full every month are left out.</p> : <p>No loans or carried card balances, so no interest.</p>}
        </Explain>} />
        {pd.length > 0 && (
          <Kpi label="Debt-free by" value={debtFree ? mlabel(debtFree) : 'Never at minimums'} sub={<Explain>
            <p>{debtFree ? `Paying the minimums${st.extra > 0 ? ` plus ${money(st.extra)} extra` : ''} every month, the last debt clears in ${cmp.chosen.months} ${cmp.chosen.months === 1 ? 'month' : 'months'}, in ${mlabel(debtFree)}.` : 'The minimum payments do not cover the interest, so the balance never falls. Add an extra amount below.'}</p>
            <p>{P.lines.find((l) => l.key === 'debt')?.explain}</p>
          </Explain>} />
        )}
      </div>

      <div className="grid cols3">
        <Panel title="Your debts" aside={!formOpen && <button className="btn plain" onClick={() => open('new')}>Add a card or loan</button>}>
          <div className="rows">
            {rows.map(({ x, bal, int, cleared }) => (
              <div className="row" key={x.id} style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="t">{x.name}</div>
                  <div className="m">
                    <span>{x.kind === 'card' ? 'Card' : 'Loan'} · {x.currency}</span>
                    {cleared ? <span className="pill good">Cleared monthly</span> : <span>{x.apr}% APR</span>}
                    {!cleared && <span>{x.kind === 'card' ? 'min' : 'EMI'} {money(x.minPay, x.currency)}</span>}
                    {x.acct && <span>statement imported {dlong(x.asOf)}</span>}
                  </div>
                </div>
                <div className="a">{money(x.balance, x.currency)}</div>
                <div className="m" style={{ gridColumn: '1 / -1' }}>
                  {!cleared && (bal === null ? <span className="muted">No exchange rate for {x.currency} yet</span> : int !== null && <span>{money(int)} interest a month</span>)}
                  <button className="btn plain" onClick={() => open(x.id)}>Edit</button>
                  <ConfirmButton confirmText="Tap again to remove" onConfirm={() => { setData((d) => ({ ...d, debts: d.debts.filter((y) => y.id !== x.id) })); if (formFor === x.id) done(); toast('Debt removed'); }}>Remove</ConfirmButton>
                </div>
              </div>
            ))}
          </div>
          {high.map((x) => <p className="small" key={x.id} style={{ marginTop: 10 }}>Paying off {x.name} earns you a guaranteed {x.apr}%. No investment reliably beats that.</p>)}
        </Panel>

        {formOpen && <Panel id={FORM_ID} title={editing ? 'Edit debt' : 'Add a card or loan'}><DebtForm key={formFor} editing={editing} onDone={done} /></Panel>}

        {pd.length > 0 && (
          <Panel title="Fastest way out">
            <div className="seg" role="group" aria-label="Strategy">
              <button type="button" aria-pressed={st.strategy === 'avalanche'} onClick={() => set({ strategy: 'avalanche' })}>Highest interest first</button>
              <button type="button" aria-pressed={st.strategy === 'snowball'} onClick={() => set({ strategy: 'snowball' })}>Smallest balance first</button>
            </div>
            <div className="field">
              <label htmlFor="d-extra">Extra per month: <b>{money(st.extra)}</b></label>
              <input id="d-extra" type="range" min={0} max={sliderMax} step={500} value={Math.min(st.extra, sliderMax)} onChange={(e) => set({ extra: +e.target.value })} />
            </div>
            {cmp.base.never.map((id) => <p className="small" key={id} style={{ color: 'var(--bad)' }}>{nameOf(id)} will never be paid off at the minimum.</p>)}
            <ol style={{ paddingLeft: 20, margin: '10px 0' }}>
              {cmp.chosen.order.map((o) => <li key={o.id}>Clear {nameOf(o.id)} by {mlabel(addM(now, o.month))}</li>)}
            </ol>
            {cmp.chosen.never.length === 0 && !Number.isFinite(cmp.chosen.months) && <p className="small muted">Some debts do not clear within 50 years at this payment.</p>}
            {Number.isNaN(cmp.interestSaved) ? <p><b>Paying only minimums never clears this debt</b></p>
              : cmp.interestSaved > 0 && st.extra > 0 ? <p><b>{`You save ${money(cmp.interestSaved)} in interest`}</b></p>
                : <p className="small muted">Add an extra amount to see how much interest you'd save.</p>}
            {earlier > 0 && <p><b>{ltName} moves {earlier} {earlier === 1 ? 'month' : 'months'} earlier</b></p>}
            <Explain>
              <p>{st.strategy === 'avalanche' ? 'Highest interest first: every minimum is paid, then all the extra goes to the debt with the highest APR. Cleared debts free up their payment for the next one.' : 'Smallest balance first: every minimum is paid, then all the extra goes to the smallest balance. Cleared debts free up their payment for the next one.'}</p>
              <p>Minimums only: {Number.isFinite(cmp.base.months) ? `${cmp.base.months} months, ${money(cmp.base.interest)} interest` : 'never clears'}. With {money(st.extra)} extra: {Number.isFinite(cmp.chosen.months) ? `${cmp.chosen.months} months, ${money(cmp.chosen.interest)} interest` : 'never clears'}.{Number.isNaN(cmp.interestSaved) ? '' : ` ${money(cmp.base.interest)} − ${money(cmp.chosen.interest)} = ${money(cmp.interestSaved)} saved${Number.isFinite(cmp.monthsSaved) && cmp.monthsSaved > 0 ? `, ${cmp.monthsSaved} months sooner` : ''}.`}</p>
              {earlier > 0 && <p>{ltName} is projected for {mlabel(P.longTerm.projected!)} with this extra, against {mlabel(P.longTerm.projectedNoExtra!)} without it, because cleared debt payments go to it.</p>}
            </Explain>
          </Panel>
        )}
      </div>
    </>
  );
}
