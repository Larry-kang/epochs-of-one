// Item 5 P1 / v0.21.0 (B1): replayable share link in the URL fragment (never sent to a server).
// Payload = { v, seed, era, pace, actions, x? }; x holds only the config fields replay needs (whitelist XKEYS).
// Journal notes and epitaphs live in localStorage and are never read here, so they can never enter a link.
// deflate-raw (built-in CompressionStream) + base64url. Another app version → refused with the version named.
// First draft: OpenRouter nemotron-3-ultra:free (OpenCode deepseek free timed out); rewritten by hand.
import type { LifeConfig, Era } from '../../engine/life/sim.ts';
import type { Action } from '../../engine/life/state.ts';
import { SEED_RE } from '../../engine/rng/streams.ts';

export const MAX_LINK = 8000;
export const QR_MAX = 1200;
const MAX_JSON = 256 * 1024;
export const XKEYS = ['constraints', 'by', 'occ', 'occFrom', 'l2', 'l2From', 'autoFocus', 'autoSpend'] as const;
type XKey = (typeof XKEYS)[number];
export interface ReplayPayload { v: string; seed: string; era: Era; pace: 30 | 60 | 90; actions: Action[]; x?: Partial<Pick<LifeConfig, XKey>> }
export type ReadResult = { ok: true; p: ReplayPayload } | { ok: false; reason: 'bad' | 'version'; v?: string };

export function payloadFrom(cfg: LifeConfig, pace: 30 | 60 | 90, actions: Action[], v: string): ReplayPayload {
  const x: Record<string, unknown> = {};
  for (const k of XKEYS) if (cfg[k] !== undefined) x[k] = cfg[k];
  const p: ReplayPayload = { v, seed: cfg.seed, era: cfg.era, pace, actions: actions.filter((a) => 'age' in a) };
  if (Object.keys(x).length) p.x = x as ReplayPayload['x'];
  return p;
}
export function cfgFrom(p: ReplayPayload, nowYear: number, engineVersion: string): LifeConfig {
  return { seed: p.seed, era: p.era, nowYear, engineVersion, ...(p.x ?? {}) };
}

const b64u = (b: Uint8Array): string => { let s = ''; for (const c of b) s += String.fromCharCode(c); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
function unb64u(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s) || s.length % 4 === 1) return null;
  try { const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); } catch { return null; }
}
async function pipe(data: Uint8Array, ts: CompressionStream | DecompressionStream, cap = Infinity): Promise<Uint8Array | null> {
  const w = ts.writable.getWriter(); void w.write(data as Uint8Array<ArrayBuffer>).catch(() => undefined); void w.close().catch(() => undefined);
  const r = ts.readable.getReader(); const parts: Uint8Array[] = []; let n = 0;
  for (;;) { const { done, value } = await r.read(); if (done) break; n += value.length; if (n > cap) { void r.cancel(); return null; } parts.push(value); }
  const out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
export async function encodePayload(p: ReplayPayload): Promise<string> {
  return b64u((await pipe(new TextEncoder().encode(JSON.stringify(p)), new CompressionStream('deflate-raw')))!);
}
export async function replayLink(base: string, p: ReplayPayload): Promise<string | null> {
  const link = `${base.split('#')[0]}#r=${await encodePayload(p)}`;
  return link.length > MAX_LINK ? null : link;
}

const isObj = (o: unknown): o is Record<string, unknown> => !!o && typeof o === 'object' && !Array.isArray(o);
const yearOk = (y: unknown) => y === 'random' || (Number.isInteger(y) && (y as number) > 1800 && (y as number) < 2200);
function validEra(e: unknown): e is Era {
  if (!isObj(e)) return false;
  if (e.kind === 'now') return Object.keys(e).length === 1;
  return (e.kind === 'past' || e.kind === 'future') && yearOk(e.year) && Object.keys(e).length === 2;
}
function valid(o: unknown): o is ReplayPayload {
  if (!isObj(o) || typeof o.v !== 'string' || typeof o.seed !== 'string' || !SEED_RE.test(o.seed)) return false;
  if (o.pace !== 30 && o.pace !== 60 && o.pace !== 90) return false;
  if (!validEra(o.era) || !Array.isArray(o.actions)) return false;
  if (!o.actions.every((a) => isObj(a) && typeof a.t === 'string')) return false;
  if (o.x !== undefined && (!isObj(o.x) || !Object.keys(o.x).every((k) => (XKEYS as readonly string[]).includes(k)))) return false;
  return Object.keys(o).every((k) => ['v', 'seed', 'era', 'pace', 'actions', 'x'].includes(k));
}
export async function readHash(hash: string, curV: string): Promise<ReadResult> {
  try {
    if (!hash.startsWith('#r=')) return { ok: false, reason: 'bad' };
    const bytes = unb64u(hash.slice(3));
    if (!bytes) return { ok: false, reason: 'bad' };
    const raw = await pipe(bytes, new DecompressionStream('deflate-raw'), MAX_JSON);
    if (!raw) return { ok: false, reason: 'bad' };
    const o = JSON.parse(new TextDecoder().decode(raw)) as unknown;
    if (!valid(o)) return { ok: false, reason: 'bad' };
    if (o.v !== curV) return { ok: false, reason: 'version', v: o.v };
    return { ok: true, p: o };
  } catch { return { ok: false, reason: 'bad' }; }
}
