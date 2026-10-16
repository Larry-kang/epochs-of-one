// P0-3 life choices. Offers are a pure function of the state at the start of a year (age) and the 'choice' stream;
// the player's answer is a recorded Action {t:'choice'} → deterministic replay. Without an answer (skip / comparison
// lives) a default policy draws an option from the same stream, weighted by country data (enrolment) and background.
// Choices change study, career, family and money — never the mortality draw (calibration stays intact).
import type { CountryRec } from '../data/types.ts';
import pool from '../../content/pool/content.json' with { type: 'json' };
import { seriesAt } from '../data/types.ts';
import { stream } from '../rng/streams.ts';
import { gradAge, schoolingOdds, type Edu } from '../economy/household.ts';
import { makeName, type NameRegion } from '../content/names.ts';
import { BIRTH_SPACING, CHILD_COOLDOWN, FERTILE, childOfferP, familyTarget } from './fertility.ts';
import type { Career, Family, LifeState, Stats } from './state.ts';

export type ChoiceId = 'vaccine' | 'school' | 'hs' | 'uni' | 'grad' | 'career' | 'move' | 'marry' | 'child' | 'parents' | 'treat';
export interface ChoiceOffer { id: ChoiceId | string; opts: string[]; weights: number[]; vars?: Record<string, number | string> }
/** fixed draw order on stream(seed,'choice',age): [0..3] occurrence draws, [4..] default picks per id in CHOICE_ORDER */
// batch 2 C2: small decisions from the content pool (one card at most per year, only when no major choice is due)
type MinorFx = Partial<Record<'h' | 'ha' | 'sm' | 'so' | '$', number>>;
export interface MinorDef { id: string; from: number; to: number; p: number; cond: string[]; fact: string; opts: { id: string; fx: MinorFx }[] }
export const MINOR: MinorDef[] = pool.decisions as MinorDef[];
const MINOR_BY = new Map(MINOR.map((d) => [d.id, d]));
export const minorById = (id: string) => MINOR_BY.get(id);
/** chance per year that a small decision card is drawn at all (pacing; design) */
export const MINOR_RATE = 0.38;
export const CHOICE_ORDER: ChoiceId[] = ['vaccine', 'school', 'hs', 'uni', 'grad', 'career', 'move', 'marry', 'child', 'parents', 'treat'];

export interface ChoiceCtx { s: LifeState; c: CountryRec; calYear: number; meanIncome: number; /** WPP cohort TFR (batch 2); absent → legacy rule */ tfr?: number; /** v0.8.0 last year's focus effects */ focus?: import('./focus.ts').FocusFx }
const gdp = (c: CountryRec, y: number) => seriesAt(c.series.gdpPcPpp, y).v;
const qAdj = (q: number) => 1 + 0.18 * (q - 3); // background: richer families keep children in school longer (design)

