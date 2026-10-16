// localStorage persistence (versioned keys). Saves the replayable recipe (config + years simulated),
// not the whole state: the engine is deterministic, so restoring = re-running.
import { APP } from '../config.ts';
import type { LifeConfig } from '../engine/life/sim.ts';
import type { Action } from '../engine/life/state.ts';

export interface SaveV1 { v: 1; cfg: LifeConfig; paceMin: 30 | 60 | 90; years: number; speed: number; /** recorded player decisions (M4+) for deterministic replay */ actions?: Action[] }
export interface PastLife { id: string; seed: string; iso: string; name: string; year: number; age: number; netWorth: number; at: number;
  /** batch 1 (H11): replay recipe so the death record can be reopened */ cfg?: LifeConfig; years?: number; actions?: Action[]; paceMin?: 30 | 60 | 90 }

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
export function pastLives(): PastLife[] {
  try { const a = JSON.parse(get(K_LIVES) ?? '[]') as PastLife[]; return Array.isArray(a) ? a.slice(0, 20) : []; } catch { return []; }
}
export function addPastLife(p: PastLife): void {
  const a = pastLives().filter((x) => x.id !== p.id);
  a.unshift(p);
  set(K_LIVES, JSON.stringify(a.slice(0, 20)));
}
