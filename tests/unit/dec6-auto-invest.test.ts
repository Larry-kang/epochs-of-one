// Item 6: auto-decide invests by savings, age and risk; never when savings <= 0.
import { describe, it, expect } from 'vitest';
import { autoInvestTarget } from '../../src/engine/finance/autoInvest.ts';

const all = () => true;
const base = { cash: 100, invested: 0, consumption: 20, age: 30, debt: 0, canBuy: all };

describe('autoInvestTarget', () => {
  it('never invests when savings are zero or negative', () => {
    expect(autoInvestTarget({ ...base, cash: 0 })).toEqual({});
    expect(autoInvestTarget({ ...base, cash: -50, invested: 500 })).toEqual({});
  });
  it('does not invest with unsecured debt or under 18', () => {
    expect(autoInvestTarget({ ...base, debt: 1 })).toEqual({});
    expect(autoInvestTarget({ ...base, age: 17 })).toEqual({});
  });
  it('sets the equity share by age within 20–80%', () => {
    expect(autoInvestTarget({ ...base, cash: 1000 }).eqWorld).toBeCloseTo(0.8);
    expect(autoInvestTarget({ ...base, cash: 1000, age: 60 }).eqWorld).toBeCloseTo(0.5);
    expect(autoInvestTarget({ ...base, cash: 1000, age: 95 }).eqWorld).toBeCloseTo(0.2);
  });
  it('keeps one year of spending as an emergency fund', () => {
    expect(autoInvestTarget({ ...base, cash: 30 }).eqWorld).toBeCloseTo(10 / 30);
    expect(autoInvestTarget({ ...base, cash: 20.5 })).toEqual({});
  });
  it('scales by risk', () => {
    expect(autoInvestTarget({ ...base, cash: 1000, risk: 'low' }).eqWorld).toBeCloseTo(0.48);
    expect(autoInvestTarget({ ...base, cash: 1000, age: 60, risk: 'high' }).eqWorld).toBeCloseTo(0.6);
  });
  it('falls back to the home index, or nothing when no equity can be bought', () => {
    expect(autoInvestTarget({ ...base, cash: 1000, canBuy: (a) => a === 'eqHome' })).toEqual({ eqHome: 0.8 });
    expect(autoInvestTarget({ ...base, cash: 1000, canBuy: () => false })).toEqual({});
  });
});

import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { runLife, type LifeConfig } from '../../src/engine/life/sim.ts';
import type { LifeState } from '../../src/engine/life/state.ts';
import type { Action } from '../../src/engine/life/state.ts';
import { contentEvents } from '../../src/engine/content/registry.ts';

const data = loadBundleFromDisk();
const cfg = (seed: string, iso = 'TWN'): LifeConfig => ({ seed, era: { kind: 'past', year: 1970 }, nowYear: 2026, engineVersion: 't', occ: true,
  constraints: { country: { kind: 'fixed', value: iso }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } });
const AUTO: Action[] = [{ t: 'life', age: 15, key: 'auto', value: 'on' }];
const lives = (n: number, actions: Action[], iso = 'TWN') => Array.from({ length: n }, (_, i) => runLife(data, cfg(`dec6-${iso}-${i}`, iso), contentEvents, actions) as LifeState);

describe('auto-decide invests in the simulation', () => {
  it('auto lives invest, and never hold investments in a year that ends with savings <= 0', () => {
    const ls = lives(12, AUTO);
    expect(ls.some((s) => s.years.some((y) => y.invested > 0))).toBe(true);
    for (const s of ls) for (const y of s.years) if (y.cash <= 0) expect(y.invested).toBe(0);
  }, 60_000);
  it('lives without auto never invest on their own', () => {
    for (const s of lives(6, [])) expect(s.years.every((y) => y.invested === 0)).toBe(true);
  }, 60_000);
  it('a manual allocation switches the auto policy off for good', () => {
    const manual: Action[] = [...AUTO, { t: 'alloc', age: 25, target: { gold: 0.1 } }];
    for (const s of lives(6, manual)) if (!s.death || s.death.age > 26) expect(s.portfolio.target).toEqual({ gold: 0.1 });
  }, 60_000);
});
