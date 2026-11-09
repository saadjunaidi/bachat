import { useEffect, useRef, useState } from 'react';
import { CURRENCIES } from '../lib/format';
import { foreignCurrencies } from '../lib/fx';
import { useStore } from '../store';

/** Bottom sheet (phones) / dialog (desktop) for app settings. */
export function Settings() {
  const { ui, setUi, data, setData, M, fx, fxLoading } = useStore();
  const ref = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const open = ui.settingsOpen;

  useEffect(() => {
    if (!open) return;
    setDraft({});
    const prev = document.activeElement as HTMLElement | null;
    setTimeout(() => ref.current?.querySelector<HTMLElement>('select,input')?.focus(), 30);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setUi({ settingsOpen: false }); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const close = () => setUi({ settingsOpen: false });
  const s = data.settings;
  const set = (p: Partial<typeof s>) => setData((d) => ({ ...d, settings: { ...d.settings, ...p } }));
  const curs = foreignCurrencies(data);
  const view = s.currency.toUpperCase();
  const opts = CURRENCIES.includes(view) ? CURRENCIES : [view, ...CURRENCIES];

  let status: string | null = null;
  if (curs.length) {
    const date = fx.today?.date;
    if (M.fxMissing.length && fxLoading) status = null;
    else if (M.fxMissing.length) status = `No rate for ${M.fxMissing.join(', ')}. Enter one below.`;
    else if (fx.failed) status = `Couldn't update rates (offline). Using ${date || 'saved rates'}`;
    else if (date) status = `Rates from ${date}`;
  }

  return (
    <div className="sheet-back" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="set-t" ref={ref}>
        <div className="panel-h"><h2 id="set-t">Settings</h2></div>
        <div className="field">
          <label htmlFor="set-cur">Currency</label>
          <select id="set-cur" value={view} onChange={(e) => set({ currency: e.target.value })}>
            {opts.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <label className="check"><input type="checkbox" checked={s.islamic} onChange={(e) => set({ islamic: e.target.checked })} /> Islamic guidance</label>
        <div className="field">
          <label htmlFor="set-age">Current age</label>
          <input id="set-age" type="number" inputMode="numeric" min={0} max={120} value={s.age} onChange={(e) => set({ age: e.target.value })} />
        </div>
        {curs.length > 0 && (
          <div className="field">
            <p className="label">Exchange rates</p>
            {status && <p className="small muted" role="status">{status}</p>}
            {curs.map((c) => (
              <div className="fxrow" key={c}>
                <span className="small">1 {c} = ? {view}</span>
                <input
                  type="number" min={0} step="any" inputMode="decimal" aria-label={`Manual rate for ${c}`}
                  placeholder={fx.today?.r[c] ? (1 / fx.today.r[c]).toPrecision(4) : 'Rate'}
                  value={draft[c] ?? (s.fxOverrides[c] != null ? String(s.fxOverrides[c]) : '')}
                  onChange={(e) => {
                    setDraft((x) => ({ ...x, [c]: e.target.value }));
                    const v = parseFloat(e.target.value);
                    if (e.target.value.trim() !== '' && !(isFinite(v) && v > 0)) return;
                    const next = { ...s.fxOverrides };
                    if (v > 0) next[c] = v; else delete next[c];
                    set({ fxOverrides: next });
                  }}
                />
              </div>
            ))}
          </div>
        )}
        <div className="formactions"><button className="btn" onClick={close}>Done</button></div>
      </div>
    </div>
  );
}