export function offersAt(x: ChoiceCtx): ChoiceOffer[] {
  const { s, c, calYear } = x;
  const age = s.age, k = s.career, f = s.family;
  const r = stream(s.seed, 'choice', age);
  const uMarry = r.next(), uChild = r.next(), uParents = r.next(), uTreat = r.next();
  const odds = schoolingOdds(c, s.born.year);
  const out: ChoiceOffer[] = [];
  const g = gdp(c, calYear);
  const smart = (s.stats.smart - 60) / 100 + (x.focus?.schoolAdd ?? 0);
  if (age === 1 && g < 8000) out.push({ id: 'vaccine', opts: ['go', 'skip'], weights: [0.85, 0.15] });
  if (age === k.entry && odds.pPrimary < 0.97) { const p = Math.min(0.99, odds.pPrimary * qAdj(s.born.quintile)); out.push({ id: 'school', opts: ['school', 'help'], weights: [p, 1 - p] }); }
  if (age === 15 && k.plan === 'primary') {
    const p = Math.min(0.99, Math.max(0.02, odds.pSec * qAdj(s.born.quintile) + smart));
    out.push({ id: 'hs', opts: ['academic', 'vocational', 'work'], weights: [p * 0.7, p * 0.3, 1 - p] });
  }
  if ((k.plan === 'secondary' || k.plan === 'vocational') && age === k.studyUntil) {
    const p = Math.min(0.97, Math.max(0.01, odds.pTerGivenSec * qAdj(s.born.quintile) * (k.plan === 'vocational' ? 0.5 : 1) + smart));
    out.push({ id: 'uni', opts: ['uni', 'work'], weights: [p, 1 - p], vars: { years: 4 } });
  }
  if (k.plan === 'tertiary' && age === k.studyUntil) out.push({ id: 'grad', opts: ['grad', 'work'], weights: [g > 20000 ? 0.15 : 0.06, g > 20000 ? 0.85 : 0.94] });
  // career track: when full-time work starts (after the education choices of this age are answered → offered the next year at the latest)
  if (!k.trackSet && age >= k.studyUntil && age >= 15 && !out.some((o) => o.id === 'hs' || o.id === 'uni' || o.id === 'grad')) {
    if (k.plan === 'none' || k.plan === 'primary') out.push({ id: 'career', opts: ['informal', 'private'], weights: [g < 10000 ? 0.6 : 0.2, g < 10000 ? 0.4 : 0.8] });
    else out.push({ id: 'career', opts: ['stable', 'private', 'startup'], weights: [0.25, 0.7, 0.05] });
  }
  if (k.workStart !== undefined && age === k.workStart + 2 && age <= 32 && !k.city) out.push({ id: 'move', opts: ['city', 'stay'], weights: s.born.urban ? [0.2, 0.8] : [0.4, 0.6] });
  if (!f.spouse && age >= 22 && age <= 40 && uMarry < 0.07 + s.stats.social / 900 + (x.focus?.marryAdd ?? 0)) out.push({ id: 'marry', opts: ['marry', 'wait'], weights: [0.7, 0.3] });
  if (x.tfr !== undefined) {
    if (f.spouse && age >= FERTILE.from && age <= FERTILE.to && age >= (f.childCoolUntil ?? 0) && f.children.length < 8) {
      const target = familyTarget(x.tfr, stream(s.seed, 'family', 'fert').next());
      if (uChild < childOfferP(target, f.children.length, age)) {
        const want = f.children.length < target ? 0.9 : 0.12;
        out.push({ id: 'child', opts: ['have', 'notnow'], weights: [want, 1 - want], vars: { nth: f.children.length + 1 } });
      }
    }
  } else if (f.spouse && age >= 23 && age <= 42 && f.children.length < 4 && uChild < 0.4 && age >= (f.childCoolUntil ?? 0)) {
    const want = Math.min(0.85, 0.25 + 0.5 / (1 + f.children.length) + (g < 8000 ? 0.15 : 0));
    out.push({ id: 'child', opts: ['have', 'notnow'], weights: [want, 1 - want], vars: { nth: f.children.length + 1 } });
  }
  if (f.parentsAlive && age >= 45 && age <= 62 && uParents < 0.07) {
    out.push(f.siblings.length ? { id: 'parents', opts: ['self', 'hire', 'siblings'], weights: [0.5, 0.3, 0.2] } : { id: 'parents', opts: ['self', 'hire'], weights: [0.6, 0.4] });
  }
  if (age >= 25 && uTreat < (s.stats.health < 50 ? 0.04 : 0.012)) out.push({ id: 'treat', opts: ['treat', 'basic'], weights: g > 15000 ? [0.85, 0.15] : [0.55, 0.45] });
  if (!out.length && age >= 4) { const m = minorOffer(x, g); if (m) out.push(m); }
  return out;
}

function minorCond(x: ChoiceCtx, g: number, k: string): boolean {
  const { s, calYear } = x; const k2 = s.career; const f = s.family;
  if (k.startsWith('y')) { const [a, b] = k.slice(1).split('-').map(Number); return calYear >= a! && calYear <= b!; }
  switch (k) {
    case 'student': return s.age >= k2.entry && s.age < k2.studyUntil && k2.plan !== 'none';
    case 'work': return s.econ.employed; case 'married': return !!f.spouse; case 'single': return !f.spouse; case 'kids': return f.children.length > 0;
    case 'sibs': return f.siblings.length > 0; case 'retired': return s.econ.retired; case 'owner': return !!s.house; case 'renter': return !s.house;
    case 'poor': return s.born.quintile <= 2; case 'rich': return s.born.quintile >= 4; case 'rural': return !s.born.urban && !k2.city; case 'city': return s.born.urban || k2.city;
    case 'smart': return s.stats.smart >= 60; case 'lowgdp': return g < 8000; case 'parents': return f.parentsAlive;
  }
  return true;
}
function minorOffer(x: ChoiceCtx, g: number): ChoiceOffer | null {
  const { s } = x; const r = stream(s.seed, 'choice', 'minor', s.age);
  if (r.next() >= MINOR_RATE) return null;
  const seen = new Set(s.events.filter((e) => e.id.startsWith('ch_d_')).map((e) => e.id.slice(3, e.id.lastIndexOf('_'))));
  const ok = MINOR.filter((d) => s.age >= d.from && s.age <= d.to && !seen.has(d.id) && d.cond.every((k) => minorCond(x, g, k)));
  if (!ok.length) return null;
  const tot = ok.reduce((a, d) => a + d.p, 0); let u = r.next() * tot;
  const d = ok.find((z) => (u -= z.p) < 0) ?? ok[ok.length - 1]!;
  const w = d.opts.length === 2 ? [0.55, 0.45] : d.opts.map((_, i) => (d.opts.length - i) / ((d.opts.length * (d.opts.length + 1)) / 2));
  return { id: d.id, opts: d.opts.map((o) => o.id), weights: w };
}

