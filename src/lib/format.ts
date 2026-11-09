export const SOUTH_ASIAN = ['INR', 'PKR', 'BDT', 'NPR', 'LKR'];

const PREFERRED = ['INR', 'PKR', 'USD', 'EUR', 'GBP', 'AED', 'SAR', 'BDT', 'NPR', 'LKR', 'CAD', 'AUD', 'SGD', 'MYR', 'QAR', 'KWD', 'OMR', 'BHD', 'TRY', 'IDR', 'ZAR', 'NGN', 'EGP'];
const allCodes = (): string[] => {
  try {
    return (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('currency') ?? [];
  } catch { return []; }
};
export const CURRENCIES: string[] = [...PREFERRED, ...allCodes().filter((c) => !PREFERRED.includes(c))];

const SYMS: Record<string, string> = { INR: '₹', PKR: 'Rs ', BDT: '৳', NPR: 'Rs ', LKR: 'Rs ', AED: 'AED ', SAR: 'SAR ', QAR: 'QAR ', KWD: 'KWD ', OMR: 'OMR ', BHD: 'BHD ' };

const symCache = new Map<string, string>();
export const sym = (cur: string): string => {
  if (SYMS[cur]) return SYMS[cur];
  const hit = symCache.get(cur);
  if (hit !== undefined) return hit;
  let out: string;
  try {
    const p = new Intl.NumberFormat('en', { style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find((x) => x.type === 'currency');
    out = p ? p.value : cur + ' ';
  } catch { out = cur + ' '; }
  symCache.set(cur, out);
  return out;
};

let view = 'INR';
export const setCurrency = (code: string) => { view = code || 'INR'; };
export const getCurrency = () => view;

const NF_IN = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const NF_EN = new Intl.NumberFormat('en', { maximumFractionDigits: 0 });

export const money = (n: number, cur: string = view) =>
  (n < 0 ? '−' : '') + sym(cur) + (SOUTH_ASIAN.includes(cur) ? NF_IN : NF_EN).format(Math.abs(Math.round(n || 0)));

export const short = (n: number, cur: string = view) => {
  n = n || 0;
  const a = Math.abs(n);
  const s = (n < 0 ? '−' : '') + sym(cur);
  const f = (x: number) => String(parseFloat(x.toFixed(x >= 100 ? 0 : x >= 10 ? 1 : 2)));
  if (SOUTH_ASIAN.includes(cur)) {
    if (a >= 1e7) return s + f(a / 1e7) + ' Cr';
    if (a >= 1e5) return s + f(a / 1e5) + ' L';
    if (a >= 1e3) return s + f(a / 1e3) + 'K';
  } else {
    if (a >= 1e9) return s + f(a / 1e9) + 'B';
    if (a >= 1e6) return s + f(a / 1e6) + 'M';
    if (a >= 1e3) return s + f(a / 1e3) + 'K';
  }
  return s + Math.round(a);
};

export const pct = (n: number) => (isFinite(n) ? (n * 100).toFixed(Math.abs(n) < 0.1 ? 1 : 0) : '–') + '%';

export const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const mlabel = (m: string) => { const [y, mo] = m.split('-'); return MN[+mo - 1] + ' ' + y; };
export const mshort = (m: string) => { const [y, mo] = m.split('-'); return MN[+mo - 1] + " '" + y.slice(2); };
export const dlabel = (d: string) => { const [, m, dd] = d.split('-'); return +dd + ' ' + MN[+m - 1]; };
export const dlong = (d: string) => dlabel(d) + ' ' + d.slice(0, 4);
export const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

export const addM = (m: string, k: number) => {
  let [y, mo] = m.split('-').map(Number);
  mo += k;
  while (mo > 12) { mo -= 12; y++; }
  while (mo < 1) { mo += 12; y--; }
  return y + '-' + pad(mo);
};
export const mdiff = (a: string, b: string) => {
  const [y1, m1] = a.split('-').map(Number);
  const [y2, m2] = b.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
};
export const thisMonth = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };

export const ago = (isoStr: string) => {
  const d = Math.floor((Date.now() - Date.parse(isoStr)) / 864e5);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 60 ? d + ' days ago' : Math.round(d / 30) + ' months ago';
};
