// Event registry: core events (money/career effects) + a flavour pool (P1: 100+ originally written vignettes).
// Conditions/weights/effects only — text lives in the translation table src/content/i18n/table.json (strings.events) keyed by id.
// Probabilities are game-design content (pacing), not empirical parameters; they never affect mortality.
// Repetition control: every event has a cooldown (years) stored in flags `cd:<id>` (0 = once per life).
import type { EventCtx, EventOut, EventSystem } from '../life/events.ts';
import { stream } from '../rng/streams.ts';
import { PARAMS } from '../params.ts';
import pool from '../../content/pool/content.json' with { type: 'json' };

export interface EventDef {
  id: string;
  /** base annual probability when eligible (design) */
  p: number | ((c: EventCtx) => number);
  when: (c: EventCtx) => boolean;
  apply: (c: EventCtx, o: EventOut, r: () => number) => Record<string, number | string> | void;
  /** years before the same event may fire again; 0 = once per life */
  cd: number;
}

const CORE: EventDef[] = [
  { id: 'study_prize', cd: 3, p: 0.12, when: (c) => c.age >= 7 && c.age <= 18 && c.stats.smart >= 60 && c.studying,
    apply: (_c, o) => { o.stats.smart += 4; o.stats.happy += 4; } },
  { id: 'first_paycheck', cd: 0, p: 1, when: (c) => c.inLabor && !c.unemployed && c.income > 0 && !c.flags.firstJob,
    apply: (c, o) => { o.flags.firstJob = c.age; o.stats.happy += 5; return { amount: Math.round(c.income) }; } },
  { id: 'jobless_year', cd: 1, p: 1, when: (c) => c.inLabor && c.unemployed,
    apply: (c, o) => { o.stats.happy -= 8; o.stats.social -= 2; return { amount: Math.round(c.income) }; } },
  { id: 'promotion', cd: 3, p: (c) => (0.07 + c.stats.smart / 2000) * (c.focusPromo ?? 1), when: (c) => c.inLabor && !c.unemployed && c.age >= 24 && c.age <= 58 && c.careerMult < 2.2,
    apply: (_c, o, r) => { const step = PARAMS.promoStep.value * (0.8 + 0.6 * r()); o.careerMult *= 1 + step; o.stats.happy += 5; return { pct: Math.round(step * 100) }; } },
  { id: 'illness', cd: 2, p: (c) => (c.stats.health < 40 ? 0.12 : 0.04), when: (c) => c.age >= 18,
    apply: (c, o, r) => { const cost = Math.max(1, Math.round(c.meanIncome * (0.05 + 0.1 * r()) * c.oop)); o.stats.health -= 12; o.stats.happy -= 4; o.cash -= cost; return { cost }; } },
  { id: 'illness_child', cd: 3, p: (c) => (c.stats.health < 40 ? 0.12 : 0.05), when: (c) => c.age >= 3 && c.age < 18,
    apply: (_c, o) => { o.stats.health -= 8; o.stats.happy -= 3; } },
  { id: 'windfall', cd: 15, p: 0.012, when: (c) => c.age >= 18,
    apply: (c, o, r) => { const amt = Math.round(c.meanIncome * (0.2 + 0.8 * r())); o.cash += amt; o.stats.happy += 4; return { amount: amt }; } },
  { id: 'friend_leaves', cd: 8, p: 0.05, when: (c) => c.age >= 10 && c.age <= 75,
    apply: (_c, o) => { o.stats.social -= 6; o.stats.happy -= 2; } },
  { id: 'new_hobby', cd: 12, p: 0.06, when: (c) => c.age >= 8 && c.age <= 80,
    apply: (_c, o) => { o.stats.happy += 6; o.stats.health += 2; } },
  { id: 'divorce', cd: 0, p: 0.006, when: (c) => c.married && c.age >= 28 && c.age <= 65,
    apply: (_c, o) => { o.married = false; o.stats.happy -= 10; } },
];

