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
