// v0.8.1 focus rebalance: learn is an investment (pay now ↓, wage growth later ↑), family moves family outcomes,
// health stat + health chip link to adult mortality (modest), yearly feedback summary is recorded.
import { describe, it, expect } from 'vitest';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { runLife, type LifeConfig } from '../../src/engine/life/sim.ts';
import { focusEffects, healthHazard, FOCUS_FROM } from '../../src/engine/life/focus.ts';
import type { LifeState, Action } from '../../src/engine/life/state.ts';
import { contentEvents as registry } from '../../src/engine/content/registry.ts';

const data = loadBundleFromDisk();
const cfg = (seed: string): LifeConfig => ({ seed, era: { kind: 'past', year: 1990 }, nowYear: 2026, engineVersion: 't', autoSpend: true,
  constraints: { country: { kind: 'fixed', value: 'TWN' }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } });
const N = 120;
const runS = (w: Record<string, number>) => Array.from({ length: N }, (_, i) => runLife(data, cfg(`v081-${i}`), registry, [{ t: 'focus', age: FOCUS_FROM, w } as Action]) as LifeState);
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const inc = (s: LifeState, a: number, b: number) => s.years.filter((y) => y.age >= a && y.age <= b).reduce((x, y) => x + y.income, 0);
const work = runS({ work: 3 }), learn = runS({ learn: 3 }), family = runS({ family: 3 }), health = runS({ health: 3 });

describe('v0.8.1 effects', () => {
  it('coefficients: learn costs pay now and grows wages; family cuts divorce and lifts children; health lowers hazard', () => {
    const l = focusEffects({ learn: 1 }); expect(l.incomeMult).toBeLessThan(1); expect(l.learnGrowth).toBeGreaterThan(0);
    const f = focusEffects({ family: 1 }); expect(f.divorceMult).toBeLessThan(0.6); expect(f.childAdd).toBeGreaterThan(0); expect(f.bondAdd).toBeGreaterThan(0);
    expect(focusEffects({ health: 1 }).hazardMult).toBeLessThan(1);
    expect(healthHazard(90, 40)).toBeLessThan(1); expect(healthHazard(30, 40)).toBeGreaterThan(1); expect(healthHazard(10, 3)).toBe(1);
    expect(healthHazard(0, 50)).toBeLessThanOrEqual(1.35); expect(healthHazard(100, 50)).toBeGreaterThanOrEqual(0.75);
  });
  it('learn differs from work in life-cycle shape: lower at 25–34, higher at 45–54', () => {
    expect(mean(learn.map((s) => inc(s, 25, 34))) / mean(work.map((s) => inc(s, 25, 34)))).toBeLessThan(0.97);
    expect(mean(learn.map((s) => inc(s, 45, 54))) / mean(work.map((s) => inc(s, 45, 54)))).toBeGreaterThan(1.02);
  });
  it('work vs family lifetime income stays ≥ 20% apart; family raises marriage, children and bond', () => {
    expect(mean(work.map((s) => inc(s, 0, 120))) / mean(family.map((s) => inc(s, 0, 120)))).toBeGreaterThan(1.2);
    const married = (a: LifeState[]) => mean(a.map((s) => (s.events.some((e) => e.id === 'ch_marry_marry') || s.family.spouse ? 1 : 0)));
    expect(married(family) - married(work)).toBeGreaterThan(0.07);
    expect(mean(family.map((s) => s.family.children.length)) - mean(work.map((s) => s.family.children.length))).toBeGreaterThan(0.2);
    expect(mean(family.map((s) => Number(s.flags.bond ?? 50)))).toBeGreaterThan(mean(work.map((s) => Number(s.flags.bond ?? 50))) + 10);
  });
  it('health focus lives modestly longer (adult-only), within +3 years', () => {
    const e0 = (a: LifeState[]) => mean(a.map((s) => s.death!.age));
    const d = e0(health) - e0(work); expect(d).toBeGreaterThan(0); expect(d).toBeLessThan(3);
  });
  it('yearly feedback summary is recorded for the UI', () => {
    const s = work[0]!; expect(typeof s.flags.fcLast).toBe('string');
    expect(JSON.parse(s.flags.fcLast as string)).toHaveProperty('inc');
  });
});
