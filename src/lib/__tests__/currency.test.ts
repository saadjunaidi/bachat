import { afterEach, describe, expect, it } from 'vitest';
import { money, niceStep, short, setCurrency, getCurrency, sym, CURRENCIES, SOUTH_ASIAN } from '../format';
import { num } from '../parse';

afterEach(() => setCurrency('INR'));

describe('currency formatting', () => {
  it('defaults to INR', () => {
    expect(getCurrency()).toBe('INR');
    expect(money(185000)).toBe('₹1,85,000');
    expect(short(1234567)).toBe('₹12.3 L');
  });
  it('formats South Asian currencies with lakh/crore', () => {
    expect(money(185000, 'PKR')).toBe('Rs 1,85,000');
    expect(short(12345678, 'PKR')).toBe('Rs 1.23 Cr');
  });
  it('formats others with western grouping', () => {
    expect(money(1500, 'USD')).toBe('$1,500');
    expect(short(2_500_000, 'USD')).toBe('$2.5M');
    expect(short(-4200, 'EUR')).toBe('−€4.2K');
    expect(money(1500, 'AED')).toBe('AED 1,500');
  });
  it('uses the view currency', () => {
    setCurrency('USD');
    expect(money(10)).toBe('$10');
    expect(sym(getCurrency())).toBe('$');
  });
  it('exports lists', () => {
    expect(SOUTH_ASIAN).toEqual(['INR', 'PKR', 'BDT', 'NPR', 'LKR']);
    expect(CURRENCIES.slice(0, 3)).toEqual(['INR', 'PKR', 'USD']);
  });
});

describe('num with currencies', () => {
  it('strips symbols and codes', () => {
    expect(num('$1,234.50')).toBe(1234.5);
    expect(num('€ 99')).toBe(99);
    expect(num('PKR 1,000')).toBe(1000);
    expect(num('Rs. 500 Dr')).toBe(500);
    expect(num('AED -20')).toBe(-20);
    expect(num('1e5')).toBe(100000);
  });
});

describe('niceStep', () => {
  it('rounds max ÷ 100 to 1, 2 or 5 × 10^k, at least 1', () => {
    expect(niceStep(50000)).toBe(500); // 500 → 5 × 100
    expect(niceStep(18400)).toBe(200); // 184 → 1.84 × 100 → 2 × 100
    expect(niceStep(3000)).toBe(20); // 30 → 3 × 10 → 2 × 10
    expect(niceStep(7500)).toBe(100); // 75 → 7.5 × 10 → 10 × 10
    expect(niceStep(1200)).toBe(10); // 12 → 1.2 × 10 → 1 × 10
    expect(niceStep(80)).toBe(1); // 0.8 → min 1
    expect(niceStep(0)).toBe(1);
  });
});