// Flavour pool: [id, minAge, maxAge, p, effects (h=health, ha=happy, sm=smart, so=social, $=cash × typical income), cooldown, condition]
type Cond = 'student' | 'work' | 'married' | 'single' | 'kids' | 'sibs' | 'retired' | 'owner' | 'renter' | 'poor' | 'rich' | 'rural' | 'city' | 'smart' | 'lowgdp';
type Fx = Partial<Record<'h' | 'ha' | 'sm' | 'so' | '$' | 'career', number>>;
type Flav = [string, number, number, number, Fx, number, (Cond | `y${number}-${number}`)[]?];
const F: Flav[] = [
  // childhood
  ['fl_first_steps', 1, 2, 0.5, { ha: 3 }, 0], ['fl_first_word', 1, 3, 0.4, { so: 2 }, 0], ['fl_night_fever', 1, 5, 0.08, { h: -3 }, 8],
  ['fl_sibling_fight', 3, 14, 0.12, { so: 1 }, 5, ['sibs']], ['fl_lost_market', 4, 9, 0.05, { ha: -2 }, 0], ['fl_kindergarten', 4, 6, 0.3, { so: 2 }, 0, ['student']],
  ['fl_best_friend', 6, 12, 0.15, { so: 5, ha: 3 }, 0], ['fl_bike', 6, 11, 0.15, { h: 2, ha: 3 }, 0], ['fl_stray_cat', 5, 13, 0.06, { ha: 3 }, 10],
  ['fl_storm', 3, 90, 0.02, { ha: -1 }, 15], ['fl_grandma_story', 3, 10, 0.1, { sm: 2, so: 2 }, 0], ['fl_broken_arm', 6, 14, 0.03, { h: -6 }, 0],
  ['fl_class_play', 7, 12, 0.1, { so: 3 }, 0, ['student']], ['fl_math_tears', 8, 14, 0.06, { sm: 3, ha: -1 }, 5, ['student']], ['fl_library', 7, 16, 0.1, { sm: 5 }, 0, ['smart']],
  ['fl_chores', 6, 14, 0.12, { sm: -1, h: 1 }, 6, ['poor']], ['fl_new_shoes', 5, 12, 0.1, { ha: 4 }, 0, ['poor']], ['fl_moving_house', 3, 16, 0.03, { so: -3 }, 0],
  ['fl_pet_dies', 6, 16, 0.03, { ha: -5 }, 0], ['fl_birthday_cake', 5, 12, 0.08, { ha: 3 }, 0],
  // teens
  ['fl_crush', 12, 18, 0.12, { ha: 2 }, 0], ['fl_first_phone', 12, 18, 0.25, { so: 3 }, 0, ['y2005-2100']], ['fl_radio', 10, 18, 0.1, { ha: 2 }, 0, ['y1950-1990']],
  ['fl_exam_stress', 14, 18, 0.12, { ha: -3, sm: 3 }, 2, ['student']], ['fl_band', 13, 19, 0.04, { so: 4, ha: 3 }, 0], ['fl_sports_win', 12, 18, 0.05, { h: 3, so: 3 }, 0],
  ['fl_detention', 12, 17, 0.04, { ha: -2 }, 0], ['fl_part_time', 15, 19, 0.15, { ha: 3 }, 0, ['student']], ['fl_rebel', 14, 18, 0.08, { so: -2 }, 0],
  ['fl_diary', 11, 17, 0.05, { sm: 2 }, 0], ['fl_mentor', 14, 30, 0.04, { sm: 4, ha: 2 }, 0],
  // young adult & work
  ['fl_first_apartment', 18, 30, 0.3, { ha: 3 }, 0, ['work', 'renter']], ['fl_roadtrip', 18, 35, 0.06, { ha: 5, so: 3 }, 8], ['fl_heartbreak', 17, 35, 0.06, { ha: -6 }, 6, ['single']],
  ['fl_night_shift', 18, 50, 0.04, { h: -4 }, 8, ['work']], ['fl_driving', 18, 30, 0.12, { ha: 2 }, 0], ['fl_coworker_friend', 20, 55, 0.05, { so: 4 }, 10, ['work']],
  ['fl_bad_boss', 20, 60, 0.04, { ha: -5 }, 8, ['work']], ['fl_side_project', 20, 45, 0.03, { sm: 3, ha: 3 }, 10, ['work']], ['fl_gym', 18, 60, 0.04, { h: 5 }, 10],
  ['fl_wedding_guest', 20, 40, 0.07, { so: 2, $: -0.01 }, 4], ['fl_reunion', 25, 70, 0.04, { so: 3, ha: 2 }, 10], ['fl_language', 16, 50, 0.02, { sm: 4 }, 15],
  ['fl_volunteer', 16, 80, 0.02, { ha: 3, so: 3 }, 10], ['fl_burnout', 25, 55, 0.03, { ha: -7, h: -4 }, 10, ['work']], ['fl_raise_small', 22, 60, 0.06, { ha: 2, career: 0.03 }, 5, ['work']],
  ['fl_layoff_scare', 22, 60, 0.03, { ha: -4 }, 8, ['work']], ['fl_concert', 15, 45, 0.04, { ha: 5 }, 8], ['fl_scam', 20, 80, 0.015, { ha: -2 }, 20],
  ['fl_scam_lost', 25, 85, 0.006, { ha: -5, $: -0.05 }, 30],
  // family
  ['fl_kid_first_word', 23, 55, 0.3, { ha: 5 }, 0, ['kids']], ['fl_kid_school', 26, 60, 0.2, { ha: 3 }, 0, ['kids']], ['fl_kid_sick', 23, 60, 0.06, { h: -2, ha: -2 }, 6, ['kids']],
  ['fl_kid_teen', 35, 65, 0.1, { ha: -2 }, 0, ['kids']], ['fl_kid_grad', 40, 70, 0.1, { ha: 6 }, 0, ['kids']], ['fl_kid_moves_out', 40, 75, 0.08, { ha: -3 }, 0, ['kids']],
  ['fl_anniversary', 25, 90, 0.05, { ha: 4 }, 10, ['married']], ['fl_marital_fight', 23, 80, 0.04, { ha: -4 }, 6, ['married']], ['fl_inlaws', 23, 70, 0.04, { so: 1, ha: -1 }, 10, ['married']],
  ['fl_grandchild', 50, 90, 0.08, { ha: 8 }, 0, ['kids']], ['fl_family_dinner', 30, 90, 0.05, { ha: 4, so: 2 }, 5], ['fl_parent_dies', 40, 75, 0.04, { ha: -10 }, 0],
  // midlife
  ['fl_new_skill', 30, 60, 0.04, { sm: 3 }, 10, ['work']], ['fl_career_doubt', 35, 55, 0.05, { ha: -3 }, 0, ['work']], ['fl_back_pain', 35, 80, 0.04, { h: -3 }, 10],
  ['fl_glasses', 40, 55, 0.12, { h: -1 }, 0], ['fl_house_repair', 30, 80, 0.06, { $: -0.03 }, 8, ['owner']], ['fl_garden', 40, 90, 0.03, { ha: 3 }, 0],
  ['fl_cooking', 25, 80, 0.03, { so: 3 }, 0], ['fl_mid_trip', 35, 70, 0.04, { ha: 6 }, 10], ['fl_health_check', 40, 80, 0.05, { h: -1 }, 8],
  ['fl_quit_smoking', 30, 70, 0.02, { h: 5 }, 0], ['fl_lottery_small', 20, 85, 0.03, { ha: 2 }, 10], ['fl_award_work', 30, 60, 0.03, { ha: 5, so: 2 }, 0, ['work']],
  ['fl_teach', 40, 75, 0.03, { sm: 2, so: 2 }, 0], ['fl_economy_bad', 25, 65, 0.03, { ha: -3 }, 10, ['work']], ['fl_neighbors', 30, 90, 0.03, { so: 2 }, 12],
  // old age
  ['fl_retire_hobby', 55, 90, 0.3, { ha: 5 }, 0, ['retired']], ['fl_grandkid_visit', 60, 95, 0.06, { ha: 4 }, 4, ['kids']], ['fl_old_friend', 60, 95, 0.05, { so: 3, ha: 3 }, 8],
  ['fl_fall', 70, 110, 0.05, { h: -8 }, 8], ['fl_memory', 70, 110, 0.05, { sm: -3 }, 10], ['fl_photo_album', 60, 100, 0.04, { ha: 3 }, 0],
  ['fl_walk_park', 60, 100, 0.05, { h: 3, so: 2 }, 6], ['fl_hospital_stay', 65, 110, 0.05, { h: -6 }, 8], ['fl_digital', 60, 90, 0.08, { so: 3 }, 0, ['y2010-2100']],
  ['fl_funeral_friend', 65, 110, 0.05, { ha: -5 }, 8], ['fl_will', 65, 100, 0.03, { ha: 1 }, 0], ['fl_birthday_old', 80, 110, 0.15, { ha: 5 }, 10],
  // era / place
  ['fl_moon_landing', 5, 80, 0.6, { ha: 2, sm: 1 }, 0, ['y1969-1969']], ['fl_internet', 10, 70, 0.25, { sm: 2 }, 0, ['y1995-2002']], ['fl_pandemic', 0, 110, 0.9, { ha: -4, so: -3 }, 0, ['y2020-2020']],
  ['fl_financial_crisis', 22, 70, 0.5, { ha: -3 }, 0, ['work', 'y2008-2009']], ['fl_oil_shock', 20, 70, 0.4, { ha: -2 }, 0, ['y1973-1974']], ['fl_y2k', 10, 80, 0.5, { ha: 1 }, 0, ['y1999-1999']],
  ['fl_smartphone', 12, 80, 0.2, { so: 1 }, 0, ['y2008-2014']], ['fl_drought', 0, 110, 0.04, { h: -3, ha: -3 }, 15, ['lowgdp', 'rural']], ['fl_rainy_harvest', 15, 80, 0.05, { ha: 3 }, 10, ['rural']],
  ['fl_power_cut', 5, 80, 0.05, { so: 2 }, 10, ['lowgdp']], ['fl_city_lights', 15, 40, 0.1, { ha: 2 }, 0, ['rural']], ['fl_festival', 5, 90, 0.05, { ha: 3, so: 1 }, 3],
];

