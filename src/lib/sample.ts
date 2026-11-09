import { blank, type Data } from './types';
import { iso, MN } from './format';

/** Realistic, clearly-labelled demo data so the first view shows what the app does. */
export function sampleData(): Data {
  const s = blank();
  s.sample = true;
  s.settings.age = '33';
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const ri = (a: number, b: number) => Math.round(a + rnd() * (b - a));
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const bal: Record<string, number> = { 'HDFC Savings': 640000, 'Kotak Savings': 1180000 };
  const ev: { acct: string; date: string; desc: string; amt: number }[] = [];
  const now = new Date();
  // Six full months ending last month
  for (let k = 6; k >= 1; k--) {
    const ref = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const y = ref.getFullYear(), mo = ref.getMonth();
    const E = (acct: string, day: number, desc: string, amt: number) => ev.push({ acct, date: iso(new Date(y, mo, Math.min(day, 28))), desc, amt });
    const M = MN[mo].toUpperCase();
    E('HDFC Savings', 1, `NEFT CR-ACME TECHNOLOGIES PVT LTD-SALARY ${M}${String(y).slice(2)}`, 185000);
    E('HDFC Savings', 2, `UPI/HOUSE RENT ${M}/rkverma@okaxis/Sent using`, -42000);
    E('HDFC Savings', 5, 'ACH D- ICICI PRU MF SIP', -25000);
    E('HDFC Savings', 12, 'BIL/BPAY/BSES RAJDHANI ELECTRICITY', -ri(2200, 5400));
    E('HDFC Savings', 14, 'UPI/AIRTEL POSTPAID/airtel@ybl/Sent using', -999);
    E('HDFC Savings', 16, 'POS 4521XXXX NETFLIX.COM', -649);
    E('HDFC Savings', 16, 'UPI/Apple Services/appleservices@icici/collect', -ri(199, 2500));
    for (let n = ri(5, 8); n--;) E('HDFC Savings', ri(1, 28), `UPI/${pick(['Blinkit', 'Zepto', 'BigBasket'])}/payu@hdfcbank/UPIIntent`, -ri(300, 2800));
    for (let n = ri(6, 10); n--;) E('HDFC Savings', ri(1, 28), `UPI/${pick(['SWIGGY', 'ZOMATO'])}/order@icici/Sent using`, -ri(250, 950));
    for (let n = ri(4, 7); n--;) E('HDFC Savings', ri(1, 28), 'UPI/Uber India/uber@axis/Payment', -ri(150, 620));
    for (let n = ri(2, 4); n--;) E('HDFC Savings', ri(1, 28), `UPI/${pick(['Amazon Pay', 'Myntra', 'Flipkart'])}/pay@apl/Payment`, -ri(600, 6500));
    for (let n = ri(2, 4); n--;) E('HDFC Savings', ri(1, 28), `UPI/${pick(['RAHUL SHARMA', 'IMRAN KHAN', 'PRIYA NAIR', 'MOHD ARIF'])}/upi@okhdfc/Sent using`, -ri(500, 6000));
    E('HDFC Savings', ri(1, 28), 'UPI/Apollo Pharmacy/apollo@hdfc/Payment', -ri(300, 2200));
    E('Kotak Savings', ri(3, 12), 'ATW/6924/NFC DELHI ATM', -ri(2, 5) * 5000);
    E('Kotak Savings', ri(7, 20), 'Recd:IMPS/6091239/BRIGHTLABS FREELANCE INVOICE/IMPS', ri(40000, 95000));
    E('HDFC Savings', 20, 'IMPS/OWN ACCOUNT TRANSFER TO KOTAK', -30000);
    E('Kotak Savings', 20, 'IMPS/OWN ACCOUNT TRANSFER FROM HDFC', 30000);
    if (k === 4 || k === 1) E('Kotak Savings', 28, 'Int.Pd:4449500473 SB INTEREST', ri(5000, 9000));
    if (k === 3) E('HDFC Savings', 18, 'UPI/LIC OF INDIA/lic@sbi/Premium', -28000);
    if (k === 2) { E('HDFC Savings', 9, 'UPI/INDIGO AIRLINES/indigo@icici/Payment', -14200); E('HDFC Savings', 10, 'UPI/MAKEMYTRIP/mmt@hdfc/Hotel', -9800); }
    if (k === 1) { E('HDFC Savings', 22, 'UPI/ZARA INDIA/zara@icici/Payment', -ri(8000, 16000)); E('Kotak Savings', 18, 'PCI/6924/GOFUNDME HOT MEALS', -5000); }
  }
  ev.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  ev.forEach((e, i) => {
    bal[e.acct] += e.amt;
    s.txns.push({ id: `${e.acct}|${e.date}|${e.amt}|sample${i}`, acct: e.acct, date: e.date, desc: e.desc, amt: e.amt, bal: Math.round(bal[e.acct] * 100) / 100, seq: i });
  });
  s.accounts = { 'HDFC Savings': { name: 'HDFC Savings', kind: 'bank', currency: 'INR' }, 'Kotak Savings': { name: 'Kotak Savings', kind: 'bank', currency: 'INR' } };
  const y = now.getFullYear();
  s.goals = [
    { id: 'g1', name: '₹50 lakh savings', price: 5000000, currency: 'INR', date: `${y + 1}-06`, saved: 0, ret: 7, stretchChoice: 'wait' },
    { id: 'g2', name: 'Car down payment', price: 400000, currency: 'INR', date: `${y + 1}-12`, saved: 60000, ret: 7, stretchChoice: 'wait' }
  ];
  return s;
}
