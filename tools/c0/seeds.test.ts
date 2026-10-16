// C0 helper: find e2e seeds whose life (first option always picked, like the e2e loop) reaches switch / startup / illicit cards early.
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { newLife, advanceYear, applyAction, pendingOffers, type LifeConfig } from '../../src/engine/life/sim.ts';
import type { LifeState } from '../../src/engine/life/state.ts';
import { contentEvents as registry } from '../../src/engine/content/registry.ts';
it('seeds', () => {
  const data = loadBundleFromDisk(); const found: Record<string, [string, number][]> = { switch: [], startup: [], illicit: [] };
  for (const [iso, y] of [['TWN', 1990], ['IND', 1990]] as const) for (let i = 0; i < 400; i++) {
    const seed = `c0e-${iso}-${i}`;
    const cfg: LifeConfig = { seed, era: { kind: 'past', year: y }, nowYear: 2026, engineVersion: 'x', occ: true, constraints: { country: { kind: 'fixed', value: iso as never }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } };
    let s = newLife(data, cfg) as LifeState; const seen = new Set<string>();
    while (!s.death && s.age < 45) {
      for (let k = 0; k < 6; k++) { const o = pendingOffers(data, s)[0]; if (!o) break; if (o.id in found && !seen.has(o.id)) { seen.add(o.id); found[o.id]!.push([`${iso}:${seed}`, s.age]); } s = applyAction(data, s, { t: 'choice', age: s.age, id: o.id, opt: o.id === 'illicit' ? 'refuse' : o.opts[0]! } as never); }
      s = advanceYear(data, s, registry);
    }
  }
  writeFileSync('c0-seeds.json', JSON.stringify(Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.sort((a, b) => a[1] - b[1]).slice(0, 6)]))));
}, 600000);
