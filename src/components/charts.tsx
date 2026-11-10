import { useEffect, useMemo, useState } from 'react';
import {
  Chart as ChartJS, BarController, BarElement, LineController, LineElement, PointElement, DoughnutController, ArcElement,
  CategoryScale, LinearScale, Tooltip, Filler, type ChartOptions
} from 'chart.js';
import { Chart, Doughnut, Line } from 'react-chartjs-2';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { money, mshort, pct, short } from '../lib/format';

ChartJS.register(BarController, BarElement, LineController, LineElement, PointElement, DoughnutController, ArcElement, CategoryScale, LinearScale, Tooltip, Filler);

/** Theme colours from CSS tokens; re-read when the system switches light/dark. */
export function useTokens() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const f = () => setV((x) => x + 1);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const t = (n: string) => cs.getPropertyValue(n).trim();
    return { fg: t('--fg'), muted: t('--muted'), line: t('--line'), accent: t('--accent'), gold: t('--gold'), surface: t('--surface'), bg: t('--bg'), body: t('--body'), key: v };
  }, [v]);
}
type Tokens = ReturnType<typeof useTokens>;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function base(t: Tokens): ChartOptions<'bar'> {
  ChartJS.defaults.font.family = t.body || 'system-ui';
  ChartJS.defaults.color = t.muted;
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: reduced() ? false : { duration: 400 },
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: t.fg, titleColor: t.bg, bodyColor: t.bg, padding: 10, cornerRadius: 8, boxPadding: 4 }
    },
    scales: {
      x: { grid: { display: false }, border: { color: t.line }, ticks: { color: t.muted, maxRotation: 0, autoSkip: true, autoSkipPadding: 8 } },
      y: { grid: { color: t.line }, border: { display: false }, ticks: { color: t.muted, callback: (v) => short(Number(v)) } }
    }
  };
}

export function FlowChart({ months, inc, exp, rate, selected }: { months: string[]; inc: number[]; exp: number[]; rate: (number | null)[]; selected: string }) {
  const t = useTokens();
  const opts = base(t) as ChartOptions<'bar'> & { scales: Record<string, unknown> };
  // Savings rate can be negative (spent more than earned). Show it down to −100%; lower values sit on that
  // floor and the tooltip gives the real figure.
  const finite = rate.filter((r): r is number => r != null && isFinite(r));
  const lo = Math.max(-1, Math.min(0, Math.floor(Math.min(0, ...finite) * 4) / 4));
  const shown = rate.map((r) => (r == null || !isFinite(r) ? null : Math.max(-1, Math.min(1, r))));
  opts.scales.y1 = { position: 'right', grid: { display: false }, border: { display: false }, min: lo, max: 1, ticks: { color: t.muted, stepSize: 0.25, callback: (v: number | string) => Math.round(Number(v) * 100) + '%' } };
  opts.plugins!.tooltip!.callbacks = { label: (c) => ((c.dataset as { yAxisID?: string }).yAxisID === 'y1' ? ' Savings rate ' + pct(Number(rate[c.dataIndex])) : ' ' + c.dataset.label + ' ' + money(Number(c.raw))) };
  const sel = (on: string, off: string) => months.map((m) => (m === selected ? on : off));
  return (
    <Chart
      key={t.key}
      type="bar"
      aria-label="Monthly money in and money out, with savings rate"
      role="img"
      options={opts}
      data={{
        labels: months.map(mshort),
        datasets: ([
          { type: 'line' as const, label: 'Savings rate', data: shown, yAxisID: 'y1', borderColor: t.fg, backgroundColor: t.fg, borderWidth: 2, pointRadius: months.map((m) => (m === selected ? 5 : 2.5)), tension: 0, spanGaps: true, order: 0 },
          { type: 'bar' as const, label: 'In', data: inc, backgroundColor: sel(t.accent, t.accent + '99'), borderRadius: 5, maxBarThickness: 22, order: 1 },
          { type: 'bar' as const, label: 'Out', data: exp, backgroundColor: sel(t.gold, t.gold + '99'), borderRadius: 5, maxBarThickness: 22, order: 1 }
        ] as any)
      }}
    />
  );
}

export function DonutChart({ labels, values, colors }: { labels: string[]; values: number[]; colors: string[] }) {
  const t = useTokens();
  return (
    <Doughnut
      key={t.key}
      aria-label="Spending by category"
      role="img"
      data={{ labels, datasets: [{ data: values, backgroundColor: colors.map((c) => (c === 'line' ? t.line : c)), borderColor: t.surface, borderWidth: 2 }] }}
      options={{ responsive: true, maintainAspectRatio: false, cutout: '70%', animation: reduced() ? false : undefined, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ' ' + c.label + ' ' + money(Number(c.raw)) } } } }}
    />
  );
}

export function BalanceChart({ months, values }: { months: string[]; values: (number | null)[] }) {
  const t = useTokens();
  const opts = base(t) as unknown as ChartOptions<'line'>;
  opts.plugins!.tooltip!.callbacks = { label: (c) => ' ' + money(Number(c.raw)) };
  return (
    <Line
      key={t.key}
      aria-label="Total bank balance by month"
      role="img"
      options={opts}
      data={{ labels: months.map(mshort), datasets: [{ data: values, borderColor: t.accent, backgroundColor: t.accent + '22', fill: true, tension: 0.3, pointRadius: months.map((_, i) => (i === months.length - 1 ? 4 : 0)), borderWidth: 2, spanGaps: true }] }}
    />
  );
}
