// Calibration: simulate N births for (country, year) and compare e0 / u5 with WPP.
import type { DataBundle } from './life/sim.ts';
import { deathAgeOnly } from './life/sim.ts';
import { NO_CONSTRAINTS } from './demography/birth.ts';

export interface CalRow {
  iso: string; year: number; n: number;
  e0Sim: number; e0Wpp: number; e0Err: number; e0Se: number;
  u5Sim: number; u5Wpp: number; u5Err: number; u5Se: number;
  pass: boolean;
}

export function calibrate(data: DataBundle, iso: string, year: number, n: number, seedPrefix = 'cal'): CalRow {
  const K = { ...NO_CONSTRAINTS, country: { kind: 'fixed' as const, value: iso } };
  let sum = 0, sum2 = 0, u5 = 0;
  for (let i = 0; i < n; i++) {
    const r = deathAgeOnly(data, { seed: `${seedPrefix}-${iso}-${year}-${i}`, era: { kind: 'past', year }, nowYear: 2026, constraints: K, engineVersion: 'cal' });
    if ('infeasible' in r) throw new Error(r.reason);
    sum += r.ageAtDeath; sum2 += r.ageAtDeath * r.ageAtDeath;
    if (r.ageAtDeath < 5) u5++;
  }
  const d = data.demography(iso);
  const k = year - d.from;
  const e0Sim = sum / n, u5Sim = u5 / n;
  const e0Wpp = d.e0.T[k]!, u5Wpp = d.q5.T[k]!;
  const e0Se = Math.sqrt(Math.max(0, sum2 / n - e0Sim * e0Sim) / n);
  const u5Se = Math.sqrt((u5Wpp * (1 - u5Wpp)) / n);
  const e0Err = (e0Sim - e0Wpp) / e0Wpp, u5Err = (u5Sim - u5Wpp) / u5Wpp;
  // acceptance: relative error < 2%; for u5 where 2% is below sampling resolution, allow 3 standard errors
  const pass = Math.abs(e0Err) < 0.02 && Math.abs(u5Sim - u5Wpp) < Math.max(0.02 * u5Wpp, 3 * u5Se);
  return { iso, year, n, e0Sim, e0Wpp, e0Err, e0Se, u5Sim, u5Wpp, u5Err, u5Se, pass };
}
