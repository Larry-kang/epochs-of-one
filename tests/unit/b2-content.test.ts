// Batch 2 C1/C2: ≥200 event types, ≥180 decisions, all with original text, policy-compliant fact keys, sane pacing.
import { describe, it, expect } from 'vitest';
import pool from '../../src/content/pool/content.json';
import table from '../../src/content/i18n/table.json';
const events = Object.fromEntries(Object.entries(table.strings.events as Record<string, (string | null)[]>).map(([k, v]) => [k, v[0] ?? '']));
const decText = Object.fromEntries(Object.entries(table.strings.decisions as Record<string, (string | null)[]>).map(([k, v]) => [k, v[0] ?? '']));
import { EVENTS } from '../../src/engine/content/registry.ts';
import { MINOR, CHOICE_ORDER } from '../../src/engine/life/choices.ts';
import { FACT_KEYS, factFor } from '../../src/ui/logic/facts.ts';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { runLife, type LifeConfig } from '../../src/engine/life/sim.ts';
import { contentEvents } from '../../src/engine/content/registry.ts';
import type { LifeState } from '../../src/engine/life/state.ts';

const ev = events as Record<string, string>, dt = decText as Record<string, string>;
const data = loadBundleFromDisk();

describe('B2 content pool', () => {
  it('has at least 200 event types and 180 decisions', () => {
    expect(EVENTS.length).toBeGreaterThanOrEqual(200);
    expect(CHOICE_ORDER.length + MINOR.length).toBeGreaterThanOrEqual(180);
  });
  it('every event and decision option has zh-TW text; ids are unique', () => {
    for (const e of EVENTS) expect(ev[e.id], e.id).toBeTruthy();
    const ids = new Set<string>();
    for (const d of MINOR) {
      expect(ids.has(d.id)).toBe(false); ids.add(d.id);
      expect(dt['ct_' + d.id], d.id).toBeTruthy();
      expect(d.opts.length).toBeGreaterThanOrEqual(2); expect(d.opts.length).toBeLessThanOrEqual(5);
      for (const o of d.opts) { expect(dt[`o_${d.id}_${o.id}`]).toBeTruthy(); expect(ev[`ch_${d.id}_${o.id}`]).toBeTruthy(); }
    }
  });
  it('every decision cites an allowed source (WPP / WDI) and the fact resolves for real countries', () => {
    const c = data.country('TWN'), demo = data.demography('TWN');
    for (const d of pool.decisions) {
      expect(FACT_KEYS).toContain(d.fact);
      const f = factFor(d.id, c, '台灣', 2000, demo, data.wpp);
      expect(f, d.id).not.toBeNull();
      expect(f!.cite).toMatch(/CC BY (3\.0 IGO|4\.0)/);
    }
  });
  it('pacing: a typical life sees 8–30 small decisions, never two cards in the same year from the small pool', () => {
    const n: number[] = [];
    for (let i = 0; i < 40; i++) {
      const s = runLife(data, { seed: `pace-${i}`, era: { kind: 'past', year: 1970 }, nowYear: 2026, engineVersion: 't' } as LifeConfig, contentEvents) as LifeState;
      const minor = s.events.filter((e) => e.id.startsWith('ch_d_'));
      const perYear = new Map<number, number>(); for (const e of minor) perYear.set(e.age, (perYear.get(e.age) ?? 0) + 1);
      for (const v of perYear.values()) expect(v).toBe(1);
      if (s.death!.age >= 60) n.push(minor.length);
    }
    const mean = n.reduce((a, b) => a + b, 0) / n.length;
    expect(mean).toBeGreaterThanOrEqual(8); expect(mean).toBeLessThanOrEqual(30);
  });
});
