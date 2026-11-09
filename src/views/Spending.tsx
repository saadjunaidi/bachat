import { CCOL } from '../lib/categories';
import { dlabel, mlabel, money, pct } from '../lib/format';
import { priorAvg, type ATxn } from '../lib/model';
import { useStore, type Filter } from '../store';
import { Chip, Dot, EmptyState, Panel } from '../components/ui';

const FILTERS: [Filter, string][] = [['all', 'All'], ['out', 'Money out'], ['in', 'Money in'], ['unk', 'Needs a category']];

function TxRow({ t, onOpen }: { t: ATxn; onOpen: () => void }) {
  return (
    <button className="row" onClick={onOpen}>
      <span style={{ minWidth: 0 }}>
        <span className="t" style={{ display: 'block' }}>{t.payee}</span>
        <span className="m"><span>{dlabel(t.date)}</span><Chip cat={t.cat} /><span className="ellipsis">{t.acct}</span></span>
      </span>
      <span className={'a ' + (t.amt > 0 ? 'in' : '')}>{t.amt > 0 ? '+' : '−'}{money(Math.abs(t.amt))}</span>
    </button>
  );
}

export function Spending() {
  const { M, month: m, ui, setUi, go } = useStore();
  if (!m) return <EmptyState title="No spending yet" onImport={() => go('statements')} />;
  const o = M.MO[m];
  const cats = Object.entries(o.cats).filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...cats.map((c) => c[1]));
  const fcat = ui.cat && o.cats[ui.cat] != null ? ui.cat : null;
  const q = ui.q.trim().toLowerCase();
  let list = M.A.filter((t) => t.m === m);
  if (fcat) list = list.filter((t) => t.cat === fcat);
  if (ui.flt === 'out') list = list.filter((t) => t.amt < 0);
  else if (ui.flt === 'in') list = list.filter((t) => t.amt > 0);
  else if (ui.flt === 'unk') list = list.filter((t) => t.cat === 'Uncategorized' || t.cat === 'Other UPI payments');
  if (q) list = list.filter((t) => (t.desc + ' ' + t.payee + ' ' + t.cat).toLowerCase().includes(q));
  list = list.slice().reverse();

  return (
    <>
      <div className="head">
        <div><p className="label">Spending</p><h1>{mlabel(m)}</h1></div>
        <p className="muted small num">{money(o.exp)} spent · {o.n} transactions</p>
      </div>
      <div className="grid cols3">
        <Panel title="By category" aside={fcat && <button className="linkbtn small" onClick={() => setUi({ cat: null })}>Show all</button>}>
          <div className="rows">
            {cats.length ? cats.map(([c, v]) => {
              const pa = priorAvg(M, m, c);
              const d = pa ? (v - pa) / pa : null;
              return (
                <button key={c} className="catrow" aria-pressed={c === fcat} onClick={() => setUi({ cat: c === fcat ? null : c, lim: 60 })}>
                  <span className="cname"><Dot color={CCOL[c]} /><span>{c}</span></span>
                  <span className="num" style={{ fontWeight: 600 }}>{money(v)}</span>
                  <span className="track"><i style={{ width: Math.max(2, (v / max) * 100) + '%', background: CCOL[c] }} /></span>
                  <span className="small muted" style={{ gridColumn: '1/-1' }}>
                    {pct(v / Math.max(1, o.exp))} of spending
                    {d != null && isFinite(d) && <> · <span className={d > 0 ? 'down' : 'up'}>{d > 0 ? '▲' : '▼'} {pct(Math.abs(d))}</span> vs 3-month average</>}
                  </span>
                </button>
              );
            }) : <p className="empty">No spending this month.</p>}
          </div>
        </Panel>
        <Panel className="span2" title={fcat || 'Transactions'} aside={<span className="small muted">{list.length} shown · tap one to change its category</span>}>
          <div className="toolbar">
            <input type="search" placeholder="Search payee or description" value={ui.q} onChange={(e) => setUi({ q: e.target.value, lim: 60 })} aria-label="Search transactions" />
            <div className="seg" role="group" aria-label="Filter">
              {FILTERS.map(([k, l]) => <button key={k} aria-pressed={ui.flt === k} onClick={() => setUi({ flt: k, lim: 60 })}>{l}</button>)}
            </div>
          </div>
          <div className="rows">
            {list.length ? list.slice(0, ui.lim).map((t) => <TxRow key={t.id} t={t} onOpen={() => setUi({ tx: t.id })} />) : <p className="empty">No transactions match.</p>}
          </div>
          {list.length > ui.lim && <button className="btn plain" onClick={() => setUi({ lim: ui.lim + 60 })}>Show {Math.min(60, list.length - ui.lim)} more</button>}
        </Panel>
      </div>
    </>
  );
}
