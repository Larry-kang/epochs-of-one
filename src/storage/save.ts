// localStorage persistence (versioned keys). Saves the replayable recipe (config + years simulated),
// not the whole state: the engine is deterministic, so restoring = re-running.
import { APP } from '../config.ts';
import type { LifeConfig } from '../engine/life/sim.ts';
import type { Action } from '../engine/life/state.ts';

export interface SaveV1 { v: 1; cfg: LifeConfig; paceMin: 30 | 60 | 90; years: number; speed: number; /** recorded player decisions (M4+) for deterministic replay */ actions?: Action[] }
export interface PastLife { id: string; seed: string; iso: string; name: string; year: number; age: number; netWorth: number; at: number;
  /** batch 1 (H11): replay recipe so the death record can be reopened */ cfg?: LifeConfig; years?: number; actions?: Action[]; paceMin?: 30 | 60 | 90;
  /** v0.8.1: death-record snapshot (companion percentiles + sample size) so reopening never re-simulates the peer sample */ rec?: PastRecord }
export interface PastRecord { rk: { lifespan: number; lifetimeIncome: number | null; finalNetWorth: number | null }; peersN: number }

const K_SAVE = `${APP.storagePrefix}.save.v1`;
const K_LIVES = `${APP.storagePrefix}.lives.v1`;
const mem = new Map<string, string>();
let warned = false;

function store(): Storage | null {
  try { const s = window.localStorage; const k = `${APP.storagePrefix}.probe`; s.setItem(k, '1'); s.removeItem(k); return s; } catch { return null; }
}
export function storageAvailable(): boolean { return store() !== null; }
function get(k: string): string | null { const s = store(); return s ? s.getItem(k) : mem.get(k) ?? null; }
function set(k: string, v: string): void {
  const s = store();
  try { if (s) { s.setItem(k, v); return; } } catch { /* quota → memory */ }
  if (!warned) warned = true;
  mem.set(k, v);
}
function del(k: string): void { const s = store(); if (s) s.removeItem(k); mem.delete(k); }

export function loadSave(): SaveV1 | null {
  const raw = get(K_SAVE);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as SaveV1;
    if (o.v !== 1 || typeof o.cfg?.seed !== 'string' || !Number.isInteger(o.years) || o.years < 0) return null;
    if (o.actions !== undefined && !Array.isArray(o.actions)) return null;
    return o;
  } catch { return null; }
}
export const writeSave = (s: SaveV1) => set(K_SAVE, JSON.stringify(s));
export const clearSave = () => del(K_SAVE);
/** v0.8.1: tolerant read — old/partial entries (null, missing name, non-numeric fields) are repaired or dropped, never thrown on.
 *  (A past life without a name used to throw in the home render and leave a blank page.) */
export function repairPastLife(x: unknown): PastLife | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const o = x as Record<string, unknown>;
  const str = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d);
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const seed = str(o.seed, ''), iso = str(o.iso, '');
  const id = str(o.id, seed ? `${seed}-${iso}` : '');
  if (!id) return null;
  const year = num(o.year, 0), age = num(o.age, 0);
  const p: PastLife = { id, seed, iso, name: str(o.name, seed || id), year, age, netWorth: num(o.netWorth, 0), at: num(o.at, year + age) };
  const c = o.cfg as Record<string, unknown> | undefined;
  if (c && typeof c === 'object' && typeof c.seed === 'string' && c.era && typeof c.era === 'object') p.cfg = c as unknown as LifeConfig;
  if (Number.isInteger(o.years) && (o.years as number) >= 0) p.years = o.years as number;
  if (Array.isArray(o.actions)) p.actions = (o.actions as unknown[]).filter((a): a is Action => !!a && typeof a === 'object' && typeof (a as { t?: unknown }).t === 'string');
  if (o.paceMin === 30 || o.paceMin === 60 || o.paceMin === 90) p.paceMin = o.paceMin;
  const r = o.rec as PastRecord | undefined;
  if (r && typeof r === 'object' && r.rk && typeof r.rk.lifespan === 'number' && typeof r.peersN === 'number') p.rec = r;
  return p;
}
export function pastLives(): PastLife[] {
  let a: unknown;
  try { a = JSON.parse(get(K_LIVES) ?? '[]'); } catch { return []; }
  if (!Array.isArray(a)) return [];
  const out: PastLife[] = [];
  for (const x of a) { const p = repairPastLife(x); if (p && !out.some((q) => q.id === p.id)) out.push(p); if (out.length >= 20) break; }
  return out;
}
export function addPastLife(p: PastLife): void {
  const a = pastLives().filter((x) => x.id !== p.id);
  a.unshift(p);
  set(K_LIVES, JSON.stringify(a.slice(0, 20)));
}
