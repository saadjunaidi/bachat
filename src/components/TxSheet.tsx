import { useEffect, useRef, useState } from 'react';
import { CATS, CCOL, TYPE_LABEL } from '../lib/categories';
import { dlong, money } from '../lib/format';
import type { CatType } from '../lib/types';
import { useStore } from '../store';
import { FxNote } from './ui';

const GROUPS: CatType[] = ['income', 'expense', 'investment', 'transfer'];

/** Bottom sheet (phones) / dialog (desktop) to change a transaction's category. */
export function TxSheet() {
  const { ui, setUi, M, setData, toast } = useStore();
  const t = ui.tx ? M.A.find((x) => x.id === ui.tx) : null;
  const [pick, setPick] = useState('');
  const [all, setAll] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!t) return;
    setPick(t.cat);
    setAll(t.payee !== 'ATM cash');
    const prev = document.activeElement as HTMLElement | null;
    setTimeout(() => ref.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus(), 30);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setUi({ tx: null }); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.tx]);

  if (!t) return null;
  const close = () => setUi({ tx: null });
  const save = () => {
    setData((d) => {
      if (all && t.payee !== 'ATM cash') {
        const overrides = { ...d.overrides };
        for (const x of M.A) if (x.payee === t.payee) delete overrides[x.id];
        return { ...d, rules: { ...d.rules, [t.payee.toLowerCase()]: pick }, overrides };
      }
      return { ...d, overrides: { ...d.overrides, [t.id]: pick } };
    });
    close();
    toast(`Saved as ${pick}`);
  };

  return (
    <div className="sheet-back" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sh-t" ref={ref}>
        <div className="panel-h">
          <div style={{ minWidth: 0 }}>
            <p className="label">{dlong(t.date)} · {t.acct}</p>
            <h2 id="sh-t">{t.payee}</h2>
          </div>
          <b className={'num ' + (t.amt > 0 ? 'up' : '')}>{t.amt > 0 ? '+' : '−'}{money(Math.abs(t.amt))}</b>
        </div>
        {t.orig && <p className="small muted">Original amount: <FxNote orig={t.orig} /></p>}
        <p className="small muted" style={{ overflowWrap: 'anywhere' }}>{t.desc}</p>
        {GROUPS.map((g) => (
          <div key={g}>
            <p className="label" style={{ marginBottom: 6 }}>{TYPE_LABEL[g]}</p>
            <div className="catgrid">
              {CATS.filter((c) => c[1] === g).map(([c]) => (
                <button key={c} aria-pressed={c === pick} onClick={() => setPick(c)}>
                  <i className="dot" style={{ background: CCOL[c] }} />{c}
                </button>
              ))}
            </div>
          </div>
        ))}
        {t.payee !== 'ATM cash' && (
          <label className="check"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Use this for every payment to or from “{t.payee}”</label>
        )}
        <div className="formactions">
          <button className="btn" onClick={save}>Save</button>
          <button className="btn plain" onClick={close}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
