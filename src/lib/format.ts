const NF = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export const money = (n: number) => (n < 0 ? '−' : '') + '₹' + NF.format(Math.abs(Math.round(n || 0)));

export const short = (n: number) => {
  n = n || 0;
  const a = Math.abs(n);
  const s = n < 0 ? '−' : '';
  const f = (x: number) => String(parseFloat(x.toFixed(x >= 100 ? 0 : x >= 10 ? 1 : 2)));
  if (a >= 1e7) return s + '₹' + f(a / 1e7) + ' Cr';
  if (a >= 1e5) return s + '₹' + f(a / 1e5) + ' L';
  if (a >= 1e3) return s + '₹' + f(a / 1e3) + 'K';
  return s + '₹' + Math.round(a);
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
