// Batch 2 P14: spend & lifestyle sheet. Purchases are recorded actions {t:'buy', age, id} applied between years;
// lifestyle settings are recorded {t:'life', age, key, value} and take effect every following year. Prices are
// multiples of the country's mean annual income that year (so they scale across countries and eras). All numbers are
// game-design content (not empirical) and never touch the mortality draw. Default settings have no effect.
import type { Action, LifeState, Stats } from './state.ts';
import type { DataBundle } from './sim.ts';
import { incomeDist } from './sim.ts';

type Fx = Partial<Record<keyof Stats, number>>;
export type Need = 'spouse' | 'kids' | 'parents' | 'owner' | 'renter' | 'working' | 'retired';
/** [id, ageFrom, ageTo, price × mean income, stat chips, cooldown years (0 = once per life), needs] */
type Row = [string, number, number, number, Fx, number, Need[]?];
const R: Row[] = [
  // free / everyday
  ['library', 6, 100, 0, { smart: 2 }, 1], ['parkWalk', 6, 100, 0, { health: 1, happy: 1 }, 1], ['callFriend', 10, 100, 0, { social: 2 }, 1],
  // childhood & study
  ['toys', 6, 12, 0.01, { happy: 3 }, 1], ['bike', 6, 16, 0.02, { health: 2, happy: 2 }, 5], ['tutor', 8, 18, 0.05, { smart: 4, happy: -1 }, 1],
  ['summerCamp', 8, 16, 0.04, { social: 3, happy: 2 }, 1], ['musicLessons', 6, 18, 0.05, { smart: 2, happy: 2 }, 1], ['sportsClub', 6, 18, 0.03, { health: 3, social: 1 }, 1],
  ['console', 10, 30, 0.04, { happy: 4, smart: -1 }, 5],
  // gadgets & mobility
  ['phone', 12, 90, 0.03, { social: 2 }, 3], ['laptop', 14, 80, 0.06, { smart: 2 }, 4], ['onlineCourse', 16, 80, 0.02, { smart: 3 }, 1],
  ['languageCourse', 16, 70, 0.05, { smart: 3, social: 1 }, 2], ['license', 18, 50, 0.03, { happy: 2 }, 0], ['car', 20, 80, 0.6, { happy: 4, social: 1 }, 8],
  ['motorbike', 18, 70, 0.15, { happy: 3 }, 8], ['ebike', 16, 80, 0.05, { health: 1, happy: 2 }, 6],
  // leisure
  ['tripHome', 16, 95, 0.04, { happy: 4 }, 1], ['tripAbroad', 18, 90, 0.15, { happy: 6, smart: 1 }, 2], ['cruise', 25, 90, 0.4, { happy: 7 }, 5],
  ['concert', 14, 85, 0.01, { happy: 3 }, 1], ['dining', 18, 95, 0.01, { happy: 2, social: 1 }, 1], ['spa', 25, 95, 0.02, { health: 1, happy: 2 }, 1],
  ['camera', 16, 85, 0.06, { happy: 3, smart: 1 }, 5], ['instrument', 12, 85, 0.05, { happy: 3, smart: 1 }, 10], ['artClass', 10, 95, 0.03, { happy: 2, smart: 1 }, 2],
  ['collection', 30, 95, 0.05, { happy: 2 }, 3],
  // health
  ['gym', 16, 90, 0.03, { health: 3 }, 1], ['checkup', 30, 100, 0.02, { health: 2 }, 2], ['dental', 18, 100, 0.02, { health: 2 }, 3],
  ['laser', 22, 55, 0.08, { health: 2, happy: 2 }, 0], ['therapy', 16, 100, 0.05, { happy: 4 }, 2], ['hearingAid', 65, 110, 0.05, { health: 1, social: 2 }, 0],
  ['scooter', 75, 110, 0.1, { happy: 2 }, 0],
  // love & family
  ['banquet', 20, 70, 0.5, { social: 5, happy: 5 }, 0, ['spouse']], ['honeymoon', 20, 75, 0.2, { happy: 6 }, 0, ['spouse']], ['anniversary', 20, 100, 0.02, { happy: 2 }, 1, ['spouse']],
  ['eduFund', 22, 70, 0.2, { happy: 2 }, 5, ['kids']], ['familyPhoto', 22, 100, 0.01, { happy: 2 }, 3, ['kids']], ['pet', 8, 85, 0.03, { happy: 5 }, 12],
  ['giftParents', 16, 80, 0.03, { social: 2, happy: 2 }, 1, ['parents']], ['tripParents', 20, 80, 0.1, { happy: 4, social: 2 }, 4, ['parents']],
  ['parentsCare', 40, 80, 0.2, { social: 3 }, 5, ['parents']],
  // giving & home
  ['donateSmall', 16, 110, 0.02, { happy: 2, social: 1 }, 1], ['donateBig', 25, 110, 0.2, { happy: 4, social: 3 }, 5],
  ['renovate', 25, 95, 0.3, { happy: 4 }, 10, ['owner']], ['furniture', 18, 95, 0.05, { happy: 2 }, 5], ['biggerFlat', 20, 90, 0.1, { happy: 3 }, 3, ['renter', 'working']],
  ['garden', 25, 100, 0.02, { happy: 2, health: 1 }, 5, ['owner']],
  // v0.8.0: house (bought through the house panel), gifts, allowance to parents
  ['house', 22, 90, 3, { happy: 5 }, 0], ['gift', 14, 100, 0.01, { social: 2, happy: 1 }, 1], ['allowance', 18, 90, 0.04, { happy: 1, social: 1 }, 1, ['parents']],
  // career & later life
  ['mba', 25, 45, 0.8, { smart: 6 }, 0, ['working']], ['certificate', 20, 60, 0.1, { smart: 3 }, 5, ['working']], ['seniorUni', 60, 100, 0.02, { smart: 2, social: 2 }, 2, ['retired']],
];
export type Kind = 'item' | 'spend' | 'other';
export type Cat = 'item' | 'family' | 'health' | 'learn' | 'give' | 'home' | 'fun' | 'other';
/** v0.8.0: owned things (can be sold) need cash ≥ minCash × price, not just the price */
const OWNED: Record<string, number> = { phone: 2, laptop: 2, motorbike: 2, car: 2.5, house: 1 };
const SPEND = ['dining', 'tripHome', 'tripAbroad', 'gift', 'allowance', 'checkup', 'onlineCourse', 'donateSmall', 'concert', 'spa', 'cruise', 'giftParents', 'tripParents', 'languageCourse', 'donateBig', 'anniversary'];
const CATS: Record<Cat, string[]> = {
  item: ['phone', 'laptop', 'motorbike', 'car', 'house', 'ebike', 'bike', 'scooter', 'license'],
  family: ['allowance', 'gift', 'giftParents', 'tripParents', 'parentsCare', 'anniversary', 'familyPhoto', 'eduFund', 'banquet', 'honeymoon', 'pet', 'callFriend'],
  health: ['gym', 'checkup', 'dental', 'laser', 'therapy', 'hearingAid', 'parkWalk', 'sportsClub'],
  learn: ['library', 'tutor', 'musicLessons', 'onlineCourse', 'languageCourse', 'mba', 'certificate', 'seniorUni', 'artClass', 'instrument'],
  give: ['donateSmall', 'donateBig'], home: ['renovate', 'furniture', 'biggerFlat', 'garden'],
  fun: ['toys', 'console', 'tripHome', 'tripAbroad', 'cruise', 'concert', 'dining', 'spa', 'camera', 'collection', 'summerCamp'], other: [],
};
export const SPEND_CATS = (Object.keys(CATS) as Cat[]).filter((c) => c !== 'other');
const catOf = (id: string): Cat => (Object.keys(CATS) as Cat[]).find((c) => CATS[c].includes(id)) ?? 'other';
/** family-bond points (flags.bond, 0–100, starts at 50) */
const BOND: Record<string, number> = { allowance: 4, gift: 2, giftParents: 3, tripParents: 4, parentsCare: 5, anniversary: 3, familyPhoto: 2, dining: 1, honeymoon: 4, banquet: 3, callFriend: 1 };
export interface Item { id: string; from: number; to: number; price: number; fx: Fx; cd: number; needs: Need[]; kind: Kind; cat: Cat; minCash: number; bond: number }
export const ITEMS: Item[] = R.map(([id, from, to, price, fx, cd, needs]) => ({ id, from, to, price, fx, cd, needs: needs ?? [],
  kind: id in OWNED ? 'item' : SPEND.includes(id) ? 'spend' : 'other', cat: catOf(id), minCash: OWNED[id] ?? 1, bond: BOND[id] ?? 0 }));
