export const mrate = (yearly: number) => Math.pow(1 + yearly, 1 / 12) - 1;

/** Monthly saving needed to grow `saved` to `target` in `n` months at a yearly return. */
export function needed(target: number, saved: number, n: number, yearly: number): number {
  const r = mrate(yearly);
  if (n <= 0) return target > saved ? Infinity : 0;
  const fv = saved * Math.pow(1 + r, n);
  if (fv >= target) return 0;
  return r ? ((target - fv) * r) / (Math.pow(1 + r, n) - 1) : (target - fv) / n;
}

/** Months until `saved` plus a monthly saving reaches `target`; Infinity if not within 100 years. */
export function monthsTo(target: number, saved: number, pmt: number, yearly: number): number {
  const r = mrate(yearly);
  if (saved >= target) return 0;
  let b = saved;
  for (let k = 1; k <= 1200; k++) { b = b * (1 + r) + pmt; if (b >= target) return k; }
  return Infinity;
}

/**
 * Years until someone starting from zero can live off investments, given only their savings rate.
 * Income is 1 a month: they save `rate` and spend `1 − rate`; they're free at `mult` × yearly spending.
 * Null when they save nothing (never), 0 when they spend nothing.
 */
export function yearsToFreedom(rate: number, realYearly: number, mult: number): number | null {
  if (!isFinite(rate) || rate <= 0) return null;
  if (rate >= 1) return 0;
  const k = monthsTo(mult * 12 * (1 - rate), 0, rate, realYearly);
  return isFinite(k) ? k / 12 : null;
}
