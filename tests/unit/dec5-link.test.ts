// Item 5 P1 / v0.21.0: replayable share link (URL fragment, deflate-raw + base64url, whitelisted fields only) + QR.
import { describe, it, expect } from 'vitest';
import { payloadFrom, cfgFrom, encodePayload, replayLink, readHash, MAX_LINK, QR_MAX } from '../../src/ui/logic/replay-link.ts';
import { qrModules } from '../../src/ui/logic/qr.ts';
import type { LifeConfig } from '../../src/engine/life/sim.ts';
import type { Action } from '../../src/engine/life/state.ts';

const cfg: LifeConfig = { seed: 'abcDEF2345', era: { kind: 'past', year: 1987 }, nowYear: 2026, engineVersion: '0.10.0', occ: true, l2: true, id: 'local-id',
  constraints: { country: { kind: 'fixed', value: 'TWN' }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } };
const acts: Action[] = [{ t: 'choice', age: 18, id: 'ch_uni', opt: 'go' }, { t: 'alloc', age: 25, target: { eqWorld: 0.6 } }, { t: 'life', age: 15, key: 'auto', value: 'on' }];
const BASE = 'https://larry-kang.github.io/epochs-of-one/';

describe('replay link', () => {
  it('keeps only whitelisted fields and rebuilds the same config (minus the local id)', () => {
    const junk = { ...cfg, secret: 'diary text' } as LifeConfig;
    const p = payloadFrom(junk, 60, acts, '0.21.0');
    expect(Object.keys(p).sort()).toEqual(['actions', 'era', 'pace', 'seed', 'v', 'x']);
    expect(JSON.stringify(p)).not.toContain('diary text');
    expect(JSON.stringify(p)).not.toContain('local-id');
    const { id: _id, ...rest } = cfg; void _id;
    expect(cfgFrom(p, 2026, '0.10.0')).toEqual(rest);
  });
  it('round-trips through the URL fragment', async () => {
    const p = payloadFrom(cfg, 30, acts, '0.21.0');
    const link = await replayLink(BASE, p);
    expect(link).toMatch(/^https:\/\/larry-kang\.github\.io\/epochs-of-one\/#r=[A-Za-z0-9_-]+$/);
    const r = await readHash(new URL(link!).hash, '0.21.0');
    expect(r).toEqual({ ok: true, p });
  });
  it('refuses links from another version, with the version named', async () => {
    const h = '#r=' + await encodePayload(payloadFrom(cfg, 60, acts, '0.20.0'));
    expect(await readHash(h, '0.21.0')).toEqual({ ok: false, reason: 'version', v: '0.20.0' });
  });
  it('rejects garbage and malformed payloads', async () => {
    expect(await readHash('#r=@@@', '0.21.0')).toEqual({ ok: false, reason: 'bad' });
    expect(await readHash('#r=', '0.21.0')).toEqual({ ok: false, reason: 'bad' });
    const bad = async (o: unknown) => readHash('#r=' + await encodePayload(o as never), '0.21.0');
    const ok = payloadFrom(cfg, 60, acts, '0.21.0');
    expect(await bad({ ...ok, seed: 'bad seed!' })).toEqual({ ok: false, reason: 'bad' });
    expect(await bad({ ...ok, pace: 45 })).toEqual({ ok: false, reason: 'bad' });
    expect(await bad({ ...ok, actions: [{ t: 1 }] })).toEqual({ ok: false, reason: 'bad' });
    expect(await bad({ ...ok, era: { kind: 'mars' } })).toEqual({ ok: false, reason: 'bad' });
    expect(await bad({ ...ok, x: { evil: 1 } })).toEqual({ ok: false, reason: 'bad' });
  });
  it('gives no link when it would be too long', async () => {
    const many: Action[] = Array.from({ length: 4000 }, (_, i) => ({ t: 'choice', age: i % 90, id: 'c' + ((i * 2654435761) >>> 0).toString(36), opt: String(i) }));
    expect(await replayLink(BASE, payloadFrom(cfg, 60, many, '0.21.0'))).toBeNull();
    expect(MAX_LINK).toBe(8000); expect(QR_MAX).toBe(1200);
  });
});

describe('qr', () => {
  it('is deterministic, grows with the text, and fits a QR_MAX link', () => {
    const a = qrModules('https://example.org/#r=abc'), b = qrModules('https://example.org/#r=abc');
    expect(a.size).toBe(b.size);
    expect(Array.from({ length: a.size }, (_, i) => a.on(i, i))).toEqual(Array.from({ length: b.size }, (_, i) => b.on(i, i)));
    const big = qrModules(BASE + '#r=' + 'x'.repeat(QR_MAX - BASE.length - 3));
    expect(big.size).toBeGreaterThan(a.size);
    expect(big.on(0, 0)).toBe(true); // finder pattern corner
  });
});
