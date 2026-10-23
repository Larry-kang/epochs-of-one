// L2/L3 licence gate additions: TW OGDL 1.0 / JP PDL 1.0 / US PD / law facts allowed; TW reserved-rights PDFs, GODL-India
// (not yet reviewed), WHO, ISSA, CN/NG NBS and KOGL 2–4 still blocked; the L2 files ship with law-fact provenance.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error untyped .mjs pipeline module
import { licenseGate, LICENCE_ALLOW } from '../../pipeline/license-gate.mjs';

type Src = { id: string; license: { id: string; class: string } };
const registry = JSON.parse(readFileSync('pipeline/sources.json', 'utf8')) as Src[];
const reg = (id: string) => registry.find((s) => s.id === id)!;
const file = (path: string, ids: string[], lic: string[]) => ({ path, sha256: '0'.repeat(64), src: ids, license: lic, retrieved: '2026-10-17', url: ['https://x'], schema: 's', transform: 'hand-compiled facts' });
const gate = (ids: string[]) => { const s = ids.map(reg); return licenseGate({ manifest: { sources: s, files: [file('l2/x.json', ids, [...new Set(s.map((x) => x.license.id))])] }, sources: s }); };

describe('L2 licence gate', () => {
  it('allows the TW/JP/US open-data licences and law facts (registered, on the allowlist)', () => {
    for (const id of ['tw-data-gov', 'jp-pdl', 'us-federal-pd', 'law-tw', 'law-kr', 'law-us', 'law-jp', 'law-facts', 'kr-kogl1']) { expect(reg(id), id).toBeTruthy(); expect(gate([id]).ok, id).toBe(true); }
    for (const l of ['OGDL-TW-1.0', 'JP-PDL-1.0', 'US-PD', 'L-facts', 'KOGL-1']) expect(LICENCE_ALLOW.has(l)).toBe(true);
  });
  it('blocks TW reserved-rights PDFs, KOGL 2–4, WHO, ISSA, CN/NG NBS; GODL-India is not on the allowlist', () => {
    for (const id of ['tw-reserved-pdf', 'kr-kogl2-4', 'who-gho', 'issa', 'cn-nbs', 'ng-nbs']) expect(gate([id]).ok, id).toBe(false);
    expect(LICENCE_ALLOW.has('GODL-India')).toBe(false);
  });
  it('a law-fact file mixed with a blocked source fails', () => {
    expect(gate(['law-tw', 'who-gho']).ok).toBe(false);
  });
  it('TW OGDL and JP PDL licence pages are archived and state CC BY 4.0 compatibility', () => {
    const tw = readFileSync('pipeline/licenses/2026-10-17_data.gov.tw_license.html', 'utf8'); expect(tw).toContain('創用CC授權 姓名標示 4.0');
    const jp = readFileSync('pipeline/licenses/2026-10-17_www.digital.go.jp_resources_open_data_public_data_license_v1.0.html', 'utf8'); expect(jp).toContain('互換性');
  });
});
