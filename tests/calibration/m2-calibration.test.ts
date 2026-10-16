import { describe, it, expect } from 'vitest';
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { calibrate } from '../../src/engine/calibrate.ts';

// M2 acceptance: N = 100k, e0/u5 within 2% of WPP. Full 10-target table: `pnpm calibrate` → docs/calibration-report.md.
describe('M2: calibration N=100k (subset in test suite)', () => {
  const data = loadBundleFromDisk();
  for (const [iso, y] of [['NGA', 2000], ['TWN', 1960]] as const) {
    it(`${iso} ${y}: e0 within 2%; u5 within 2% or 3·SE (sampling floor)`, () => {
      const r = calibrate(data, iso, y, 100000, 'vitest');
      expect(Math.abs(r.e0Err)).toBeLessThan(0.02);
      expect(Math.abs(r.u5Sim - r.u5Wpp)).toBeLessThan(Math.max(0.02 * r.u5Wpp, 3 * r.u5Se));
      expect(r.pass).toBe(true);
    }, 180000);
  }
});