const condOk = (c: EventCtx, k: Cond | string): boolean => {
  if (k.startsWith('y')) { const [a, b] = k.slice(1).split('-').map(Number); return c.calYear >= a! && c.calYear <= b!; }
  switch (k) {
    case 'student': return c.studying; case 'work': return c.inLabor && !c.unemployed; case 'married': return c.married; case 'single': return !c.married;
    case 'kids': return c.kids > 0; case 'sibs': return c.siblings > 0; case 'retired': return c.retired; case 'owner': return c.owner; case 'renter': return !c.owner;
    case 'poor': return c.quintile <= 2; case 'rich': return c.quintile >= 4; case 'rural': return !c.urban && !c.city; case 'city': return c.urban || c.city;
    case 'smart': return c.stats.smart >= 60; case 'lowgdp': return c.gdp < 8000;
  }
  return true;
};
/** v0.8.0: family-focused years make family events (kids/married/siblings) more likely */
const famTagged = (cond?: readonly string[]) => !!cond?.some((k) => k === 'kids' || k === 'married' || k === 'sibs');
const FLAVOR: EventDef[] = F.map(([id, a, b, p, fx, cd, cond]) => ({
  id, cd, p: famTagged(cond) ? (c: EventCtx) => p * (c.focusFamily ?? 1) : p, when: (c) => c.age >= a && c.age <= b && (cond ?? []).every((k) => condOk(c, k)),
  apply: (c, o) => {
    o.stats.health += fx.h ?? 0; o.stats.happy += fx.ha ?? 0; o.stats.smart += fx.sm ?? 0; o.stats.social += fx.so ?? 0;
    if (fx.career) o.careerMult *= 1 + fx.career;
    if (fx.$) { const amt = Math.round(-fx.$ * c.meanIncome); o.cash -= amt; return { amount: amt }; }
  },
}));

