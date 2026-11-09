import { useState, type ReactNode } from 'react';
import { CCOL } from '../lib/categories';
import { money, pct } from '../lib/format';

export function Kpi({ label, value, sub, hero }: { label: string; value: ReactNode; sub?: ReactNode; hero?: boolean }) {
  return (
    <div className={'kpi' + (hero ? ' hero' : '')}>
      <span className="label">{label}</span>
      <span className="v">{value}</span>
      {sub}
    </div>
  );
}

export function Delta({ cur, prev, goodUp }: { cur: number; prev: number | null | undefined; goodUp: boolean }) {
  if (prev == null || !isFinite(prev) || prev === 0) return null;
  const d = (cur - prev) / Math.abs(prev);
  const up = d >= 0;
  const good = goodUp ? up : !up;
  return <span className={'delta ' + (good ? 'up' : 'down')}>{up ? '▲' : '▼'} {pct(Math.abs(d))} vs prev. month</span>;
}

export function Chip({ cat }: { cat: string }) {
  return <span className="chip"><i style={{ background: CCOL[cat] || '#888' }} />{cat}</span>;
}

export function Dot({ color }: { color: string }) {
  return <i className="dot" style={{ background: color }} />;
}

export function Panel({ title, aside, className, children, id }: { title?: ReactNode; aside?: ReactNode; className?: string; children: ReactNode; id?: string }) {
  return (
    <article className={'panel' + (className ? ' ' + className : '')} id={id}>
      {(title || aside) && <div className="panel-h">{title && <h2>{title}</h2>}{aside}</div>}
      {children}
    </article>
  );
}

export function EmptyState({ title, onImport }: { title: string; onImport: () => void }) {
  return (
    <div className="panel"><div className="empty">
      <h2>{title}</h2>
      <p style={{ margin: '8px 0 14px' }}>Import a bank statement to get started.</p>
      <button className="btn" onClick={onImport}>Import a statement</button>
    </div></div>
  );
}

/** Two-tap confirmation for destructive actions. */
export function ConfirmButton({ children, confirmText, onConfirm, className = 'btn danger' }: { children: ReactNode; confirmText: string; onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false);
  return (
    <button className={className} onClick={() => (armed ? onConfirm() : setArmed(true))} onBlur={() => setArmed(false)}>
      {armed ? confirmText : children}
    </button>
  );
}

export function Explain({ children }: { children: ReactNode }) {
  return (
    <details className="explain">
      <summary>How we worked this out</summary>
      <div className="explain-b">{children}</div>
    </details>
  );
}

export function FxNote({ orig }: { orig: { amt: number; cur: string } | null }) {
  if (!orig) return null;
  return <span className="fxnote small muted">{money(orig.amt, orig.cur)} ({orig.cur})</span>;
}
