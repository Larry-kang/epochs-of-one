// v0.8.0 yearly focus. The player splits the year between a few chips for their life stage; each chip's share is its
// weight W (shares sum to 1). Recorded as {t:'focus', age, w:{chip: share}} and kept until changed. When the life
// stage changes, the allocation is mapped onto the closest chips of the new stage (and maps back when the stage
// returns); each such swap is logged. Game-design content: it never touches the mortality draw. With no focus recorded
// (and no auto policy) nothing changes, so calibrated lives stay identical.
import type { Action, Stats } from './state.ts';
import { h01s } from '../rng/hash01.ts';

export const FOCUS_FROM = 6;
export type Stage = 'none' | 'school' | 'uni' | 'work' | 'idle' | 'elder';
export type Chip = 'study' | 'play' | 'help' | 'parttime' | 'career' | 'sport' | 'hobby' | 'work' | 'balance' | 'family' | 'health' | 'learn' | 'rest' | 'mind' | 'faith';
export type Alloc = Partial<Record<string, number>>;
export interface StageCtx { age: number; studying: boolean; uni: boolean; inLabor: boolean; unemployed: boolean; retired: boolean }

export function focusStage(c: StageCtx): Stage {
  if (c.age < FOCUS_FROM) return 'none';
  if (c.studying) return c.uni ? 'uni' : 'school';
  if (c.retired || c.age >= 65) return 'elder';
  if (c.inLabor && !c.unemployed) return 'work';
  if (c.age < 15) return 'school';
  return 'idle';
}
const CHIPS: Record<Stage, Chip[]> = {
  none: [],
  school: ['study', 'play', 'help', 'sport', 'hobby'],
  uni: ['study', 'play', 'help', 'parttime', 'career', 'sport', 'hobby'],
  work: ['work', 'balance', 'family', 'health', 'learn', 'hobby'],
  idle: ['family', 'health', 'learn', 'hobby', 'rest'],
  elder: ['family', 'health', 'learn', 'hobby', 'rest', 'mind', 'faith'],
};
export const chipsFor = (st: Stage): Chip[] => [...CHIPS[st]];

/** shares (any non-negative numbers) → weights summing to 1; zero/negative shares dropped */
export function weights(a: Alloc): Record<string, number> {
  const e = Object.entries(a).filter(([, v]) => (v ?? 0) > 0) as [string, number][];
  const tot = e.reduce((s, [, v]) => s + v, 0);
  return tot > 0 ? Object.fromEntries(e.map(([k, v]) => [k, v / tot])) : {};
}

/** yearly stat drift is small: it compounds over decades (calibrated by the v080 MC test) */
const FX_SCALE = 0.15;
/** per-chip stat drift at full weight (scaled by W) */
const FX: Record<Chip, Partial<Record<keyof Stats, number>>> = {
  study: { smart: 4, happy: -1 }, play: { happy: 3, social: 1, smart: -1 }, help: { social: 2, happy: -1 }, parttime: { social: 1, happy: -1, smart: -1 },
  career: { smart: 2, social: 1 }, sport: { health: 4, happy: 1 }, hobby: { happy: 3, smart: 1 },
  work: { happy: -2, health: -1 }, balance: { happy: 2, health: 1 }, family: { happy: 6, social: 4 }, health: { health: 4, happy: 1 }, learn: { smart: 3 },
  rest: { health: 2, happy: 2, smart: -1 }, mind: { smart: 3, happy: 1 }, faith: { happy: 3, social: 2 },
};
export interface FocusFx { learnGrowth: number; divorceMult: number; childAdd: number; bondAdd: number; hazardMult: number; incomeMult: number; promoMult: number; jobMult: number; familyMult: number; marryAdd: number; schoolAdd: number; costShare: number; parttime: number; fx: Partial<Record<keyof Stats, number>> }
/** effects of a weighted allocation (weights or raw shares; normalised here) */
export function focusEffects(a: Alloc): FocusFx {
  const tot = Object.values(a).reduce((x: number, v) => x + Math.max(0, v ?? 0), 0);
  const w = tot > 0 && tot <= 1 ? (a as Record<string, number>) : weights(a); const W = (k: Chip) => w[k] ?? 0;
  const fx: Partial<Record<keyof Stats, number>> = {};
  for (const [k, v] of Object.entries(w)) for (const [s, d] of Object.entries(FX[k as Chip] ?? {}) as [keyof Stats, number][]) fx[s] = (fx[s] ?? 0) + FX_SCALE * d * v;
  return {
    // time is finite: hours given to leisure/family chips cost a little pay (opportunity cost keeps the economy calibrated)
    // learn is an investment: ~10% fewer paid hours now (time cost), +0.6%/yr permanent wage growth and better promotion odds later.
    // Grounding: one year of formal adult/on-the-job training raises later wages by roughly 2–5% (Bassanini, Booth, Brunello,
    // De Paola & Leuven 2007, "Workplace training in Europe", in Education and Training in Europe, OUP; Frazis & Loewenstein 2005,
    // J. Human Resources 40(2)); W=1 here is a year mostly spent on it, but only part of the year's hours go to it and returns decay, so 0.6%/yr compounding is conservative.
    incomeMult: (1 + 0.1 * W('work') + 0.03 * W('career')) * (1 - 0.08 * (W('balance') + W('family') + W('hobby') + W('health') + W('rest')) - 0.1 * W('learn')),
    learnGrowth: 0.006 * W('learn'),
    promoMult: 1 + 0.12 * W('work') + 0.3 * W('learn') - 0.15 * W('family'),
    // family: stronger marriage odds, fewer divorces, more wanted children (still capped by the WPP TFR target), bond and happiness
    divorceMult: 1 - 0.6 * W('family'), childAdd: 0.3 * W('family'), bondAdd: 3 * W('family'),
    // health chip: regular activity lowers adult mortality ~20–30% at guideline levels (Arem et al. 2015, JAMA Intern Med 175(6);
    // Warburton, Nicol & Bredin 2006, CMAJ 174(6)); we use a modest 12% at full weight
    hazardMult: 1 - 0.12 * W('health'),
    jobMult: 1 + 1.5 * W('learn') + 0.8 * W('career'),
    familyMult: 1 + 0.8 * W('family'),
    marryAdd: 0.14 * W('family') + 0.02 * W('balance'),
    schoolAdd: 0.02 * W('study'),
    costShare: 0.02 * W('learn') + 0.02 * W('health') + 0.01 * W('hobby'),
    parttime: W('parttime'),
    fx,
  };
}

