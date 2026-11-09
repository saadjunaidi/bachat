import { useEffect, type ReactElement } from 'react';
import { mlabel, ago } from './lib/format';
import { useStore, type View } from './store';
import { Overview } from './views/Overview';
import { Spending } from './views/Spending';
import { Goals } from './views/Goals';
import { Statements } from './views/Statements';
import { TxSheet } from './components/TxSheet';

const TABS: { v: View; label: string; icon: ReactElement }[] = [
  { v: 'overview', label: 'Overview', icon: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /> },
  { v: 'spending', label: 'Spending', icon: <><circle cx="12" cy="12" r="9" /><path d="M12 3v9l6.5 6.2" /></> },
  { v: 'goals', label: 'Goals', icon: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></> },
  { v: 'statements', label: 'Statements', icon: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M12 12v6M9 15l3 3 3-3" /></> }
];

function Banner() {
  const { data, view, go } = useStore();
  if (data.sample) {
    return (
      <div className="banner">
        <p><b>You're looking at sample data.</b> Import your own bank statement to see your real numbers. Nothing leaves your device.</p>
        <button className="btn" onClick={() => go('statements')}>Import a statement</button>
      </div>
    );
  }
  const stale = !data.lastBackup || Date.now() - Date.parse(data.lastBackup) > 30 * 864e5;
  if (data.txns.length && stale && view !== 'statements') {
    return (
      <div className="banner">
        <p><b>{data.lastBackup ? `Your last backup was ${ago(data.lastBackup)}.` : "Your data isn't backed up yet."}</b> It lives only in this browser. Save a backup so you can restore it on another device.</p>
        <button className="btn" onClick={() => go('statements', 'bk')}>Back up now</button>
      </div>
    );
  }
  return null;
}

export default function App() {
  const { view, go, M, month, setUi, toastMsg } = useStore();
  const showMonth = M.months.length > 0 && (view === 'overview' || view === 'spending');

  useEffect(() => { document.title = 'Bachat · ' + TABS.find((t) => t.v === view)!.label; }, [view]);

  return (
    <>
      <header className="appbar">
        <div className="wrap bar">
          <a className="brand" href="#overview" onClick={(e) => { e.preventDefault(); go('overview'); }}>
            <img src="/icons/icon.svg" alt="" width={26} height={26} />Bachat
          </a>
          <nav className="tabs" aria-label="Sections">
            {TABS.map((t) => <button key={t.v} className="tab" aria-current={view === t.v ? 'page' : undefined} onClick={() => go(t.v)}>{t.label}</button>)}
          </nav>
          {showMonth && (
            <label className="monthpick">
              <span className="sr">Month</span>
              <select value={month ?? ''} onChange={(e) => setUi({ month: e.target.value, cat: null, lim: 60 })}>
                {M.months.slice().reverse().map((m) => <option key={m} value={m}>{mlabel(m)}{M.isComplete(m) ? '' : ' (so far)'}</option>)}
              </select>
            </label>
          )}
        </div>
      </header>

      <div className="wrap"><Banner /></div>

      <main className="wrap view">
        {view === 'overview' && <Overview />}
        {view === 'spending' && <Spending />}
        {view === 'goals' && <Goals />}
        {view === 'statements' && <Statements />}
      </main>

      <nav className="bottomnav" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t.v} className="bn" aria-current={view === t.v ? 'page' : undefined} onClick={() => go(t.v)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{t.icon}</svg>
            {t.label}
          </button>
        ))}
      </nav>

      <TxSheet />
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </>
  );
}
