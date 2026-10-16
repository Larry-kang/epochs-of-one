// v0.8.1 release fixes: cleared focus has no effect, pendingOffers sees last year's focus, single-select focus,
// reopen snapshot + v0.7 save fixtures, service-worker precache freshness.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { newLife, advanceYear, applyAction, pendingOffers, focusInForce, hazardMult, incomeDist, type LifeConfig } from '../../src/engine/life/sim.ts';
import { offersAt } from '../../src/engine/life/choices.ts';
import { cohortTfr } from '../../src/engine/life/fertility.ts';
import { single, activeAlloc, autoAlloc } from '../../src/engine/life/focus.ts';
import type { LifeState, Action } from '../../src/engine/life/state.ts';
import { contentEvents as registry } from '../../src/engine/content/registry.ts';
import { precachePlugin } from '../../scripts/precache-plugin.ts';

const data = loadBundleFromDisk();
const cfg = (seed: string, iso = 'TWN'): LifeConfig => ({ seed, era: { kind: 'past', year: 1980 }, nowYear: 2026, engineVersion: 't',
  constraints: { country: { kind: 'fixed', value: iso as never }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } });
const grow = (s: LifeState, to: number) => { while (!s.death && s.age < to) s = advanceYear(data, s, registry); return s; };
const alive = (seed: string, age: number): LifeState => { for (let k = 0; ; k++) { const s = grow(newLife(data, cfg(`${seed}-${k}`)) as LifeState, age); if (!s.death) return s; } };

describe('cleared focus is no effect', () => {
  it('focusInForce treats "{}", null, undefined, zero weights and malformed values as none', () => {
    for (const v of ['{}', null, undefined, '', '{"work":0}', 'not json', '[]', 'null']) expect(focusInForce({ fcEff: v as never })).toBeUndefined();
    expect(focusInForce({ fcEff: '{"health":1}' })).toBeDefined();
  });
  it('after clearing, the adult hazard equals the no-focus baseline (1) and the feedback line is gone', () => {
    let s = alive('clr', 25);
    s = applyAction(data, s, { t: 'focus', age: s.age, w: { health: 1 } });
    s = grow(s, 30); expect(s.death).toBeUndefined();
    expect(hazardMult(s)).not.toBe(1);
    s = applyAction(data, s, { t: 'focus', age: s.age, w: {} });
    s = advanceYear(data, s, registry);
    expect(s.flags.fcEff).toBe('{}');
    expect(hazardMult(s)).toBe(1);
    expect(s.flags.fcLast).toBeUndefined();
  });
});

describe('pendingOffers uses last year\'s focus effect', () => {
  it('matches offersAt with the focus in force at every age, and family focus changes the offer set somewhere', () => {
    let differs = 0;
    for (let i = 0; i < 40; i++) {
      let s = alive(`po-${i}`, 21);
      s = applyAction(data, s, { t: 'focus', age: s.age, w: { family: 1 } });
      while (!s.death && s.age < 45) {
        const c = data.country(s.cur), calYear = s.born.year + s.age;
        const base = { s, c, calYear, meanIncome: incomeDist(c, calYear).d.mean, tfr: cohortTfr(data.wpp, s.born.iso, s.born.year) };
        const fx = focusInForce(s.flags);
        const want = offersAt({ ...base, ...(fx ? { focus: fx } : {}) }).map((o) => o.id);
        expect(pendingOffers(data, s).map((o) => o.id)).toEqual(want);
        if (want.join() !== offersAt(base).map((o) => o.id).join()) differs++;
        // answer every pending card the way the default would, so the life continues like an auto run
        s = advanceYear(data, s, registry);
      }
    }
    expect(differs).toBeGreaterThan(0);
  });
});

describe('single-select focus', () => {
  it('collapses multi-chip allocations deterministically to the largest share (ties: chip order)', () => {
    expect(single({ work: 2, family: 1 })).toEqual({ work: 1 });
    expect(single({ family: 1, work: 1 })).toEqual({ work: 1 });
    expect(single({ work: 1, family: 1 })).toEqual({ work: 1 });
    expect(single({ hobby: 0, rest: 0 })).toEqual({});
    expect(single(autoAlloc('work', { health: 50, happy: 50, smart: 50, social: 50 }, 's', 30))).toEqual({ work: 1 });
  });
  it('old saves with several chips replay with exactly one chip in force', () => {
    const acts: Action[] = [{ t: 'focus', age: 25, w: { work: 1, balance: 1, family: 3 } }, { t: 'focus', age: 30, id: 'workHard' }];
    expect(activeAlloc(acts, 26)).toEqual({ family: 1 });
    expect(activeAlloc(acts, 31)).toEqual({ work: 1 });
    let s = alive('ss', 25); s = applyAction(data, s, acts[0]!); s = advanceYear(data, s, registry);
    expect(Object.keys(JSON.parse(String(s.flags.fcEff)) as object)).toEqual(['family']);
  });
});

