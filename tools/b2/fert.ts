// Mean number of children per life for a fixed country/cohort over N seeds (fertility calibration probe).
import { loadBundleFromDisk } from '../../src/engine/data/nodeLoader.ts';
import { cohortTfr } from '../../src/engine/life/fertility.ts';
import { runLife } from '../../src/engine/life/sim.ts';
const data = loadBundleFromDisk();
const [iso = 'TWN', year = '1985', n = '400'] = process.argv.slice(2);
const kids: number[] = [], adult: number[] = [];
for (let i = 0; i < Number(n); i++) {
  const s = runLife(data, { seed: `fert-${i}`, era: { kind: 'past', year: Number(year) }, nowYear: 2026, engineVersion: 'x',
    constraints: { country: { kind: 'fixed', value: iso }, sex: { kind: 'random' }, quintile: { kind: 'random' }, urban: { kind: 'random' } } } as never);
  if ('family' in s) { kids.push(s.family.children.length); if (s.age >= 45) adult.push(s.family.children.length); }
}
const mean = kids.reduce((a, b) => a + b, 0) / kids.length;
const dist = [0, 1, 2, 3, 4].map((k) => kids.filter((x) => x === k).length);
const am = adult.reduce((a, b) => a + b, 0) / adult.length;
console.log(JSON.stringify({ iso, year, n: kids.length, mean: +mean.toFixed(2), adults45: adult.length, meanAdults45: +am.toFixed(2), tfr: +(cohortTfr(data.wpp, iso, Number(year)) ?? NaN).toFixed(2), dist0to4: dist }));
