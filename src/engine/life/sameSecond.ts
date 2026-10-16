// Batch 2 P12: "people born the same second as you". A small deterministic world sample (birth country drawn by
// UN WPP births, like the player's own birth) born in the same year; their status is read live from each simulated life.
import { runLife, type DataBundle, type LifeConfig } from './sim.ts';
import type { LifeState } from './state.ts';
import { contentEvents } from '../content/registry.ts';
import { sha256Hex } from '../rng/sha256.ts';

export const SAME_SECOND_N = 5;
export function sameSecondConfigs(s: LifeState, n = SAME_SECOND_N): LifeConfig[] {
  return Array.from({ length: n }, (_, i) => ({ seed: sha256Hex(`${s.seed}:same-second:${i}`).slice(0, 16), era: { kind: 'past', year: s.born.year }, nowYear: s.born.year, engineVersion: s.engineVersion }));
}
export function sameSecond(data: DataBundle, s: LifeState, cfgs = sameSecondConfigs(s)): LifeState[] {
  const out: LifeState[] = [];
  for (const c of cfgs) { const p = runLife(data, c, contentEvents); if (!('infeasible' in p)) out.push(p); }
  return out;
}
export type Stage = 'baby' | 'school' | 'work' | 'home' | 'retired' | 'dead';
export interface PeerStatus { name: string; iso: string; sex: 'M' | 'F'; age: number; alive: boolean; stage: Stage; cause?: string }
export function statusAt(p: LifeState, calYear: number): PeerStatus {
  const age = Math.max(0, calYear - p.born.year);
  const base = { name: p.name.full, iso: p.born.iso, sex: p.born.sex };
  if (p.death && age > p.death.age) return { ...base, age: p.death.age, alive: false, stage: 'dead', cause: p.death.cause };
  const y = p.years.find((r) => r.age === age);
  let stage: Stage = 'home';
  if (age < 6) stage = 'baby';
  else if (y?.studying || (y && !y.inLabor && age < 18)) stage = 'school';
  else if (y?.inLabor) stage = 'work';
  else if (y && y.pension > 0) stage = 'retired';
  return { ...base, age, alive: true, stage };
}
