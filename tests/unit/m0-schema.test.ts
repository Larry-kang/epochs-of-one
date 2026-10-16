import { describe, it, expect } from 'vitest';
// @ts-expect-error untyped .mjs pipeline module
import { makeAjv } from '../../pipeline/validate.mjs';

describe('M0: JSON Schema validation', () => {
  const ajv = makeAjv(process.cwd());
  it('accepts a valid series', () => {
    expect(ajv.validate('series.schema.json', { from: 1960, v: [1, 2], imp: ['', 'interp'] })).toBe(true);
  });
  it('rejects bad imputation flag', () => {
    expect(ajv.validate('series.schema.json', { from: 1960, v: [1], imp: ['guess'] })).toBe(false);
  });
  it('rejects manifest file without license', () => {
    const m = { dataVersion: '2026.10.0', generated: 'x', sources: [], files: [{ path: 'a', sha256: '0'.repeat(64), src: ['a'], retrieved: 'x', url: ['u'], schema: 's' }] };
    expect(ajv.validate('manifest.schema.json', m)).toBe(false);
  });
});
