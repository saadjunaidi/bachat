import { describe, expect, it } from 'vitest';
import { mergeData } from '../backup';
import { blank, kindOf, migrate } from '../types';

const v1 = () => ({
  txns: [],
  goals: [{ id: 'g1', name: 'Car', target: 500000, date: '2027-06', link: true, saved: 9, ret: 7 }],
  settings: { mult: 25, ret: 10, infl: 5, age: '33' }
});

describe('migrate', () => {
  it('converts a v1 object', () => {
    const d = migrate(v1());
    expect(d.goals[0]).toMatchObject({ price: 500000, saved: 0, currency: 'INR', stretchChoice: 'wait' });
    expect(d.settings.longTerm.mult).toBe(25);
    expect(d.settings.longTerm.ret).toBe(10);
    expect(d.settings.longTerm.infl).toBe(5);
    expect(d.settings.age).toBe('33');
    expect(d.notice).toBe('goalsMigrated');
    expect(d.debts).toEqual([]);
    expect('mult' in d.settings).toBe(false);
  });
  it('keeps saved for unlinked goals and sets no notice', () => {
    const d = migrate({ txns: [], goals: [{ id: 'g', name: 'x', target: 10, date: '2027-01', link: false, saved: 4, ret: 7 }], settings: {} });
    expect(d.goals[0].saved).toBe(4);
    expect(d.notice).toBeUndefined();
  });
  it('is idempotent', () => {
    const once = migrate(v1());
    expect(migrate(once)).toEqual(once);
    expect(migrate(blank())).toEqual(blank());
  });
  it('leaves account kind unset and kindOf defaults to bank', () => {
    const d = migrate({ txns: [], accounts: { A: { name: 'A' } } });
    expect('kind' in d.accounts.A).toBe(false);
    expect(kindOf(d.accounts.A)).toBe('bank');
    expect(kindOf(undefined)).toBe('bank');
    expect(kindOf({ name: 'C', kind: 'card' })).toBe('card');
  });
  it('picks impact defaults by currency', () => {
    expect(migrate({ txns: [], settings: { currency: 'PKR' } }).settings.impact).toEqual({ meal: 200, school: 60000 });
    expect(migrate({ txns: [], settings: { currency: 'USD' } }).settings.impact).toBeNull();
  });
  it('migrates goals of a v1 backup when merging', () => {
    const b = { app: 'bachat', v: 1, at: '', state: { txns: [], goals: [{ id: 'g9', name: 'Car', target: 500000, date: '2027-06', link: false, saved: 100, ret: 7 }] } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = mergeData(blank(), b as any);
    expect(data.goals[0].price).toBe(500000);
    expect(data.goals[0].saved).toBe(100);
  });
});
