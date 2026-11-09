import { useEffect, useState, type FormEvent } from 'react';
import { addM, dlabel, getCurrency, mdiff, mlabel, money, pct, short, sym, thisMonth } from '../lib/format';
import { monthsTo, needed } from '../lib/finance';
import type { ShortGoal } from '../lib/types';
import { useStore } from '../store';
import { ConfirmButton, Kpi, Panel } from '../components/ui';

function GoalForm() {
  const { data, setData, ui, setUi, toast } = useStore();
  const editing = data.goals.find((g) => g.id === ui.editGoal) || null;
  const fresh = (): ShortGoal => ({ id: '', name: '', price: 0, currency: data.settings.currency, date: addM(thisMonth(), 12), saved: 0, ret: 7, stretchChoice: 'wait' });
  const [g, setG] = useState<ShortGoal>(editing || fresh());
  useEffect(() => { setG(editing || fresh()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ui.editGoal]);
  const set = (p: Partial<ShortGoal>) => setG((x) => ({ ...x, ...p }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!g.name.trim() || !g.price || !g.date) return;
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

  return (
    <form className="form" onSubmit={submit}>
      <div className="field"><label htmlFor="g-name">Goal</label>
        <input id="g-name" type="text" required placeholder="e.g. car, Hajj, new phone" value={g.name} onChange={(e) => set({ name: e.target.value })} /></div>
      <div className="form two">
        <div className="field"><label htmlFor="g-target">Target amount ({sym(getCurrency())})</label>
          <input id="g-target" type="number" inputMode="numeric" min={1} required value={g.price || ''} onChange={(e) => set({ price: +e.target.value })} /></div>
        <div className="field"><label htmlFor="g-date">Reach it by</label>
          <input id="g-date" type="month" required value={g.date} onChange={(e) => set({ date: e.target.value })} /></div>
      </div>
      <div className="form two">
        <div className="field"><label htmlFor="g-saved">Already saved for it ({sym(getCurrency())})</label>
          <input id="g-saved" type="number" inputMode="numeric" min={0} value={g.saved || ''} onChange={(e) => set({ saved: +e.target.value })} /></div>
        <div className="field"><label htmlFor="g-ret">Expected yearly return %</label>
          <input id="g-ret" type="number" step={0.5} value={g.ret} onChange={(e) => set({ ret: +e.target.value })} /></div>
      </div>
      <div className="formactions">
        <button className="btn" type="submit">{editing ? 'Save goal' : 'Add goal'}</button>
        {editing && <button className="btn plain" type="button" onClick={() => setUi({ editGoal: null })}>Cancel</button>}
      </div>
    </form>
  );
}

export function Goals() {
  const { data, setData, M, ui, setUi, toast } = useStore();
  const a = M.a3;
  const st = data.settings;
  const monthly = a.saved;
  const now = thisMonth();
  const gs = data.goals.map((g) => {
    const saved = g.saved || 0;
    const n = Math.max(0, mdiff(now, g.date));
    const need = needed(g.price, saved, n, (g.ret || 0) / 100);
    const k = monthsTo(g.price, saved, Math.max(0, monthly), (g.ret || 0) / 100);
    return { ...g, saved, n, need, reach: isFinite(k) ? addM(now, k) : null, ok: need <= monthly + 1 };
  });
  const totalNeed = gs.filter((g) => isFinite(g.need)).reduce((s, g) => s + g.need, 0);
  const spend = a.exp;
  const FN = spend * 12 * (st.longTerm.mult || 30);
  const real = (1 + (st.longTerm.ret || 0) / 100) / (1 + (st.longTerm.infl || 0) / 100) - 1;
  const fk = monthsTo(FN, M.totalBal || 0, Math.max(0, monthly), real);
  const fy = isFinite(fk) && FN > 0 ? fk / 12 : null;
  const age = +st.age || 0;
  const setSetting = (k: 'age' | 'mult' | 'ret' | 'infl', v: string) => setData((d) => ({ ...d, settings: k === 'age' ? { ...d.settings, age: v } : { ...d.settings, longTerm: { ...d.settings.longTerm, [k]: +v } } }));

  return (
    <>
      <div className="head"><div><p className="label">Goals</p><h1>Where your savings are heading</h1></div></div>
      <div className="grid kpis">
        <Kpi hero label="You save" value={<>{short(monthly)}<span className="small">/mo</span></>} sub={<span className="small muted">avg of last {a.months.length} full months</span>} />
        <Kpi label="Goals need" value={<>{short(totalNeed)}<span className="small">/mo</span></>}
          sub={gs.length ? <span className={'pill ' + (totalNeed <= monthly ? 'good' : 'bad')}>{totalNeed <= monthly ? 'Covered' : 'Short ' + short(totalNeed - monthly) + '/mo'}</span> : <span className="small muted">Add a goal below</span>} />
        <Kpi label="In the bank" value={M.hasBal ? short(M.totalBal) : '–'} sub={<span className="small muted">{M.end ? 'as of ' + dlabel(M.end) : ''}</span>} />
        <Kpi label="Freedom in" value={fy != null ? fy.toFixed(1) + ' yrs' : '–'} sub={<span className="small muted">{fy != null && age ? 'around age ' + Math.round(age + fy) : 'at your current pace'}</span>} />
      </div>
      <div className="grid cols3">
        {gs.map((g) => {
          const p = Math.min(1, g.saved / Math.max(1, g.price));
          const done = g.saved >= g.price;
          return (
            <Panel key={g.id} className="goal">
              <div className="goal-top">
                <div style={{ minWidth: 0 }}><p className="label">By {mlabel(g.date)}</p><h2 style={{ overflowWrap: 'anywhere' }}>{g.name}</h2></div>
                <span className={'pill ' + (done || g.ok ? 'good' : 'bad')}>{done ? 'Reached' : g.ok ? 'On track' : 'Behind'}</span>
              </div>
              <div><span className="big">{short(g.saved)}</span> <span className="muted">of {short(g.price)}</span></div>
              <div className="prog" role="progressbar" aria-valuenow={Math.round(p * 100)} aria-valuemin={0} aria-valuemax={100}>
                <i style={{ width: p * 100 + '%', background: g.ok ? 'var(--accent)' : 'var(--gold)' }} />
              </div>
              <div className="facts">
                <div className="fact"><span className="small muted">Save each month</span><b>{isFinite(g.need) ? money(g.need) : 'Date passed'}</b></div>
                <div className="fact"><span className="small muted">At your pace</span><b className={g.reach && g.reach > g.date ? 'down' : ''}>{done ? 'Done' : g.reach ? mlabel(g.reach) : 'Not reachable'}</b></div>
              </div>
              <p className="small muted">{g.n} months left · own savings pot · {g.ret || 0}% yearly return</p>
              <div className="formactions">
                <button className="btn plain" onClick={() => { setUi({ editGoal: g.id }); setTimeout(() => document.getElementById('goalform')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30); }}>Edit</button>
                <ConfirmButton confirmText="Tap again to remove" onConfirm={() => { setData((d) => ({ ...d, goals: d.goals.filter((x) => x.id !== g.id) })); if (ui.editGoal === g.id) setUi({ editGoal: null }); toast('Goal removed'); }}>Remove</ConfirmButton>
              </div>
            </Panel>
          );
        })}
        <Panel id="goalform" title={ui.editGoal ? 'Edit goal' : 'Add a goal'}><GoalForm /></Panel>
        <Panel className={gs.length % 3 === 2 ? '' : 'span2'} title="Financial freedom" aside={<span className="small muted">when investments can pay for your life</span>}>
          <div className="facts">
            <div className="fact"><span className="small muted">You spend</span><b>{money(spend)}/mo</b></div>
            <div className="fact"><span className="small muted">Freedom number</span><b>{short(FN)}</b></div>
            <div className="fact"><span className="small muted">You have</span><b>{M.hasBal ? short(M.totalBal) + ' · ' + pct((M.totalBal || 0) / Math.max(1, FN)) : '–'}</b></div>
            <div className="fact"><span className="small muted">Reached in</span><b>{fy != null ? fy.toFixed(1) + ' years' + (age ? ' (age ' + Math.round(age + fy) + ')' : '') : 'Not at this pace'}</b></div>
          </div>
          <div className="form two">
            <div className="field"><label htmlFor="f-mult">Multiple of yearly spending</label>
              <select id="f-mult" value={st.longTerm.mult} onChange={(e) => setSetting('mult', e.target.value)}>
                <option value={25}>25× (4% rule)</option><option value={30}>30× (safer when inflation is high)</option><option value={33}>33× (very safe)</option>
              </select></div>
            <div className="field"><label htmlFor="f-age">Your age (optional)</label>
              <input id="f-age" type="number" inputMode="numeric" min={16} max={90} value={st.age} onChange={(e) => setSetting('age', e.target.value)} /></div>
            <div className="field"><label htmlFor="f-ret">Expected yearly return %</label>
              <input id="f-ret" type="number" step={0.5} value={st.longTerm.ret} onChange={(e) => setSetting('ret', e.target.value)} /></div>
            <div className="field"><label htmlFor="f-infl">Inflation %</label>
              <input id="f-infl" type="number" step={0.5} value={st.longTerm.infl} onChange={(e) => setSetting('infl', e.target.value)} /></div>
          </div>
          <p className="small muted">Freedom number = monthly spending × 12 × {st.longTerm.mult || 30}. The projection grows today's balance plus your average monthly saving at the return minus inflation, so figures are in today's rupees.</p>
        </Panel>
      </div>
    </>
  );
}