/** default policy pick (comparison lives / fast-forward) */
export function defaultPick(seed: string, age: number, o: ChoiceOffer): string {
  let u = 0;
  if (MINOR_BY.has(o.id)) u = stream(seed, 'choice', 'minorPick', age).next();
  else {
    const r = stream(seed, 'choice', age);
    for (let i = 0; i < 4; i++) r.next();
    for (const id of CHOICE_ORDER) { const v = r.next(); if (id === o.id) { u = v; break; } }
  }
  const tot = o.weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (let i = 0; i < o.opts.length; i++) { acc += o.weights[i]! / tot; if (u < acc) return o.opts[i]!; }
  return o.opts[o.opts.length - 1]!;
}

export interface ChoiceDraft { career: Career; family: Family; stats: Stats; cash: number; calYear: number; age: number; meanDisp: number; oop: number; seed: string }
/** Apply one answered choice; returns event vars for the log (event id `ch_<id>_<opt>`). */
export function applyChoice(d: ChoiceDraft, id: ChoiceId | string, opt: string): Record<string, number | string> | undefined {
  const k = d.career, st = d.stats;
  const minor = MINOR_BY.get(id);
  if (minor) {
    const fx = minor.opts.find((o) => o.id === opt)?.fx ?? {};
    st.health += fx.h ?? 0; st.happy += fx.ha ?? 0; st.smart += fx.sm ?? 0; st.social += fx.so ?? 0;
    if (fx.$) { const amt = Math.round(fx.$ * d.meanDisp); d.cash += amt; return { amount: Math.abs(amt) }; }
    return undefined;
  }
  const setPlan = (e: Edu) => { k.plan = e; k.studyUntil = gradAge(e, k.entry); };
  switch (id) {
    case 'vaccine': if (opt === 'go') st.health += 6; return;
    case 'school': if (opt === 'help') { setPlan('none'); st.smart -= 8; st.social += 2; } else setPlan('primary'); return;
    case 'hs':
      if (opt === 'academic') setPlan('secondary');
      else if (opt === 'vocational') setPlan('vocational');
      else { k.plan = k.plan === 'none' ? 'none' : 'primary'; k.studyUntil = d.age; }
      if (opt !== 'work') st.smart += 4;
      return;
    case 'uni': if (opt === 'uni') { setPlan('tertiary'); st.smart += 5; } else k.studyUntil = d.age; return;
    case 'grad': if (opt === 'grad') { setPlan('graduate'); st.smart += 4; } else k.studyUntil = d.age; return;
    case 'career':
      k.track = opt as Career['track']; k.trackSet = true;
      if (opt === 'startup') st.happy += 3;
      return;
    case 'move':
      if (opt === 'city') { k.city = true; st.social -= 4; st.happy += 1; } else { st.happy += 2; st.social += 1; }
      return;
    case 'marry':
      if (opt === 'marry') {
        const r = stream(d.seed, 'family', 'spouse', d.age);
        const sx = r.next() < 0.97 ? 'other' : 'same';
        d.family.spouse = { name: makeName(d.family.region as NameRegion, sx === 'other' ? 'F' : 'M', r.next(), r.next()).full, born: d.calYear - d.age + Math.floor(r.next() * 7) - 3 };
        const cost = Math.round(0.25 * d.meanDisp);
        d.cash -= cost; st.happy += 10; st.social += 4;
        return { cost, spouse: d.family.spouse.name };
      }
      st.happy -= 1; return;
    case 'child':
      if (opt === 'have') {
        const r = stream(d.seed, 'family', 'child', d.age);
        const sx = r.next() < 0.5 ? 'M' : 'F', u = r.next();
        const taken = new Set([...d.family.children, ...d.family.siblings].map((p) => p.name));
        let n = makeName(d.family.region as NameRegion, sx, 0, u, undefined);
        for (let k = 1; k < 12 && taken.has(n.given); k++) n = makeName(d.family.region as NameRegion, sx, 0, (u + k * 0.6180339887) % 1, undefined); // no two kids share a name
        d.family.children.push({ name: n.given, born: d.calYear });
        d.family.childCoolUntil = d.age + BIRTH_SPACING;
        st.happy += 7; return { nth: d.family.children.length, name: n.given };
      }
      d.family.childCoolUntil = d.age + CHILD_COOLDOWN;
      return;
    case 'parents':
      if (opt === 'self') { k.careUntil = d.age + 2; st.happy -= 3; st.social += 3; }
      else if (opt === 'hire') { k.careCostUntil = d.age + 3; }
      else st.social -= 6;
      d.family.parentsAlive = false;
      return;
    case 'treat': {
      const cost = Math.round((opt === 'treat' ? 0.6 : 0.1) * d.meanDisp * d.oop);
      d.cash -= cost;
      if (opt === 'treat') { st.health -= 6; st.happy -= 3; } else { st.health -= 18; st.happy -= 6; }
      return { cost };
    }
  }
  return undefined;
}