describe('v0.7 save fixtures and the reopen snapshot', () => {
  const fx = JSON.parse(readFileSync('tests/fixtures/v07-storage.json', 'utf8')) as Record<string, unknown>;
  let save: typeof import('../../src/storage/save.ts');
  beforeAll(async () => {
    const m = new Map<string, string>(Object.entries(fx).map(([k, v]) => [k, JSON.stringify(v)]));
    (globalThis as { window?: unknown }).window = { localStorage: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } };
    save = await import('../../src/storage/save.ts');
  });
  it('loads a v0.7 in-progress save and past life without throwing; old lives carry no snapshot', () => {
    const sv = save.loadSave(); expect(sv?.cfg.seed).toBe('v07-alive');
    const lives = save.pastLives(); expect(lives).toHaveLength(1); expect(lives[0]!.rec).toBeUndefined();
  });
  it('an old (v0.6.0-engine) past life replayed under the current engine is run on to a death', () => {
    const l = save.pastLives()[0]!;
    let s = newLife(data, l.cfg!) as LifeState;
    for (let i = 0; i < (l.years ?? 200) && !s.death; i++) s = advanceYear(data, s, registry);
    for (let i = 0; i < 200 && !s.death; i++) s = advanceYear(data, s, registry);
    expect(s.death).toBeDefined();
  });
  it('a new past life stores its snapshot and keeps it on reload', () => {
    save.addPastLife({ id: 'x', seed: 'x', iso: 'TWN', name: 'x', year: 2000, age: 70, netWorth: 1, at: 2070, rec: { rk: { lifespan: 0.4, lifetimeIncome: 0.5, finalNetWorth: null }, peersN: 400 } });
    expect(save.pastLives()[0]!.rec).toEqual({ rk: { lifespan: 0.4, lifetimeIncome: 0.5, finalNetWorth: null }, peersN: 400 });
    expect(save.pastLives()).toHaveLength(2);
  });
  it('repairs or drops bad past-life entries (missing name, null, partial) and never throws', () => {
    const ls = (globalThis as { window?: { localStorage: { setItem: (k: string, v: string) => void } } }).window!.localStorage;
    ls.setItem('epochs.lives.v1', JSON.stringify([{ id: 'a', seed: 's', iso: 'TW', age: 40 }, null, 7, 'x', [], { seed: 'only-seed' }, { name: 'no id' }, { id: 'b', name: 'B', year: 1990, age: 'x', cfg: { seed: 1 }, actions: [null, { t: 'focus', age: 6, w: { work: 1 } }] }, { id: 'a', name: 'dup' }]));
    const l = save.pastLives();
    expect(l.map((x) => x.id)).toEqual(['a', 'only-seed-', 'b']);
    expect(l[0]!.name).toBe('s'); expect(l[0]!.at).toBe(40); expect(l[0]!.netWorth).toBe(0);
    expect(l[2]!.age).toBe(0); expect(l[2]!.cfg).toBeUndefined(); expect(l[2]!.actions).toHaveLength(1);
    for (const x of l) expect(typeof x.name).toBe('string');
    ls.setItem('epochs.lives.v1', '{"not":"an array"}'); expect(save.pastLives()).toEqual([]);
    ls.setItem('epochs.lives.v1', 'null'); expect(save.pastLives()).toEqual([]);
  });
  it('garbage in storage never throws', async () => {
    (globalThis as { window?: { localStorage: { setItem: (k: string, v: string) => void } } }).window!.localStorage.setItem('epochs.lives.v1', '{bad');
    expect(save.pastLives()).toEqual([]);
  });
});

describe('service worker precache', () => {
  it('fetches with cache: reload, serves navigations network-first and only from its own cache', () => {
    let code = '';
    const p = precachePlugin() as unknown as { generateBundle: (this: { emitFile: (f: { source: string }) => void }, o: unknown, b: Record<string, unknown>) => void };
    p.generateBundle.call({ emitFile: (f) => { code = f.source; } }, {}, { 'assets/a.js': { type: 'chunk', code: 'x' } });
    expect(code).toContain("cache: 'reload'");
    expect(code).toContain("e.request.mode === 'navigate'");
    expect(code).toContain('cacheName: CACHE');
    expect(code).not.toContain('c.addAll(FILES)');
  });
});

describe('happiest-year caption', () => {
  it('never uses a hardship line (fever, illness, loss…), also for infant deaths', async () => {
    const { ending } = await import('../../src/engine/life/ending.ts');
    const { runLife } = await import('../../src/engine/life/sim.ts');
    let infants = 0;
    for (let i = 0; i < 150; i++) {
      const s = runLife(data, { ...cfg(`hap-${i}`, i % 2 ? 'SOM' : 'TWN') }, registry) as LifeState;
      const e = ending(s, 1000);
      if (s.death!.age < 6) infants++;
      if (e.happiest?.eventId) expect(e.happiest.eventId).not.toMatch(/fever|sick|ill|death|loss/);
    }
    expect(infants).toBeGreaterThan(0);
  });
});
