import { CCOL } from '../lib/categories';
import { addM, dlong, mlabel, money, pct, short } from '../lib/format';
import { insights } from '../lib/model';
import { toPayDebts } from '../lib/debt';
import { ratesNote } from '../lib/fx';
import { kindOf } from '../lib/types';
import { useStore } from '../store';
import { BalanceChart, DonutChart, FlowChart } from '../components/charts';
import { Delta, Dot, EmptyState, Explain, Kpi, Panel } from '../components/ui';

export function Overview() {
  const { M, month: m, go, P, data, fx } = useStore();
  if (!m) return <EmptyState title="No transactions yet" onImport={() => go('statements')} />;
  const o = M.MO[m];
  const p = M.MO[addM(m, -1)];
  const cats = Object.entries(o.cats).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const rest = cats.slice(6).reduce((s, [, v]) => s + v, 0);
  const donut: [string, number][] = cats.slice(0, 6).concat(rest > 0 ? [['Everything else', rest]] : []);
  const payees: Record<string, number> = {};
  M.A.filter((t) => t.m === m && t.type === 'expense' && t.amt < 0).forEach((t) => { payees[t.payee] = (payees[t.payee] || 0) - t.amt; });
  const tp = Object.entries(payees).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const ms = M.months.slice(-12);
  const partial = !M.isComplete(m);
  const lt = P.longTerm;
  const ltName = data.settings.longTerm.type === 'retirement' ? 'Retirement' : 'Financial freedom';
  const debtLine = P.lines.find((l) => l.key === 'debt');
  const ltLine = P.lines.find((l) => l.key === 'longTerm');
  // Same gate as Debts: only cards carried month to month and loans have a payoff date (a card paid in full has none).
  const hasDebts = toPayDebts(data, fx).length > 0;
  const banks = M.names.filter((n) => kindOf(data.accounts[n]) === 'bank').length;
  const a = data.assets;
  const rates = ratesNote([
    ...M.names.filter((n) => kindOf(data.accounts[n]) === 'bank').map((n) => data.accounts[n]?.currency || data.settings.currency),
    ...data.debts.map((x) => x.currency),
    ...(a.investments || a.owed || a.stock || a.other ? [a.currency] : [])
  ], fx);
  // Largest goal taking money this month, for the "nothing left over" line.
  const topGoal = P.goals.reduce<{ id: string; monthly: number } | null>((b, r) => (r.monthly > 0 && (!b || r.monthly > b.monthly) ? r : b), null);
  const topGoalName = topGoal ? data.goals.find((g) => g.id === topGoal.id)?.name ?? null : null;
  const owned = M.bankBal + M.assetsTotal;
  const pillCls = lt.status === 'behind' ? 'bad' : 'good';
  const pillTxt = lt.status === 'ahead' ? 'Ahead of target' : lt.status === 'on' ? 'On track' : 'Behind target';

  return (
    <>
      <div className="head">
        <div><p className="label">{partial ? 'Month so far' : 'Month summary'}</p><h1>{mlabel(m)}</h1></div>
        {M.end && <p className="muted small">Statements up to {dlong(M.end)}</p>}
      </div>
      <div className="grid kpis">
        <Kpi hero label="Guilt-free this month" value={P.ready ? short(P.guiltFree) : '–'} sub={<>
          <span className="small muted">{!P.ready ? 'Import a full month of statements to see this.'
            : P.shortfall > 0 ? `Short ${short(P.shortfall)}/mo.${P.biggest ? ` ${P.biggest} is the biggest.` : ''}`
            : P.guiltFree < 1 ? (topGoalName ? `Nothing left over this month — your goals use the rest. ${topGoalName} is the biggest.` : 'Nothing left over this month — your plan uses the rest.')
            : 'Yours to enjoy. Goals, debts and giving are already covered.'}</span>
          {P.ready && <Explain><p>{P.explain}</p>{P.lines.map((l) => <p key={l.key}><b>{l.label}:</b> {l.explain}</p>)}</Explain>}
        </>} />
        <Kpi label="Net worth" value={short(M.netWorth)} sub={<>
          <span className="small muted">{short(owned)} owned − {short(M.debtTotal)} owed</span>
          <Explain><p>Bank balances {short(M.bankBal)} + other assets {short(M.assetsTotal)} − debts {short(M.debtTotal)} = {short(M.netWorth)}{rates ? `, converted at today's rate (${rates})` : ''}.</p></Explain>
        </>} />
        {hasDebts && <Kpi label="Debt-free by" value={P.debtFree ? mlabel(P.debtFree) : 'Never at minimums'} sub={<>
          <button className="linkbtn small" onClick={() => go('debts')}>See the plan</button>
          <Explain><p>{debtLine?.explain}</p><p>Strategy: {data.settings.strategy === 'snowball' ? 'smallest balance first' : 'highest interest first'}.</p></Explain>
        </>} />}
        <Kpi label={ltName} value={lt.projected ? lt.projected.slice(0, 4) : '–'} sub={lt.status === 'needAge'
          ? <button className="linkbtn small" onClick={() => go('goals')}>Set your age on Goals</button>
          : <>
            <span><span className={'pill ' + pillCls}>{pillTxt}</span></span>
            <Explain><p>{ltLine?.explain}</p>{lt.targetMonth && <p>Target month: {mlabel(lt.targetMonth)}.</p>}</Explain>
          </>} />
      </div>
      <div className="grid kpis">
        <Kpi label="Saved" value={short(o.saved)} sub={<span className="small muted">{isFinite(o.rate) ? pct(o.rate) + ' of income' : 'No income this month'}</span>} />
        <Kpi label="Money in" value={short(o.inc)} sub={<Delta cur={o.inc} prev={p?.inc} goodUp />} />
        <Kpi label="Spent" value={short(o.exp)} sub={<Delta cur={o.exp} prev={p?.exp} goodUp={false} />} />
        <Kpi label="In the bank" value={M.hasBal ? short(M.totalBal) : '–'} sub={<span className="small muted">{banks} bank account{banks === 1 ? '' : 's'}</span>} />
      </div>
      <div className="grid cols3">
        <Panel className="span2" title="Money in vs money out" aside={
          <div className="legend-inline">
            <span><Dot color="var(--accent)" />In</span><span><Dot color="var(--gold)" />Out</span><span><i className="dot line" />Savings rate</span>
          </div>}>
          <div className="chart">
            <FlowChart months={ms} selected={m} inc={ms.map((x) => M.MO[x].inc)} exp={ms.map((x) => M.MO[x].exp)}
              rate={ms.map((x) => { const r = M.MO[x].rate; return isFinite(r) ? Math.max(0, Math.min(1, r)) : null; })} />
          </div>
        </Panel>
        <Panel title="Worth knowing">
          <div className="insights">
            {insights(M, m).map((i) => <div key={i.t} className={'ins ' + i.tone}><div><b>{i.t}</b><p>{i.d}</p></div></div>)}
          </div>
        </Panel>
        <Panel title="Where it went" aside={<button className="linkbtn small" onClick={() => go('spending')}>See all</button>}>
          {donut.length ? (
            <div className="donut-wrap">
              <div className="donut">
                <DonutChart labels={donut.map((d) => d[0])} values={donut.map((d) => d[1])} colors={donut.map(([c]) => (c === 'Everything else' ? 'line' : CCOL[c]))} />
                <div className="center"><span className="label">Spent</span><b className="num">{short(o.exp)}</b></div>
              </div>
              <div className="legend">
                {donut.map(([c, v]) => (
                  <div className="lg" key={c}><Dot color={c === 'Everything else' ? 'var(--line)' : CCOL[c]} /><span className="ellipsis">{c}</span><span className="amt">{short(v)}</span></div>
                ))}
              </div>
            </div>
          ) : <p className="empty">No spending this month.</p>}
        </Panel>
        <Panel title="Biggest payments to">
          <div className="rows">
            {tp.length ? tp.map(([n, v]) => <div className="row" key={n}><span className="t">{n}</span><span className="a">{money(v)}</span></div>) : <p className="empty">Nothing yet.</p>}
          </div>
        </Panel>
        <Panel title="Total in the bank" aside={<span className="small muted">month-end balance</span>}>
          {M.hasBal ? <div className="chart sm"><BalanceChart months={ms} values={M.trend.slice(-12)} /></div>
            : <p className="muted small">Choose the Balance column when importing to see this.</p>}
        </Panel>
      </div>
    </>
  );
}
