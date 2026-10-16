// v0.8.0 yearly focus: life-stage chips, shares → weights, effects, closest-chip swaps (logged), auto policy, calibration.
import { describe, it, expect } from 'vitest';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { newLife, advanceYear, applyAction, runLife, type LifeConfig } from '../../src/engine/life/sim.ts';
import { focusStage, chipsFor, weights, focusEffects, mapToStage, autoAlloc, activeAlloc, FOCUS_FROM, type StageCtx } from '../../src/engine/life/focus.ts';
import type { Chip } from '../../src/engine/life/focus.ts';
import type { LifeState } from '../../src/engine/life/state.ts';
import { contentEvents as registry } from '../../src/engine/content/registry.ts';

const ctx = (o: Partial<StageCtx>): StageCtx => ({ age: 30, studying: false, uni: false, inLabor: true, unemployed: false, retired: false, ...o });
const data = loadBundleFromDisk();
const cfg = (seed: string, autoFocus = false): LifeConfig => ({ seed, era: { kind: 'past', year: 1970 }, nowYear: 2026, engineVersion: 't', ...(autoFocus ? { autoFocus } : {}),
  constraints: { country: { kind: 'fixed', value: 'TWN' }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } });

describe('v0.8.0 focus: stages and chips', () => {
  it('none under 6', () => { expect(focusStage(ctx({ age: 5, inLabor: false }))).toBe('none'); expect(chipsFor('none')).toEqual([]); expect(FOCUS_FROM).toBe(6); });
  it('student chips; part-time and career only at university', () => {
    expect(chipsFor(focusStage(ctx({ age: 12, studying: true, inLabor: false })))).toEqual(['study', 'play', 'help', 'sport', 'hobby']);
    expect(chipsFor(focusStage(ctx({ age: 20, studying: true, uni: true, inLabor: false })))).toEqual(['study', 'play', 'help', 'parttime', 'career', 'sport', 'hobby']);
  });
  it('working, not working, elderly', () => {
    expect(chipsFor(focusStage(ctx({})))).toEqual(['work', 'balance', 'family', 'health', 'learn', 'hobby']);
    expect(chipsFor(focusStage(ctx({ unemployed: true })))).toEqual(['family', 'health', 'learn', 'hobby', 'rest']);
    expect(chipsFor(focusStage(ctx({ age: 70, inLabor: false, retired: true })))).toEqual(['family', 'health', 'learn', 'hobby', 'rest', 'mind', 'faith']);
  });
});

describe('v0.8.0 focus: weights and effects', () => {
  it('shares of the year become weights summing to 1', () => {
    expect(weights({ work: 2, health: 1, learn: 1 })).toEqual({ work: 0.5, health: 0.25, learn: 0.25 });
    expect(weights({})).toEqual({}); expect(weights({ work: 0 })).toEqual({});
  });
  it('work: income × (1 + 0.1W) and promotion up; learn: promotion + job change up, costs 2%·W; health costs 2%·W; family: marriage/parenting up, promotion slightly down', () => {
    const w = focusEffects({ work: 1 }); expect(w.incomeMult).toBeCloseTo(1.1); expect(w.promoMult).toBeGreaterThan(1);
    const l = focusEffects({ learn: 1 }); expect(l.promoMult).toBeGreaterThan(1); expect(l.jobMult).toBeGreaterThan(1); expect(l.costShare).toBeCloseTo(0.02);
    const h = focusEffects({ health: 0.5 }); expect(h.costShare).toBeCloseTo(0.01); expect(h.fx.health).toBeGreaterThan(0);
    const f = focusEffects({ family: 1 }); expect(f.marryAdd).toBeGreaterThan(0); expect(f.familyMult).toBeGreaterThan(1); expect(f.promoMult).toBeLessThan(1);
    expect(focusEffects({ parttime: 1 }).parttime).toBe(1); expect(focusEffects({ study: 1 }).schoolAdd).toBeGreaterThan(0);
    const none = focusEffects({}); expect([none.incomeMult, none.promoMult, none.jobMult, none.familyMult]).toEqual([1, 1, 1, 1]); expect(none.costShare).toBe(0);
  });
});