export const spendOpen = (age: number) => age >= 15;
/** v0.8.0: under 18 spending is capped at the minor's own savings plus a yearly parents' allowance (2% of mean income); savings never go negative */
export const MINOR_AGE = 18;
export const parentsAllowance = (data: DataBundle, s: LifeState) => (s.age < MINOR_AGE ? Math.round(0.02 * priceUnit(data, s)) : 0);
/** money a purchase may use: adults their cash; minors max(0, cash) + allowance not yet used this year */
export function budget(data: DataBundle, s: LifeState): number {
  if (s.age >= MINOR_AGE) return Math.max(0, s.econ.cash);
  const used = Number(s.flags['allow:' + s.age] ?? 0);
  return Math.max(0, s.econ.cash) + Math.max(0, parentsAllowance(data, s) - used);
}
export const itemById = (id: string) => ITEMS.find((i) => i.id === id);

/** mean annual income (real) of the current country this year: the price unit */
export function priceUnit(data: DataBundle, s: LifeState): number { return incomeDist(data.country(s.cur), s.born.year + s.age).d.mean; }
export const priceOf = (data: DataBundle, s: LifeState, id: string) => Math.round((itemById(id)?.price ?? 0) * priceUnit(data, s));

const needOk = (s: LifeState, n: Need) => {
  switch (n) {
    case 'spouse': return !!s.family.spouse; case 'kids': return s.family.children.length > 0; case 'parents': return s.family.parentsAlive;
    case 'owner': return !!s.house; case 'renter': return !s.house; case 'working': return s.econ.employed; case 'retired': return s.econ.retired;
  }
};
export type Why = 'age' | 'need' | 'cooldown' | 'cash';
export function itemState(data: DataBundle, s: LifeState, id: string): { ok: boolean; why?: Why; price: number } {
  const it = itemById(id); if (!it) return { ok: false, why: 'need', price: 0 };
  const price = priceOf(data, s, id);
  if (s.age < it.from || s.age > it.to) return { ok: false, why: 'age', price };
  if (!it.needs.every((n) => needOk(s, n))) return { ok: false, why: 'need', price };
  const last = lastBuy(s.actions, id);
  if (last !== undefined && (it.cd === 0 || s.age - last < it.cd)) return { ok: false, why: 'cooldown', price };
  if (price > 0 && budget(data, s) < price * it.minCash) return { ok: false, why: 'cash', price };
  return { ok: true, price };
}
function lastBuy(actions: Action[], id: string): number | undefined {
  let at: number | undefined; for (const a of actions) if (a.t === 'buy' && a.id === id) at = a.age; return at;
}
/** applied by applyAction; returns null when invalid in this state (then not recorded) */
export function buy(data: DataBundle, s: LifeState, id: string): { cash: number; stats: Stats; bond: number; allow?: number } | null {
  if (id === 'house') return null; // the house panel handles mortgages
  const st = itemState(data, s, id); if (!st.ok) return null;
  const it = itemById(id)!; const stats = { ...s.stats };
  for (const [k, v] of Object.entries(it.fx) as [keyof Stats, number][]) stats[k] = Math.max(0, Math.min(100, stats[k] + v));
  if (s.age < MINOR_AGE) { // own savings first, then the parents' allowance
    const own = Math.max(0, s.econ.cash); const fromAllow = Math.max(0, st.price - own);
    return { cash: Math.max(0, s.econ.cash) - Math.min(own, st.price), stats, bond: bondAdd(s, it.bond), allow: fromAllow };
  }
  return { cash: s.econ.cash - st.price, stats, bond: bondAdd(s, it.bond) };
}
export const bondOf = (s: LifeState) => Number(s.flags.bond ?? 50);
export const bondAdd = (s: LifeState, d: number) => Math.max(0, Math.min(100, bondOf(s) + d));
/** owned = bought and not sold since (house: owning a house) */
export function owned(s: LifeState, id: string): boolean {
  if (id === 'house') return !!s.house;
  let o = false; for (const a of s.actions) { if (a.t === 'buy' && a.id === id) o = true; else if (a.t === 'sell' && a.id === id) o = false; } return o;
}
/** resale: 60% of today's price, losing 20% a year, floor 5% */
export function sellState(data: DataBundle, s: LifeState, id: string): { ok: boolean; value: number } {
  const it = itemById(id); if (!it || it.kind !== 'item' || id === 'house' || !owned(s, id)) return { ok: false, value: 0 };
  const yrs = Math.max(0, s.age - (lastBuy(s.actions, id) ?? s.age));
  return { ok: true, value: Math.round(priceOf(data, s, id) * Math.max(0.05, 0.6 * 0.8 ** yrs)) };
}
export function sell(data: DataBundle, s: LifeState, id: string): { cash: number; stats: Stats } | null {
  const st = sellState(data, s, id); if (!st.ok) return null;
  return { cash: s.econ.cash + st.value, stats: { ...s.stats, happy: Math.max(0, s.stats.happy - 1) } };
}
/** a parent alive and 70+ this year */
export function parentOld(s: LifeState): boolean {
  const y = s.born.year + s.age; return s.family.parentsAlive && (y - s.family.mother.born >= 70 || y - s.family.father.born >= 70);
}
export function heavyDebt(data: DataBundle, s: LifeState): boolean {
  const loans = s.loans.reduce((a, l) => a + Math.max(0, Number((l as unknown as { balance?: number }).balance ?? 0)), 0);
  return Math.max(0, -s.econ.cash) + loans > 2 * Math.max(s.econ.incomeReal, 0.5 * priceUnit(data, s));
}
/** v0.8.0 situation sort: available ids plus 'sell:<id>' rows. Allowance first when a parent is 70+, selling first when
 * debt is heavy, entertainment always last; otherwise favour the weakest stat and cheaper items. */