// batch 2 C1: second flavour pool (same tuple format) from src/content/pool/content.json
const FLAVOR2: EventDef[] = (pool.events as unknown as Flav[]).map(([id, a, b, p, fx, cd, cond]) => ({
  id, cd, p: famTagged(cond) ? (c: EventCtx) => p * (c.focusFamily ?? 1) : p, when: (c) => c.age >= a && c.age <= b && (cond ?? []).every((k) => condOk(c, k)),
  apply: (c, o) => {
    o.stats.health += fx.h ?? 0; o.stats.happy += fx.ha ?? 0; o.stats.smart += fx.sm ?? 0; o.stats.social += fx.so ?? 0;
    if (fx.career) o.careerMult *= 1 + fx.career;
    if (fx.$) { const amt = Math.round(-fx.$ * c.meanIncome); o.cash -= amt; return { amount: Math.abs(amt) }; }
  },
}));
export const EVENTS: EventDef[] = [...CORE, ...FLAVOR, ...FLAVOR2];
export const MAX_EVENTS_PER_YEAR = 2;
/** events that always fire when eligible (state notices), ahead of the per-year cap */
const PRIORITY = new Set(['first_paycheck', 'jobless_year']);

export const contentEvents: EventSystem = {
  run(c) {
    const r = stream(c.seed, 'events', c.age);
    const o: EventOut = { stats: { ...c.stats }, cash: c.cash, income: c.income, pct: c.pct, flags: { ...c.flags }, fired: [], careerMult: c.careerMult };
    if (c.age >= 50) o.stats.health -= 1; // gentle ageing drift (design)
    // one draw per event per year (stable sequences), plus a per-year random order so the cap does not favour list position
    const u = EVENTS.map(() => r.next());
    const key = EVENTS.map(() => r.next());
    const order = EVENTS.map((_, i) => i).sort((a, b) => (PRIORITY.has(EVENTS[b]!.id) ? 1 : 0) - (PRIORITY.has(EVENTS[a]!.id) ? 1 : 0) || key[a]! - key[b]!);
    for (const i of order) {
      const e = EVENTS[i]!;
      if (o.fired.length >= MAX_EVENTS_PER_YEAR) break;
      const last = o.flags['cd:' + e.id];
      if (last !== undefined && (e.cd === 0 || c.age - Number(last) < e.cd)) continue;
      const ctx = { ...c, stats: o.stats, flags: o.flags, cash: o.cash, pct: o.pct, careerMult: o.careerMult };
      if (!e.when(ctx)) continue;
      const p = typeof e.p === 'function' ? e.p(ctx) : e.p;
      if (u[i]! < p) {
        const vars = e.apply(ctx, o, () => r.next()) ?? undefined;
        o.flags['cd:' + e.id] = c.age;
        o.fired.push(vars ? { id: e.id, vars } : { id: e.id });
      }
    }
    for (const k of ['health', 'happy', 'smart', 'social'] as const) o.stats[k] = Math.max(0, Math.min(100, o.stats[k]));
    return o;
  },
};

/** Engine (market/finance) events: emitted by finance systems, not drawn by the content registry; text in events.json. */
export const ENGINE_EVENT_IDS = ['marginCall', 'forcedSale', 'levClosed', 'retire', 'mortgagePaid', 'paymentMissed', 'foreclosure', 'loanPaid', 'loanDefault', 'loanRateUp',
  'study_start', 'graduated', 'part_time',
  // batch 2 P14 auto-routines (spend.ts ROUTINES)
  'rt_giftParents', 'rt_tripHome', 'rt_donateSmall', 'rt_gym', 'rt_checkup', 'rt_allowance', 'rt_dining', 'rt_onlineCourse',
  // v0.8.0 focus
  'fc_switch', 'fc_auto', 'job_change'] as const;