describe('v0.8.0 focus: stage swaps', () => {
  it('maps to the closest chip of the new stage and back when the stage returns', () => {
    const intended = { work: 2, learn: 1 };
    const idle = mapToStage(intended, 'idle');
    expect(Object.keys(idle).every((k) => chipsFor('idle').includes(k as Chip))).toBe(true);
    expect(idle.learn).toBeGreaterThan(0);
    expect(mapToStage(intended, 'work')).toEqual(intended);
    expect(Object.keys(mapToStage({ study: 1, parttime: 1, career: 1 }, 'work')).sort()).toEqual(['learn', 'work']);
  });
  it('auto policy is deterministic and only uses chips of the stage', () => {
    for (const st of ['school', 'uni', 'work', 'idle', 'elder'] as const) {
      const a = autoAlloc(st, { health: 50, happy: 50, smart: 50, social: 50 }, 'seed', 30);
      expect(a).toEqual(autoAlloc(st, { health: 50, happy: 50, smart: 50, social: 50 }, 'seed', 30));
      expect(Object.keys(a).length).toBeGreaterThan(0);
      for (const k of Object.keys(a)) expect(chipsFor(st)).toContain(k);
    }
  });
  it('engine: a chosen focus persists, swaps are logged as fc_switch events, and switch back', () => {
    let s = newLife(data, cfg('focus-swap')) as LifeState;
    while (s.age < 7) s = advanceYear(data, s, registry);
    s = applyAction(data, s, { t: 'focus', age: s.age, w: { study: 2, play: 1 } });
    expect(activeAlloc(s.actions, s.age)).toEqual({ study: 1 }); // v0.8.1 single-select: a legacy multi-chip pick collapses to its largest share
    while (!s.death && s.age < 45) s = advanceYear(data, s, registry);
    const sw = s.events.filter((e) => e.id === 'fc_switch');
    expect(sw.length).toBeGreaterThan(0);
  });
});

describe('v0.8.0 focus: calibration (comparison-life Monte Carlo)', () => {
  const N = 60;
  const run = (auto: boolean) => Array.from({ length: N }, (_, i) => runLife(data, cfg(`mc-${i}`, auto), registry) as LifeState);
  const off = run(false), on = run(true);
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const life = (s: LifeState) => s.years.reduce((a, y) => a + y.income, 0);
  it('auto focus keeps e0 within 2% (the m2 calibration band) and never changes deaths before 15 (v0.8.1 health→hazard link is adult-only)', () => {
    const e0 = (a: LifeState[]) => mean(a.map((s) => s.death!.age + s.death!.frac));
    expect(Math.abs(e0(on) / e0(off) - 1)).toBeLessThan(0.02);
    on.forEach((s, i) => { if (off[i]!.death!.age < 15 || s.death!.age < 15) expect(s.death!.age).toBe(off[i]!.death!.age); });
  });
  it('mean lifetime income stays within ±8% and final net worth within ±20%', () => {
    const ri = mean(on.map(life)) / mean(off.map(life));
    const nw = (s: LifeState) => s.years.at(-1)!.netWorth;
    const rn = mean(on.map(nw)) / mean(off.map(nw));
    console.log(`auto focus: income ×${ri.toFixed(3)}, net worth ×${rn.toFixed(3)}`);
    expect(ri).toBeGreaterThan(0.92); expect(ri).toBeLessThan(1.08);
    expect(rn).toBeGreaterThan(0.8); expect(rn).toBeLessThan(1.2);
  });
  it('companions are simulated with auto focus (focus is part of the comparison)', () => {
    expect(on.filter((s) => (s.death?.age ?? 99) >= 6).every((s) => s.events.some((e) => e.id === 'fc_switch' || e.id === 'fc_auto'))).toBe(true);
  });
});
