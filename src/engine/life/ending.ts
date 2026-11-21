// P1-4 personalised ending: happiest year, cause of death (推估: no cause-of-death data in the allowed sources yet —
// drawn from age band, income level and health), last words (template chosen from the life's features).
// Uses its own 'ending' stream: never changes the simulated life.
import { stream } from '../rng/streams.ts';
import type { LifeState } from './state.ts';

export interface Ending { happiest?: { age: number; year: number; eventId?: string }; cause: string; lastWords: string; vars: Record<string, string> }

/** v0.8.1: never caption the happiest year with a hardship line (an infant's fever, illness, loss…) — omit it instead */
const SAD = /fever|sick|ill|injur|hospital|funeral|death|dies|died|grief|mourn|accident|flood|fire|quake|storm|heatwave|war|hunger|famine|jobless|unemploy|loss|lost|debt|default|foreclos|margin|divorce|bully|fight|robbed|theft|scam|evict|disab|lonely|leaves/;
/** Item 1 (v0.15.0): routine lines (spending habits, focus, institutions, daily mini-choices, health checks) never
 *  count toward or caption the happiest year; major life events do. */
export const ROUTINE_EVENT = /^(rt_|fc_|in_|ch_d_|oc_map$|oc_enter$|fl_health_check$|fl_gym$)/;
const MAJOR = new Set(['ch_marry_marry', 'ch_child_have', 'graduated', 'first_paycheck', 'promotion', 'ev_pay_raise_big', 'retire', 'windfall', 'study_prize', 'fl_award_work', 'ev_debt_paid', 'loanPaid', 'mortgagePaid', 'fl_kid_grad', 'ev_kid_wedding', 'ev_first_kiss', 'fl_first_apartment', 'oc_biz_start']);
type HapYear = { age: number; calYear: number; stats: { happy: number }; eventIds: string[] };
/** score = happiness gain over the previous year + 15 for a major life event + 3 for another non-routine, non-sad event */
export function pickHappiest(years: HapYear[]): Ending['happiest'] {
  let best: { y: HapYear; score: number } | undefined;
  for (let i = 0; i < years.length; i++) {
    const y = years[i]!; if (y.age < 3) continue;
    const prev = years[i - 1]?.stats.happy ?? y.stats.happy;
    const ev = y.eventIds.filter((e) => !ROUTINE_EVENT.test(e) && !SAD.test(e));
    const score = y.stats.happy - prev + (ev.some((e) => MAJOR.has(e)) ? 15 : 0) + (ev.some((e) => !MAJOR.has(e)) ? 3 : 0);
    if (!best || score > best.score || (score === best.score && y.stats.happy > best.y.stats.happy)) best = { y, score };
  }
  if (!best) return undefined;
  const ev = best.y.eventIds.filter((e) => !ROUTINE_EVENT.test(e) && !SAD.test(e));
  const eventId = [...ev].reverse().find((e) => MAJOR.has(e)) ?? [...ev].reverse().find((e) => !e.startsWith('ch_'));
  return { age: best.y.age, year: best.y.calYear, eventId };
}
export function ending(s: LifeState, gdpPc: number): Ending {
  const r = stream(s.seed, 'ending');
  const d = s.death!;
  const happiest = pickHappiest(s.years);
  const poor = gdpPc < 8000, weak = s.stats.health < 40;
  const bands: [string, number][] =
    d.age < 1 ? [['neonatal', 0.6], ['infection', 0.4]]
    : d.age < 5 ? [['infection', 0.5], ['malaria', poor ? 0.3 : 0], ['accident', 0.3]]
    : d.age < 40 ? [['accident', 0.45], ['illness', weak ? 0.4 : 0.25], ['infection', poor ? 0.25 : 0.05], ['violence', 0.08]]
    : d.age < 70 ? [['heart', 0.3], ['cancer', 0.35], ['stroke', 0.15], ['accident', 0.08], ['infection', poor ? 0.15 : 0.03]]
    : [['heart', 0.3], ['cancer', 0.2], ['stroke', 0.15], ['pneumonia', 0.15], ['oldage', 0.25]];
  const tot = bands.reduce((a, b) => a + b[1], 0);
  let u = r.next() * tot, cause = bands[bands.length - 1]![0];
  for (const [k, w] of bands) { if (u < w) { cause = k; break; } u -= w; }
  const kids = s.family.children, spouse = s.family.spouse;
  const opts: string[] = [];
  if (d.age < 13) opts.push('lw_infant');
  else {
    if (kids.length) opts.push('lw_kids', 'lw_kids');
    if (spouse) opts.push('lw_spouse', 'lw_spouse');
    if (d.age < 30) opts.push('lw_young');
    if (s.career.track === 'startup') opts.push('lw_dream');
    if (s.career.city) opts.push('lw_home');
    if (s.econ.employed) opts.push('lw_work');
    if (s.born.quintile <= 2) opts.push('lw_poor');
    if (s.econ.cash > 0 && s.born.quintile >= 4) opts.push('lw_rich');
    opts.push('lw_generic1', 'lw_generic2');
  }
  const lastWords = opts[Math.floor(r.next() * opts.length)]!;
  return { happiest, cause, lastWords, vars: { child: kids[0]?.name ?? '', spouse: spouse?.name ?? '', name: s.name.given } };
}
