import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { CURRENCIES, dlong, getCurrency, iso, money, pct, short, sym } from '../lib/format';
import { GOLD_NISAB_G, SILVER_NISAB_G, ZAKAT_RATE, givingSummary, nextZakatDate, zakatFor } from '../lib/giving';
import type { Gift } from '../lib/types';
import { useStore } from '../store';
import { Explain, Kpi, Panel } from '../components/ui';

const tint: CSSProperties = {
  background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
  border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
  borderRadius: 12, padding: 14
};

const kindLabel = (k: string, islamic: boolean) => (!islamic || k === 'charity' ? 'Charity' : k === 'zakat' ? 'Zakat' : 'Sadaqah');

function GiftForm({ islamic, onDone }: { islamic: boolean; onDone: () => void }) {
  const { setData, toast } = useStore();
  const [g, setG] = useState<Gift>(() => ({ id: '', date: iso(new Date()), amount: 0, currency: getCurrency(), kind: islamic ? 'sadaqah' : 'charity', cause: '' }));
  const set = (p: Partial<Gift>) => setG((x) => ({ ...x, ...p }));
  const word = 'gift';
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!(g.amount > 0) || !g.date) return;
    const gift: Gift = { ...g, id: 'f' + Date.now(), kind: islamic ? g.kind : 'charity' };
    const cause = (g.cause || '').trim();
    if (cause) gift.cause = cause; else delete gift.cause;
    setData((d) => ({ ...d, gifts: [...d.gifts, gift] }));
    toast('Gift logged');
    onDone();
  };
  const curs = CURRENCIES.includes(g.currency) ? CURRENCIES : [g.currency, ...CURRENCIES];
  return (
    <form className="form" onSubmit={submit}>
      <div className="form two">
        <div className="field"><label htmlFor="g-date">Date</label>
          <input id="g-date" type="date" required value={g.date} onChange={(e) => set({ date: e.target.value })} /></div>
        <div className="field"><label htmlFor="g-amt">Amount ({sym(g.currency)})</label>
          <input id="g-amt" type="number" inputMode="decimal" step="any" min={0} required value={g.amount || ''} onChange={(e) => set({ amount: +e.target.value })} /></div>
      </div>
      <div className="form two">
        <div className="field"><label htmlFor="g-cur">Currency</label>
          <select id="g-cur" value={g.currency} onChange={(e) => set({ currency: e.target.value })}>
            {curs.map((c) => <option key={c} value={c}>{c}</option>)}
          </select></div>
        <div className="field"><label htmlFor="g-kind">Kind of {word}</label>
          <select id="g-kind" value={islamic ? g.kind : 'charity'} onChange={(e) => set({ kind: e.target.value as Gift['kind'] })}>
            {islamic && <option value="sadaqah">Sadaqah</option>}
            {islamic && <option value="zakat">Zakat</option>}
            <option value="charity">Charity</option>
          </select></div>
      </div>
      <div className="field"><label htmlFor="g-cause">Cause or charity (optional)</label>
        <input id="g-cause" type="text" placeholder="e.g. school fees fund" value={g.cause || ''} onChange={(e) => set({ cause: e.target.value })} /></div>
      <div className="formactions">
        <button className="btn" type="submit">Save {word}</button>
        <button className="btn plain" type="button" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

export function Giving() {
  const { data, setData, M, fx, go, toast } = useStore();
  const st = data.settings;
  const islamic = st.islamic;
  const view = getCurrency();
  const today = iso(new Date());
  const curYear = today.slice(0, 4);
  const [year, setYear] = useState(curYear);
  const [adding, setAdding] = useState(false);

  const gs = useMemo(() => givingSummary(data, M, fx, year), [data, M, fx, year]);
  const z = useMemo(() => zakatFor(data, M, fx), [data, M, fx]);
  const years = useMemo(() => {
    const s = new Set<string>([curYear]);
    for (const e of gs.entries) s.add(e.date.slice(0, 4));
    return [...s].sort().reverse();
  }, [gs.entries, curYear]);
  const shown = gs.entries.filter((e) => e.date.startsWith(year));
  const set = (p: Partial<typeof st>) => setData((d) => ({ ...d, settings: { ...d.settings, ...p } }));
  const next = st.zakatDate ? nextZakatDate(st.zakatDate, today) : null;
  const basisName = st.nisab === 'gold' ? 'gold' : 'silver';
  const nisabG = st.nisab === 'gold' ? GOLD_NISAB_G : SILVER_NISAB_G;
  const im = st.impact;
  const own = () => go('statements', 'own');

  const logZakat = () => {
    if (!(z.due > 0)) return;
    const gift: Gift = { id: 'f' + Date.now(), date: today, amount: z.due, currency: view, kind: 'zakat' };
    setData((d) => ({ ...d, gifts: [...d.gifts, gift] }));
    toast('Zakat payment logged');
  };
  const [meal, setMeal] = useState(0);
  const [school, setSchool] = useState(0);
  const saveImpact = () => { if (meal > 0 || school > 0) set({ impact: { meal, school } }); };

  const noun = islamic ? 'Sadaqah & charity' : 'Giving';

  return (
    <>
      <div className="head"><div><p className="label">{islamic ? 'Zakat & sadaqah' : 'Giving'}</p><h1>{islamic ? 'Giving and zakat' : 'Giving'}</h1></div></div>
      <div className="grid cols3">
        {islamic && (
          <Panel title="Zakat calculator" className="span3">
            <div className="form two">
              <div className="field"><label htmlFor="z-date">Zakat date (your yearly anniversary)</label>
                <input id="z-date" type="date" value={st.zakatDate || ''} onChange={(e) => set({ zakatDate: e.target.value || null })} />
                {next && <span className="small muted">Next due {dlong(next)}</span>}</div>
              <div className="field"><span className="label">Nisab basis</span>
                <div className="seg" role="group" aria-label="Nisab basis">
                  <button type="button" aria-pressed={st.nisab === 'silver'} onClick={() => set({ nisab: 'silver' })}>Silver</button>
                  <button type="button" aria-pressed={st.nisab === 'gold'} onClick={() => set({ nisab: 'gold' })}>Gold</button>
                </div></div>
            </div>
            <div className="form two">
              <div className="field"><label htmlFor="z-gold">Gold price per gram ({sym(view)})</label>
                <input id="z-gold" type="number" inputMode="decimal" step="any" min={0} value={st.goldPrice || ''} onChange={(e) => set({ goldPrice: Math.max(0, +e.target.value) })} /></div>
              <div className="field"><label htmlFor="z-silver">Silver price per gram ({sym(view)})</label>
                <input id="z-silver" type="number" inputMode="decimal" step="any" min={0} value={st.silverPrice || ''} onChange={(e) => set({ silverPrice: Math.max(0, +e.target.value) })} /></div>
            </div>
            {z.needsPrice && <p className="small" style={{ color: 'var(--bad)' }}>Enter the {basisName} price per gram to work out zakat.</p>}
            <div className="rows">
              {z.lines.map((l) => (
                <div className="row" key={l.label} style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                  <div className="t">{l.label}</div>
                  <div className="a">{l.amount < 0 ? '−' + money(-l.amount) : money(l.amount)}</div>
                  <div className="m" style={{ gridColumn: '1 / -1' }}>
                    {l.label === 'Cash & bank' ? <span>From your statements</span> : <button className="btn plain" onClick={own}>Edit</button>}
                  </div>
                </div>
              ))}
            </div>
            <div className="grid cols3" style={{ marginTop: 12 }}>
              <Kpi label="Zakatable wealth" value={money(z.wealth)} sub={<span className="small muted">{z.needsPrice ? 'Nisab unknown until you add a price' : z.above ? '✓ above nisab' : 'below nisab'} ({money(z.nisab)})</span>} />
              {!z.needsPrice && <Kpi label="Zakat due" value={money(z.due)} sub={<Explain>
                <p>{z.lines.map((l) => `${l.label} ${l.amount < 0 ? '−' + money(-l.amount) : money(l.amount)}`).join(', ')} = {money(z.wealth)}.</p>
                <p>Nisab on {basisName}: {nisabG} g × {money(basisName === 'gold' ? st.goldPrice : st.silverPrice)} = {money(z.nisab)}.</p>
                <p>{z.above ? `Your wealth is at or above the nisab, so zakat is ${pct(ZAKAT_RATE)} × ${money(z.wealth)} = ${money(z.due)}.` : 'Your wealth is below the nisab (or not above zero), so no zakat is due.'}</p>
              </Explain>} />}
            </div>
            {z.above && <div className="formactions" style={{ marginTop: 10 }}><button className="btn" onClick={logZakat}>Log zakat payment</button></div>}
          </Panel>
        )}

        <Panel title={noun} className="span3" aside={!adding && <button className="btn plain" onClick={() => setAdding(true)}>+ Log a gift</button>}>
          <div className="seg" role="group" aria-label="Year">
            {years.map((y) => <button type="button" key={y} aria-pressed={y === year} onClick={() => setYear(y)}>{y}</button>)}
          </div>
          <div className="grid cols3">
            <Kpi label={`Given in ${year}`} value={money(gs.year)} sub={<Explain>
              <p>{shown.length ? `${shown.length} ${shown.length === 1 ? 'gift' : 'gifts'} dated ${year}, added up: ${money(gs.year)}.` : `Nothing logged for ${year} yet.`} Gifts in other currencies are converted to {view}; Donations found in your statements are included.</p>
            </Explain>} />
            <Kpi label="All time" value={money(gs.allTime)} />
            <Kpi label="Share of income" value={pct(gs.pctIncome)} sub={<Explain>
              <p>{money(gs.year)} given in {year} ÷ (12 × {money(M.a3.inc)} average monthly income) = {pct(gs.pctIncome)}.</p>
            </Explain>} />
          </div>
          {adding && <div style={{ marginTop: 12 }}><GiftForm islamic={islamic} onDone={() => setAdding(false)} /></div>}
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="g-plan">Monthly giving plan ({sym(view)})</label>
            <input id="g-plan" type="number" inputMode="decimal" step="any" min={0} value={st.givingPlan || ''} onChange={(e) => set({ givingPlan: Math.max(0, +e.target.value) })} />
          </div>

          <div style={{ ...tint, marginTop: 12 }}>
            <h3>Your impact on society</h3>
            {im ? (
              <>
                <p>{gs.meals !== null ? <>About <b>{gs.meals.toLocaleString()}</b> meals</> : 'Meals: set a cost below'}{gs.schoolYears !== null && <>, or <b>{gs.schoolYears}</b> {gs.schoolYears === 1 ? 'year' : 'years'} of a child's schooling</>}.</p>
                <p className="small muted">{pct(gs.pctIncome)} of your income went to giving in {year}.</p>
                <Explain>
                  <p>Meals: {money(gs.year)} ÷ {money(im.meal)} per meal, rounded down{gs.meals !== null ? ` = ${gs.meals}` : ''}.</p>
                  <p>School years: {money(gs.year)} ÷ {money(im.school)} per child's school year{gs.schoolYears !== null ? ` = ${gs.schoolYears}` : ''}.</p>
                  <p>These use the costs you entered. <button className="btn plain" onClick={() => set({ impact: null })}>Change costs</button></p>
                </Explain>
              </>
            ) : (
              <>
                <p>Add local costs to see what your giving adds up to</p>
                <div className="form two">
                  <div className="field"><label htmlFor="i-meal">Cost of one meal ({sym(view)})</label>
                    <input id="i-meal" type="number" inputMode="decimal" step="any" min={0} value={meal || ''} placeholder="e.g. 60" onChange={(e) => setMeal(Math.max(0, +e.target.value))} /></div>
                  <div className="field"><label htmlFor="i-school">Cost of a child's school year ({sym(view)})</label>
                    <input id="i-school" type="number" inputMode="decimal" step="any" min={0} value={school || ''} placeholder="e.g. 25000" onChange={(e) => setSchool(Math.max(0, +e.target.value))} /></div>
                </div>
                <button className="btn" type="button" onClick={saveImpact}>Save costs</button>
              </>
            )}
          </div>

          {islamic && (
            <div style={{ ...tint, marginTop: 12 }}>
              <h3>Spiritual reward</h3>
              <p>Like a grain that sprouts seven ears, in every ear a hundred grains, multiplied up to 700×. <span className="small muted">(paraphrase of Quran 2:261)</span></p>
              <p>"Charity does not decrease wealth." <span className="small muted">(hadith, Muslim)</span></p>
            </div>
          )}

          <div className="rows" style={{ marginTop: 12 }}>
            {shown.length === 0 && <p className="small muted">No gifts logged for {year}.</p>}
            {shown.map((e, i) => (
              <div className="row" key={e.date + i} style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="t">{e.cause || kindLabel(e.kind, islamic)}</div>
                  <div className="m">
                    <span>{dlong(e.date)}</span>
                    <span>{kindLabel(e.kind, islamic)}</span>
                    {e.fromStatement && <span className="pill">from your statements</span>}
                  </div>
                </div>
                <div className="a" title={short(e.amount)}>{money(e.amount)}</div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
