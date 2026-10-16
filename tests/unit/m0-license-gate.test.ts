import { describe, it, expect } from 'vitest';
// @ts-expect-error untyped .mjs pipeline module
import { licenseGate } from '../../pipeline/license-gate.mjs';

const src = (id: string, cls: string) => ({ id, name: id, url: 'https://x', retrieved: '2026-10-16', license: { id: 'L', class: cls, url: 'https://x' } });
const file = (path: string, ids: string[]) => ({ path, sha256: '0'.repeat(64), src: ids, license: ['L'], retrieved: '2026-10-16', url: ['https://x'], schema: 's' });

describe('M0/M1: license gate', () => {
  for (const cls of ['nc', 'restricted', 'unknown']) {
    it(`fails for class=${cls}`, () => {
      const sources = [src('a', cls)];
      const r = licenseGate({ manifest: { sources, files: [file('x.json', ['a'])] }, sources });
      expect(r.ok).toBe(false);
    });
  }
  it('fails for unregistered source', () => {
    const r = licenseGate({ manifest: { sources: [], files: [file('x.json', ['zzz'])] }, sources: [] });
    expect(r.ok).toBe(false);
  });
  it('passes for open/attribution', () => {
    const sources = [src('a', 'open'), src('b', 'attribution')];
    const r = licenseGate({ manifest: { sources, files: [file('x.json', ['a', 'b'])] }, sources });
    expect(r.ok).toBe(true);
  });
});