/** closest chip of each stage for a chip that is not available there */
const NEAR: Record<Chip, Chip[]> = {
  study: ['learn', 'mind'], play: ['hobby', 'balance', 'rest'], help: ['family'], parttime: ['work', 'learn'], career: ['work', 'learn'],
  sport: ['health'], hobby: ['hobby', 'play'], work: ['learn', 'parttime', 'study'], balance: ['rest', 'play', 'hobby'], family: ['help', 'family'],
  health: ['sport', 'health'], learn: ['study', 'career', 'mind'], rest: ['balance', 'play', 'hobby'], mind: ['learn', 'study'], faith: ['family', 'rest', 'help'],
};
/** map an intended allocation onto a stage: chips of that stage are kept, others move to their closest available chip */
export function mapToStage(a: Alloc, st: Stage): Record<string, number> {
  const ok = CHIPS[st]; const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(a)) {
    if (!(v! > 0)) continue;
    const to = ok.includes(k as Chip) ? k : NEAR[k as Chip]?.find((n) => ok.includes(n));
    if (to) out[to] = (out[to] ?? 0) + v!;
  }
  return out;
}

/** auto policy (auto-choice and comparison lives): mostly the stage's main chip, plus support for the weakest stat */
export function autoAlloc(st: Stage, stats: Stats, seed: string, age: number): Record<string, number> {
  const main: Partial<Record<Stage, Chip>> = { school: 'study', uni: 'study', work: 'work', idle: 'learn', elder: 'health' };
  const support: Record<keyof Stats, Chip[]> = { health: ['health', 'sport', 'rest'], happy: ['hobby', 'play', 'balance', 'faith'], smart: ['learn', 'study', 'mind'], social: ['family', 'help', 'faith'] };
  const ok = CHIPS[st]; if (!ok.length) return {};
  const weak = (Object.keys(stats) as (keyof Stats)[]).sort((a, b) => stats[a] - stats[b] || a.localeCompare(b))[0]!;
  const m = main[st] ?? ok[0]!;
  const sup = support[weak].find((c) => ok.includes(c) && c !== m) ?? ok.find((c) => c !== m)!;
  const third = ok.filter((c) => c !== m && c !== sup);
  const extra = third[Math.floor(h01s(`${seed}:focus:${st}:${age}`) * third.length)];
  return extra ? { [m]: 2, [sup]: 1, [extra]: 1 } : { [m]: 2, [sup]: 1 };
}

const LEGACY: Record<string, string> = { workHard: 'work', sideGig: 'parttime', friends: 'balance', helpHome: 'help', care: 'family', volunteer: 'faith' };
/** allocation in force at `age`: the latest recorded focus action at or before that age ({} = none) */
export function activeAlloc(actions: Action[], age: number): Record<string, number> {
  let out: Record<string, number> = {}, at = -1;
  for (const a of actions) if (a.t === 'focus' && a.age <= age && a.age >= at) {
    at = a.age;
    out = 'w' in a && a.w ? Object.fromEntries(Object.entries(a.w).filter(([, v]) => (v ?? 0) > 0)) as Record<string, number> : 'id' in a && a.id ? { [LEGACY[a.id] ?? a.id]: 1 } : {};
  }
  return out;
}
export const allocKey = (a: Alloc) => Object.keys(weights(a)).sort().join('+');

/** v0.8.1: adult mortality hazard multiplier from the health stat (only for lives with a focus in force; never under 15, so
 *  under-5 mortality is untouched). Self-rated/overall health strongly predicts mortality — poor vs excellent RR ≈ 1.9
 *  (DeSalvo et al. 2006, J Gen Intern Med 21(3)); we use a modest 6% per 10 stat points around 70 (the engine's mean adult health, so the average life is unchanged), clamped to [0.75, 1.35]. */
export function healthHazard(health: number, age: number, fx?: FocusFx): number {
  if (age < 15) return 1;
  const hr = Math.min(1.35, Math.max(0.75, 0.94 ** ((health - 70) / 10)));
  return hr * (fx?.hazardMult ?? 1);
}
