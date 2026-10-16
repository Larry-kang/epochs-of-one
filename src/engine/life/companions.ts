// Same-country, same-birth-year comparison sample for the death screen.
import { runLife, type DataBundle, type LifeConfig } from './sim.ts';
import type { LifeState } from './state.ts';
import type { EventSystem } from './events.ts';
import { sha256Hex } from '../rng/sha256.ts';

export interface Summary { lifespan: number; lifetimeIncome: number; finalNetWorth: number }
/** adults only are compared on money (a child who dies has no income or wealth of their own) */
export const ADULT_AGE = 18;
export const summarize = (s: LifeState): Summary => ({
  lifespan: (s.death?.age ?? s.age) + (s.death?.frac ?? 0),
  lifetimeIncome: s.years.reduce((a, y) => a + y.income, 0),
  finalNetWorth: s.years.length ? s.years[s.years.length - 1]!.netWorth : 0,
});

export function companions(data: DataBundle, s: LifeState, n: number, events?: EventSystem): Summary[] {
  const out: Summary[] = [];
  for (let i = 0; i < n; i++) {
    const cfg: LifeConfig = {
      seed: sha256Hex(`${s.seed}:companions:${i}`).slice(0, 16), era: { kind: 'past', year: s.born.year }, nowYear: s.born.year,
      constraints: { country: { kind: 'fixed', value: s.born.iso }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } },
      engineVersion: s.engineVersion, autoFocus: true, autoSpend: true,
    };
    const c = runLife(data, cfg, events);
    if (!('infeasible' in c)) out.push(summarize(c));
  }
  return out;
}

/** Share of peers strictly below ("beats X%"): ties never count as beaten. Money ranks are null for lives that ended
 *  before adulthood and are computed among adult peers only. */
export const beats = (sample: number[], x: number) => (sample.length ? sample.filter((v) => v < x).length / sample.length : 0);
export function ranks(me: Summary, peers: Summary[]): { lifespan: number; lifetimeIncome: number | null; finalNetWorth: number | null } {
  const adults = peers.filter((p) => p.lifespan >= ADULT_AGE);
  const adult = me.lifespan >= ADULT_AGE && adults.length > 0;
  return {
    lifespan: beats(peers.map((p) => p.lifespan), me.lifespan),
    lifetimeIncome: adult ? beats(adults.map((p) => p.lifetimeIncome), me.lifetimeIncome) : null,
    finalNetWorth: adult ? beats(adults.map((p) => p.finalNetWorth), me.finalNetWorth) : null,
  };
}