export function situationSort(data: DataBundle, s: LifeState): string[] {
  const weak = (Object.entries(s.stats) as [keyof Stats, number][]).sort((a, b) => a[1] - b[1]).map(([k]) => k);
  const debt = heavyDebt(data, s), old = parentOld(s);
  const rows: [string, number][] = [];
  for (const it of ITEMS) {
    if (it.id !== 'house' && itemState(data, s, it.id).ok) {
      let sc = (it.fx[weak[0]!] ?? 0) * 3 + (it.fx[weak[1]!] ?? 0) - it.price * 10;
      if (it.id === 'allowance' && old) sc += 1000;
      if (it.cat === 'fun') sc -= 3000;
      rows.push([it.id, sc]);
    }
    if (sellState(data, s, it.id).ok) rows.push(['sell:' + it.id, debt ? 2000 : -2000]);
  }
  return rows.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id);
}
/** up to 6 "worth doing now": available + affordable, favouring the weakest stat, then cheaper items */
export function recommend(data: DataBundle, s: LifeState, n = 6): string[] {
  const weak = (Object.entries(s.stats) as [keyof Stats, number][]).sort((a, b) => a[1] - b[1]).map(([k]) => k);
  const score = (it: Item) => (it.fx[weak[0]!] ?? 0) * 3 + (it.fx[weak[1]!] ?? 0) - it.price * 10;
  return ITEMS.filter((it) => itemState(data, s, it.id).ok).sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id)).slice(0, n).map((i) => i.id);
}

