// CLI: pnpm sim --seed X --n N [--country ISO] [--year Y]
import { createHash } from 'node:crypto';
import { loadBundleFromDisk } from '../engine/data/nodeLoader.ts';
import { runLife } from '../engine/life/sim.ts';
import { NO_CONSTRAINTS } from '../engine/demography/birth.ts';
import { NOW_YEAR, ENGINE_VERSION } from '../config.ts';
import { contentEvents } from '../engine/content/registry.ts';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i]!.replace(/^--/, ''), process.argv[i + 1] ?? '');
const seed = args.get('seed') ?? 'demo';
const n = Number(args.get('n') ?? '1');
const country = args.get('country');
const yearArg = args.get('year');
const data = loadBundleFromDisk();
const K = country ? { ...NO_CONSTRAINTS, country: { kind: 'fixed' as const, value: country } } : undefined;
const era = yearArg ? { kind: 'past' as const, year: Number(yearArg) } : { kind: 'now' as const };
const h = createHash('sha256');
let sumAge = 0, u5 = 0;
const t0 = Date.now();
for (let i = 0; i < n; i++) {
  const s = runLife(data, { seed: n === 1 ? seed : `${seed}-${i}`, era, nowYear: NOW_YEAR, constraints: K, engineVersion: ENGINE_VERSION }, contentEvents);
  if ('infeasible' in s) { console.error('infeasible:', s); process.exit(1); }
  const d = s.death!;
  sumAge += d.age + d.frac; if (d.age + d.frac < 5) u5++;
  h.update(`${s.born.iso}|${s.born.year}|${s.born.sex}|${d.age}|${d.frac}|${s.econ.cash}|${s.events.map((e) => e.id).join(',')}\n`);
  if (n === 1) {
    console.log(JSON.stringify({ born: s.born, death: s.death, finalCash: Math.round(s.econ.cash), events: s.events, years: s.years.length }, null, 1));
  }
}
console.log(JSON.stringify({ seed, n, meanAgeAtDeath: +(sumAge / n).toFixed(3), u5: +(u5 / n).toFixed(5), digest: h.digest('hex').slice(0, 16), ms: Date.now() - t0 }));
