import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Data } from './lib/types';
import { build, defaultMonth, type Model } from './lib/model';
import { loadData, saveData } from './lib/storage';
import { sampleData } from './lib/sample';

export type View = 'overview' | 'spending' | 'goals' | 'statements';
export const VIEWS: View[] = ['overview', 'spending', 'goals', 'statements'];
export type Filter = 'all' | 'out' | 'in' | 'unk';

export interface UI { month: string | null; cat: string | null; flt: Filter; q: string; lim: number; editGoal: string | null; tx: string | null }

interface Store {
  data: Data;
  setData: (f: (d: Data) => Data) => void;
  M: Model;
  month: string | null;
  ui: UI;
  setUi: (p: Partial<UI>) => void;
  toast: (m: string) => void;
  toastMsg: string | null;
  view: View;
  go: (v: View, anchor?: string) => void;
}

const Ctx = createContext<Store | null>(null);

const readView = (): View => {
  const h = location.hash.slice(1);
  return (VIEWS as string[]).includes(h) ? (h as View) : 'overview';
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setDataRaw] = useState<Data>(() => loadData() ?? sampleData());
  const [ui, setUiRaw] = useState<UI>({ month: null, cat: null, flt: 'all', q: '', lim: 60, editGoal: null, tx: null });
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [view, setView] = useState<View>(() => {
    const d = loadData();
    if (d && !d.sample && !d.txns.length && !location.hash) return 'statements';
    return readView();
  });
  const timer = useRef<number>(0);
  const anchor = useRef<string | null>(null);

  const setData = useCallback((f: (d: Data) => Data) => {
    setDataRaw((prev) => {
      const next = f(prev);
      if (!saveData(next)) setToastMsg("Couldn't save on this device. Your browser may be in private mode or out of space.");
      return next;
    });
  }, []);
  const setUi = useCallback((p: Partial<UI>) => setUiRaw((u) => ({ ...u, ...p })), []);
  const toast = useCallback((m: string) => {
    setToastMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToastMsg(null), 3400);
  }, []);

  useEffect(() => {
    const f = () => {
      setView(readView());
      if (anchor.current) {
        const id = anchor.current; anchor.current = null;
        setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      } else window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);

  const go = useCallback((v: View, a?: string) => {
    anchor.current = a ?? null;
    if (location.hash.slice(1) === v) {
      if (a) document.getElementById(a)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else window.scrollTo(0, 0);
      setView(v);
    } else location.hash = v;
  }, []);

  const M = useMemo(() => build(data), [data]);
  const month = defaultMonth(M, ui.month);

  const value = useMemo(() => ({ data, setData, M, month, ui, setUi, toast, toastMsg, view, go }), [data, setData, M, month, ui, setUi, toast, toastMsg, view, go]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
