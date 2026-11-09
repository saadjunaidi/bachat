import { useEffect, useState, type FormEvent } from 'react';
import { addM, CURRENCIES, getCurrency, mdiff, mlabel, money, pct, short, sym, thisMonth } from '../lib/format';
import { suggestAge, type GoalResult, type Verdict } from '../lib/plan';
import type { LongTerm, ShortGoal } from '../lib/types';
import { useStore } from '../store';
import { ConfirmButton, Explain, Panel } from '../components/ui';

const VERDICT: Record<Verdict, { label: string; color: string; soft: string }> = {
  good: { label: 'Good deal', color: 'var(--accent)', soft: 'var(--accent-soft)' },
  stretch: { label: 'Stretch', color: 'var(--gold)', soft: 'var(--gold-soft)' },
  bad: { label: 'Bad deal', color: 'var(--bad)', soft: 'var(--bad-soft)' }
};
const NEED_IMPORT = 'Import a full month of statements to see verdicts and the monthly plan.';

function GoalForm() {
  const { data, setData, ui, setUi, toast } = useStore();
  const editing = data.goals.find((g) => g.id === ui.editGoal) || null;
  const fresh = (): ShortGoal => ({ id: '', name: '', price: 0, currency: getCurrency(), date: addM(thisMonth(), 12), saved: 0, ret: 0, stretchChoice: 'wait' });
  const [g, setG] = useState<ShortGoal>(editing || fresh());
  useEffect(() => { setG(editing || fresh()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ui.editGoal]);
  const set = (p: Partial<ShortGoal>) => setG((x) => ({ ...x, ...p }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!g.name.trim() || !(g.price > 0) || !g.date) return;
    const goal = { ...g, name: g.name.trim(), id: g.id || 'g' + Date.now() };
    setData((d) => {
      const i = d.goals.findIndex((x) => x.id === goal.id);
      const goals = d.goals.slice();
      if (i >= 0) goals[i] = goal; else goals.push(goal);
      return { ...d, goals };
    });
    setUi({ editGoal: null });
    setG(fresh());
    toast(editing ? 'Goal updated' : 'Goal added');
  };
  const curs = CURRENCIES.includes(g.currency) ? CURRENCIES : [g.currency, ...CURRENCIES];

  return (
    <form className="form" onSubmit={submit}>
      <div className="field"><label htmlFor="g-name">Goal</label>
        <input id="g-name" type="text" required placeholder="e.g. car, Hajj, new phone" value={g.name} onChange={(e) => set({ name: e.target.value })} /></div>
      <div className="form two">
        <div className="field"><label htmlFor="g-target">Price ({sym(g.currency)})</label>
          <input id="g-target" type="number" inputMode="decimal" step="any" min={0.01} required value={g.price || ''} onChange={(e) => set({ price: +e.target.value })} /></div>
        <div className="field"><label htmlFor="g-cur">Currency</label>
          <select id="g-cur" value={g.currency} onChange={(e) => set({ currency: e.target.value })}>
            {curs.map((c) => <option key={c} value={c}>{c}</option>)}
          </select></div>
      </div>
      <div className="form two">
        <div className="field"><label htmlFor="g-date">Buy it by</label>
          <input id="g-date" type="month" required value={g.date} onChange={(e) => set({ date: e.target.value })} /></div>
        <div className="field"><label htmlFor="g-saved">Already saved ({sym(g.currency)})</label>
          <input id="g-saved" type="number" inputMode="decimal" step="any" min={0} value={g.saved || ''} onChange={(e) => set({ saved: +e.target.value })} /></div>
      </div>
      <div className="field"><label htmlFor="g-ret">Expected yearly return % on what you've saved</label>
        <input id="g-ret" type="number" step={0.5} value={g.ret} onChange={(e) => set({ ret: +e.target.value })} /></div>
      <div className="formactions">
        <button className="btn" type="submit">{editing ? 'Save goal' : 'Add goal'}</button>
        {editing && <button className="btn plain" type="button" onClick={() => setUi({ editGoal: null })}>Cancel</button>}
      </div>
    </form>
  );
}

function LongTermCard() {
  const { data, setData, P } = useStore();
  const st = data.settings;
  const lt = st.longTerm;
  const L = P.longTerm;
  const ltName = lt.type === 'retirement' ? 'Retirement' : 'Financial freedom';
  const ageN = parseInt(st.age, 10);
  const age = Number.isFinite(ageN) ? ageN : null;
  const setLt = (p: Partial<LongTerm>) => setData((d) => ({ ...d, settings: { ...d.settings, longTerm: { ...d.settings.longTerm, ...p } } }));
  const targetShown = lt.targetAge ?? (age != null ? suggestAge(lt.type, age) : '');
  const pillCls = L.status === 'behind' ? 'bad' : L.status === 'needAge' ? 'info' : 'good';
  const pillTxt = L.status === 'ahead' ? 'Ahead of target' : L.status === 'on' ? 'On track' : L.status === 'behind' ? 'Behind target' : 'Needs your age';

  return (
    <Panel title={ltName} aside={<span className="small muted">{lt.type === 'retirement' ? 'when you stop working' : 'when investments can pay for your life'}</span>}>
      <div className="seg" role="group" aria-label="Goal type">
        <button type="button" aria-pressed={lt.type === 'freedom'} onClick={() => setLt({ type: 'freedom' })}>Freedom</button>
        <button type="button" aria-pressed={lt.type === 'retirement'} onClick={() => setLt({ type: 'retirement' })}>Retirement</button>
      </div>
      <div className="form two">
        {!st.age.trim() && (
          <div className="field"><label htmlFor="lt-age">Your age</label>
            <input id="lt-age" type="number" inputMode="numeric" min={16} max={90} value={st.age} onChange={(e) => setData((d) => ({ ...d, settings: { ...d.settings, age: e.target.value } }))} /></div>
        )}
        <div className="field"><label htmlFor="lt-target-age">Target age</label>
          <input id="lt-target-age" type="number" inputMode="numeric" min={16} max={100} value={targetShown} onChange={(e) => setLt({ targetAge: e.target.value === '' ? null : +e.target.value })} /></div>
      </div>
      {P.ready && (
        <div className="facts">
          <div className="fact"><span className="small muted">Target</span><b>{short(L.target)}</b></div>
          <div className="fact"><span className="small muted">You have</span><b>{short(L.have)} · {pct(L.have / Math.max(1, L.target))}</b></div>
          <div className="fact"><span className="small muted">Put aside monthly</span><b>{L.status === 'needAge' ? '–' : money(L.reserve)}</b></div>
          <div className="fact"><span className="small muted">Projected</span>
            <b>{L.projected ? mlabel(L.projected) : '–'}</b>
            <span className={'pill ' + pillCls}>{pillTxt}</span></div>
        </div>
      )}
      {P.ready && (
        <Explain>
          <p>Target = a year of spending × {lt.mult}{lt.type === 'retirement' ? ` × ${lt.retirePct}%` : ''} = {money(L.yearlySpend)} × {lt.mult}{lt.type === 'retirement' ? ` × ${lt.retirePct}%` : ''} = {money(L.target)}, in today's money.</p>
          <p>{P.lines.find((l) => l.key === 'longTerm')?.explain}</p>
          {L.monthsVsTarget != null && L.status !== 'needAge' && <p>At your current plan you reach it {Math.abs(L.monthsVsTarget)} {Math.abs(L.monthsVsTarget) === 1 ? 'month' : 'months'} {L.monthsVsTarget >= 0 ? 'before' : 'after'} your target age{L.targetMonth ? ` (${mlabel(L.targetMonth)})` : ''}.</p>}
          <p>Growth is the return minus inflation ({lt.ret}% and {lt.infl}%), so every figure is in today's money.</p>
        </Explain>
      )}
      <div className="form two">
        <div className="field"><label htmlFor="lt-mult">Multiple of yearly spending</label>
          <select id="lt-mult" value={lt.mult} onChange={(e) => setLt({ mult: +e.target.value as LongTerm['mult'] })}>
            <option value={25}>25× (4% rule)</option><option value={30}>30× (safer when inflation is high)</option><option value={33}>33× (very safe)</option>
          </select></div>
        <div className="field"><label htmlFor="lt-ret">Expected yearly return %</label>
          <input id="lt-ret" type="number" step={0.5} value={lt.ret} onChange={(e) => setLt({ ret: +e.target.value })} /></div>
        <div className="field"><label htmlFor="lt-infl">Inflation %</label>
          <input id="lt-infl" type="number" step={0.5} value={lt.infl} onChange={(e) => setLt({ infl: +e.target.value })} /></div>
        {lt.type === 'retirement' && (
          <div className="field"><label htmlFor="lt-pct">Retirement spending, % of today's</label>
            <input id="lt-pct" type="number" step={5} min={10} max={150} value={lt.retirePct} onChange={(e) => setLt({ retirePct: +e.target.value })} /></div>
        )}
      </div>
    </Panel>
  );
}

function GoalCard({ g, r }: { g: ShortGoal; r: GoalResult | undefined }) {
  const { data, setData, setUi, ui, toast, P } = useStore();
  const ltName = data.settings.longTerm.type === 'retirement' ? 'retirement' : 'freedom';
  const v = r && P.ready ? VERDICT[r.verdict] : null;
  const p = Math.min(1, (g.saved || 0) / Math.max(1, g.price));
  const cur = g.currency;
  const choose = (c: ShortGoal['stretchChoice']) => setData((d) => ({ ...d, goals: d.goals.map((x) => (x.id === g.id ? { ...x, stretchChoice: c } : x)) }));
  const canSlip = r?.onTimeSlip != null && Number.isFinite(r.onTimeSlip);
  const slip = r?.onTimeSlip ?? 0;
  const infl = data.settings.longTerm.infl;
  const n = Math.max(0, mdiff(thisMonth(), g.date));

  return (
    <Panel className="goal">
      <div style={{ borderLeft: `4px solid ${v ? v.color : 'var(--line)'}`, paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="goal-top">
          <div style={{ minWidth: 0 }}><p className="label">By {mlabel(g.date)}</p><h2 style={{ overflowWrap: 'anywhere' }}>{g.name}</h2></div>
          {v && <span className="pill" style={{ background: v.soft, color: v.color }}>{v.label}</span>}
        </div>
        <div>
          <span className="big">{short(g.price, cur)}</span>
          {r && Math.abs(r.priceAdj - (g.price * 1)) > 0.5 && cur === getCurrency() && <span className="muted"> · {short(r.priceAdj)} with inflation by {mlabel(g.date)}</span>}
          {r && cur !== getCurrency() && <span className="muted"> · about {short(r.priceAdj)} with inflation by {mlabel(g.date)}</span>}
        </div>
        <div className="prog" role="progressbar" aria-valuenow={Math.round(p * 100)} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: p * 100 + '%', background: v ? v.color : 'var(--muted)' }} />
        </div>
        <p className="small muted">{short(g.saved || 0, cur)} saved of {short(g.price, cur)}</p>
        {P.ready && !r && <p className="small muted">No exchange rate for {cur} yet</p>}
        {r && P.ready && <p>{r.reason}</p>}
        {r && P.ready && r.verdict === 'stretch' && (
          <div className="seg" role="group" aria-label="Stretch choice">
            {canSlip && <button type="button" aria-pressed={g.stretchChoice === 'onTime'} onClick={() => choose('onTime')}>Buy on time ({ltName} slips {slip} {slip === 1 ? 'month' : 'months'})</button>}
            {r.waitDate && <button type="button" aria-pressed={g.stretchChoice === 'wait' || !canSlip} onClick={() => choose('wait')}>Wait until {mlabel(r.waitDate)}</button>}
          </div>
        )}
        {r && P.ready && r.verdict === 'bad' && (
          <div className="facts">
            <div className="fact"><span className="small muted">Earliest it fits</span><b>{r.earliest ? mlabel(r.earliest) : 'Not within 50 years'}</b></div>
            {r.incomeMultiple > 0 && <div className="fact"><span className="small muted">Price vs income</span><b>{r.incomeMultiple.toFixed(1)}× monthly income</b></div>}
          </div>
        )}
        {r && P.ready && (
          <Explain>
            <p>Price {money(g.price, cur)}{cur !== getCurrency() ? ` (${cur}, converted at today's rate)` : ''}, grown {infl}% a year for {n} {n === 1 ? 'month' : 'months'}, is {short(r.priceAdj)} by {mlabel(g.date)}.</p>
            <p>You've saved {short(g.saved || 0, cur)}{g.ret ? ` growing at ${g.ret}% a year` : ''}, so it needs {money(r.monthly)} a month{r.verdict === 'good' ? '.' : ' if it took its place in the plan.'}</p>
            {r.incomeMultiple > 0 && <p>The price is {r.incomeMultiple.toFixed(1)}× your average monthly income.</p>}
          </Explain>
        )}
        <div className="formactions">
          <button className="btn plain" onClick={() => { setUi({ editGoal: g.id }); setTimeout(() => document.getElementById('goalform')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30); }}>Edit</button>
          <ConfirmButton confirmText="Tap again to remove" onConfirm={() => { setData((d) => ({ ...d, goals: d.goals.filter((x) => x.id !== g.id) })); if (ui.editGoal === g.id) setUi({ editGoal: null }); toast('Goal removed'); }}>Remove</ConfirmButton>
        </div>
      </div>
    </Panel>
  );
}

export function Goals() {
  const { data, ui, P } = useStore();
  const goals = data.goals.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const byId = new Map(P.goals.map((r) => [r.id, r]));
  const rows = P.lines.filter((l) => l.key !== 'income');

  return (
    <>
      <div className="head"><div><p className="label">Goals</p><h1>Where your savings are heading</h1></div></div>
      {!P.ready && <p className="muted">{NEED_IMPORT}</p>}
      <div className="grid cols3">
        <LongTermCard />
        {goals.map((g) => <GoalCard key={g.id} g={g} r={byId.get(g.id)} />)}
        <Panel id="goalform" title={ui.editGoal ? 'Edit goal' : 'Add a goal'}><GoalForm /></Panel>
        {P.ready && (
          <Panel title="Where your monthly money goes">
            <div className="facts" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
              {P.lines.filter((l) => l.key === 'income').map((l) => (
                <div className="fact" key={l.key}><span className="small muted">{l.label}</span><b>{money(l.amount)}</b><Explain><p>{l.explain}</p></Explain></div>
              ))}
              {rows.map((l) => (
                <div className="fact" key={l.key}><span className="small muted">{l.label}</span><b>{money(l.amount)}</b><Explain><p>{l.explain}</p></Explain></div>
              ))}
              <div className="fact">
                <span className="small muted">{P.shortfall > 0 ? 'Short each month' : 'Guilt-free'}</span>
                <b style={{ fontWeight: 800, color: P.shortfall > 0 ? 'var(--bad)' : undefined }}>{money(P.shortfall > 0 ? P.shortfall : P.guiltFree)}</b>
                <Explain><p>{P.explain}</p></Explain>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}