// ---- lifestyle (applies to independent adults: working or retired)
export interface LifestyleDef { key: string; opts: string[]; def: string }
export const LIFESTYLE: LifestyleDef[] = [
  { key: 'diet', opts: ['frugal', 'normal', 'healthy'], def: 'normal' },
  { key: 'gifts', opts: ['low', 'normal', 'generous'], def: 'normal' },
  { key: 'insure', opts: ['none', 'basic'], def: 'none' },
];
/** auto-routines: the item fires each year when savings exceed 3× its price */
export const ROUTINES = ['giftParents', 'tripHome', 'donateSmall', 'gym', 'checkup', 'allowance', 'dining', 'onlineCourse'] as const;
/** v0.8.0 auto-habits: with auto-choice on, the system turns these on/off each year from the situation */
export const AUTO_HABITS: string[] = ['allowance', 'checkup', 'gym', 'tripHome', 'dining', 'onlineCourse', 'donateSmall'];
export function autoHabits(s: LifeState): string[] {
  const out: string[] = []; const st = s.stats;
  if (s.family.parentsAlive && s.econ.employed) out.push('allowance');
  if (s.age >= 40) out.push('checkup');
  if (st.health < 55) out.push('gym');
  if (st.happy < 55) out.push('tripHome');
  if (st.social < 50) out.push('dining');
  if (st.smart < 35 && s.econ.employed && s.age < 55) out.push('onlineCourse');
  if (s.age >= 50) out.push('donateSmall');
  return out;
}
export function lifestyleAt(actions: Action[], age: number): Record<string, string> {
  const out: Record<string, string> = Object.fromEntries(LIFESTYLE.map((l) => [l.key, l.def]));
  for (const a of actions) if (a.t === 'life' && a.age <= age) out[a.key] = a.value;
  return out;
}
/** yearly lifestyle cost (× mean income) and stat drift */
export function lifestyleYear(ls: Record<string, string>): { cost: number; fx: Fx; oopMult: number } {
  const fx: Fx = {}; let cost = 0, oopMult = 1;
  if (ls.diet === 'frugal') { cost -= 0.03; fx.health = -1; } else if (ls.diet === 'healthy') { cost += 0.05; fx.health = 1; }
  if (ls.gifts === 'low') { fx.social = (fx.social ?? 0) - 1; } else if (ls.gifts === 'normal') cost += 0.01; else if (ls.gifts === 'generous') { cost += 0.03; fx.social = (fx.social ?? 0) + 1; fx.happy = 1; }
  if (ls.insure === 'basic') { cost += 0.03; oopMult = 0.5; }
  // 'normal' gifts are already part of baseline consumption → subtract it so defaults are neutral
  cost -= 0.01;
  return { cost, fx, oopMult };
}
export function routineOn(ls: Record<string, string>, id: string) { return ls['rt:' + id] === 'on'; }
