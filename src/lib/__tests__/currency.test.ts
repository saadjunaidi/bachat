import { afterEach, describe, expect, it } from 'vitest';
import { money, short, setCurrency, getCurrency, sym, CURRENCIES, SOUTH_ASIAN } from '../format';
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
  });
});
