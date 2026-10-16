// L1 licence gate (localization-plan build gate): allowlist, provenance, share-alike isolation, blocked sources, WDI audit,
// and the real shipped manifest passing it.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error untyped .mjs pipeline module
import { licenseGate } from '../../pipeline/license-gate.mjs';
// @ts-expect-error untyped .mjs pipeline module
import { PAG_KEEP, PAG_DROP, NO_NATIONAL } from '../../pipeline/l1.mjs';

type Src = { id: string; name: string; url: string; retrieved: string; license: { id: string; class: string; url: string } };
const src = (id: string, cls: string, lic = 'CC-BY-4.0'): Src => ({ id, name: id, url: 'https://x', retrieved: '2026-10-17', license: { id: lic, class: cls, url: 'https://x' } });
const file = (path: string, ids: string[], lic: string[] = ['CC-BY-4.0'], over: Record<string, unknown> = {}) =>
  ({ path, sha256: '0'.repeat(64), src: ids, license: lic, retrieved: '2026-10-17', url: ['https://x'], schema: 's', transform: 'rounded, % → proportion', ...over });
const gate = (sources: Src[], files: ReturnType<typeof file>[], wdi?: unknown) => licenseGate({ manifest: { sources, files }, sources, wdi });
const registry = JSON.parse(readFileSync('pipeline/sources.json', 'utf8')) as Src[];
const reg = (id: string) => registry.find((s) => s.id === id)!;

describe('L1 licence gate', () => {
  it('the shipped manifest passes (every file: source, URL, licence, retrieval date, transform)', () => {
    const r = licenseGate({ manifest: JSON.parse(readFileSync('public/data/manifest.json', 'utf8')), sources: registry, dataDir: 'public/data',
      wdi: JSON.parse(readFileSync('pipeline/l1/wdi-licences.json', 'utf8')) });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
  for (const k of ['transform', 'retrieved', 'url', 'license', 'src']) {
    it(`fails when a file lacks ${k}`, () => {
      const over = { [k]: k === 'transform' || k === 'retrieved' ? '' : [] };
      expect(gate([src('a', 'attribution')], [file('x.json', ['a'], ['CC-BY-4.0'], over)]).ok).toBe(false);
    });
  }
  it('fails for an unknown / unlicensed source and an unregistered one', () => {
    expect(gate([src('a', 'unknown', 'none')], [file('x.json', ['a'], ['none'])]).ok).toBe(false);
    expect(gate([], [file('x.json', ['zzz'])]).ok).toBe(false);
  });
  it('fails for a licence id not on the allowlist, even if classed attribution', () => {
    expect(gate([src('a', 'attribution', 'CC-BY-NC-4.0')], [file('x.json', ['a'], ['CC-BY-NC-4.0'])]).ok).toBe(false);
  });
  it('blocks WHO, ISSA, CN NBS, NG NBS, KOGL 2–4 and OECD third-party series (registered as blocked)', () => {
    for (const id of ['who-gho', 'issa', 'cn-nbs', 'ng-nbs', 'kr-kogl2-4', 'oecd-thirdparty', 'oecd-share-prices', 'wb-sp-equity']) {
      const s = reg(id); expect(s, id).toBeTruthy();
      expect(gate([s], [file(`${id}.json`, [id], [s.license.id])]).ok, id).toBe(false);
    }
  });
  it('allows KOGL Type 1', () => {
    const s = reg('kr-kogl1'); expect(gate([s], [file('kr.json', ['kr-kogl1'], ['KOGL-1'])]).ok).toBe(true);
  });
  it('UIS (CC BY-SA 4.0) only alone in a file under sa/', () => {
    const u = reg('uis'), w = src('wdi', 'attribution');
    expect(u.license.id).toBe('CC-BY-SA-4.0');
    expect(gate([u], [file('sa/uis.json', ['uis'], ['CC-BY-SA-4.0'])]).ok).toBe(true);
    expect(gate([u], [file('l1/uis.json', ['uis'], ['CC-BY-SA-4.0'])]).ok).toBe(false);
    expect(gate([u, w], [file('sa/mix.json', ['uis', 'wdi'], ['CC-BY-SA-4.0', 'CC-BY-4.0'])]).ok).toBe(false);
    expect(gate([w], [file('sa/wdi.json', ['wdi'])]).ok).toBe(false);
  });
  it('fails when a World Bank indicator is not CC BY 4.0', () => {
    const w = src('wdi', 'attribution');
    expect(gate([w], [file('x.json', ['wdi'])], { indicators: { 'X.Y': { license: 'CC BY-4.0' } } }).ok).toBe(true);
    expect(gate([w], [file('x.json', ['wdi'])], { indicators: { 'X.Y': { license: 'Custom (see terms)' } } }).ok).toBe(false);
  });
  it('every WDI indicator the project ships is CC BY 4.0', () => {
    const w = JSON.parse(readFileSync('pipeline/l1/wdi-licences.json', 'utf8')) as { indicators: Record<string, { license: string }> };
    expect(Object.keys(w.indicators).length).toBeGreaterThanOrEqual(20);
    for (const [c, m] of Object.entries(w.indicators)) expect(m.license, c).toBe('CC BY-4.0');
  });
  it('PaG: shipped measures are OECD-model outputs only; third-party-derived measures dropped', () => {
    const p = JSON.parse(readFileSync('public/data/l1/pag2025.json', 'utf8')) as { data: Record<string, Record<string, unknown>> };
    const keys = new Set(Object.values(p.data).flatMap((r) => Object.keys(r).map((k) => k.replace(/_[MF]$/, ''))));
    for (const k of keys) { expect(Object.keys(PAG_KEEP)).toContain(k); expect(PAG_DROP).not.toContain(k); }
  });
  it('no source in the manifest is a national statistics office without an open licence', () => {
    const m = JSON.parse(readFileSync('public/data/manifest.json', 'utf8')) as { files: { src: string[] }[] };
    const used = new Set(m.files.flatMap((f) => f.src));
    for (const id of ['cn-nbs', 'ng-nbs', 'who-gho', 'issa', 'oecd-thirdparty', 'kr-kogl2-4']) expect(used.has(id), id).toBe(false);
    expect(NO_NATIONAL).toEqual(['CHN', 'NGA']);
  });
  it('v0.10.0: OECD share prices are gone from markets.json (blocked source; US/world equity = 推估 GDP model)', () => {
    const m = JSON.parse(readFileSync('public/data/manifest.json', 'utf8')) as { files: { path: string; src: string[]; url: string[] }[] };
    const f = m.files.find((x) => x.path === 'markets/markets.json')!;
    expect(f.src).not.toContain('oecd'); expect(f.src).not.toContain('oecd-share-prices');
    expect(f.url.join(' ')).not.toMatch(/DF_FINMARK/);
    const mk = JSON.parse(readFileSync('public/data/markets/markets.json', 'utf8')) as { eq: Record<string, { src: string; kind: string; est?: boolean }>; world: { src: string; kind: string; est?: boolean } };
    for (const [iso, s] of Object.entries(mk.eq)) expect(s.src, iso).not.toMatch(/oecd/);
    expect(mk.eq.USA).toMatchObject({ kind: 'model_ngdp', src: 'wdi', est: true });
    expect(mk.world).toMatchObject({ kind: 'model_ngdp', src: 'wdi', est: true });
  });
});
