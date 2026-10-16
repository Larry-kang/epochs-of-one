// Same-country, same-birth-year comparison sample for the death screen.
import { runLife, type DataBundle, type LifeConfig } from './sim.ts';
import type { LifeState } from './state.ts';
import type { EventSystem } from './events.ts';
import { sha256Hex } from '../rng/sha256.ts';
import { percentileOf } from '../economy/income.ts';

export interface Summary { lifespan: number; lifetimeIncome: number; finalNetWorth: number }
export const summarize = (s: LifeState): Summary => ({
  lifespan: (s.death?.age ?? s.age) + (s.death?.frac ?? 0),
  lifetimeIncome: s.years.reduce((a, y) => a + y.income, 0),
  finalNetWorth: s.econ.cash,
});

export function companions(data: DataBundle, s: LifeState, n: number, events?: EventSystem): Summary[] {
  const out: Summary[] = [];
  for (let i = 0; i < n; i++) {
    const cfg: LifeConfig = {
      seed: sha256Hex(`${s.seed}:companions:${i}`).slice(0, 16), era: { kind: 'past', year: s.born.year }, nowYear: s.born.year,
      constraints: { country: { kind: 'fixed', value: s.born.iso }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } },
      engineVersion: s.engineVersion,
    };
    const c = runLife(data, cfg, events);
    if (!('infeasible' in c)) out.push(summarize(c));
  }
  return out;
}

export function ranks(me: Summary, peers: Summary[]) {
  return {
    lifespan: percentileOf(peers.map((p) => p.lifespan), me.lifespan),
    lifetimeIncome: percentileOf(peers.map((p) => p.lifetimeIncome), me.lifetimeIncome),
    finalNetWorth: percentileOf(peers.map((p) => p.finalNetWorth), me.finalNetWorth),
  };
}
