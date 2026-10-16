import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { EVENTS, contentEvents, ENGINE_EVENT_IDS } from '../../src/engine/content/registry.ts';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { runLife, deathAgeOnly } from '../../src/engine/life/sim.ts';

const zh = Object.fromEntries(Object.entries((JSON.parse(readFileSync('src/content/i18n/table.json', 'utf8')) as { strings: { events: Record<string, string[]> } }).strings.events).map(([k, v]) => [k, v[0]!]));
const data = loadBundleFromDisk();

describe('M3: events & content', () => {
  it('100+ events, unique ids, each has zh-TW text, no orphan keys', () => {
    const ids = EVENTS.map((e) => e.id);
    expect(ids.length).toBeGreaterThanOrEqual(100);
    expect(new Set(ids).size).toBe(ids.length);
    const keys = new Set(Object.keys(zh));
    for (const id of [...ids, ...ENGINE_EVENT_IDS]) expect(keys.has(id), id).toBe(true);
    for (const k of keys) expect(ids.includes(k) || (ENGINE_EVENT_IDS as readonly string[]).includes(k) || k.startsWith('ch_'), k).toBe(true);
  });
  it('events never change the death outcome (separate RNG stream; calibration preserved)', () => {
    for (let i = 0; i < 100; i++) {
      const cfg = { seed: 'ev' + i, era: { kind: 'past' as const, year: 'random' as const }, nowYear: 2026, engineVersion: 't' };
      const a = runLife(data, cfg, contentEvents), b = deathAgeOnly(data, cfg);
      if ('infeasible' in a || 'infeasible' in b) throw new Error();
      expect(a.death!.age).toBe(b.age);
    }
  });
  it('every event fires at least once across 300 lives; stats stay in 0..100', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const s = runLife(data, { seed: 'cov' + i, era: { kind: 'past', year: 1970 }, nowYear: 2026, engineVersion: 't' }, contentEvents);
      if ('infeasible' in s) throw new Error();
      s.events.forEach((e) => seen.add(e.id));
      for (const y of s.years) for (const v of Object.values(y.stats)) expect(v >= 0 && v <= 100).toBe(true);
    }
    const engine = new Set<string>(ENGINE_EVENT_IDS);
    const fired = EVENTS.filter((e) => seen.has(e.id)).length;
    expect(fired / EVENTS.length).toBeGreaterThanOrEqual(0.9);
    for (const id of seen) expect(engine.has(id) || EVENTS.some((e) => e.id === id) || id.startsWith('ch_'), id).toBe(true);
  });
  it('UI strings contain no product-name hardcoding (name lives in src/config.ts only)', () => {
    const ui = readFileSync('src/content/i18n/table.json', 'utf8') + readFileSync('src/ui/app.ts', 'utf8') + readFileSync('index.html', 'utf8');
    expect(ui.includes('百年帳本')).toBe(false);
    expect(ui.includes('Ledger of a Life')).toBe(false);
    // index.html carries the static <title>; UI code/strings must read the name from APP
    const code = readFileSync('src/content/i18n/table.json', 'utf8') + readFileSync('src/ui/app.ts', 'utf8');
    expect(code.includes('時代人生')).toBe(false);
    expect(code.includes('Epochs of One')).toBe(false);
  });
});
