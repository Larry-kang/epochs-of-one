// v0.11.1: person names in the UI language. The engine draws names from zh-TW pools (src/engine/content/names.ts) and
// stores those strings in the save; this maps them to en / ja / ko renderings at display time only
// (src/content/l3-person-names.json, built from tools/l3/person-names.tsv). zh-TW and vi show the stored name.
import { POOLS, type NameRegion } from '../../engine/content/names.ts';
import tab from '../../content/l3-person-names.json' with { type: 'json' };

type L = 'en' | 'ja' | 'ko';
const T = tab as unknown as Record<string, Record<string, [string, string, string]>>;
const COL: Record<L, number> = { en: 0, ja: 1, ko: 2 };
const REGIONS = Object.keys(POOLS) as NameRegion[];

function tok(region: NameRegion, zh: string, l: L): string | undefined { return T[region]?.[zh]?.[COL[l]]; }

/** split a stored full name into family / given using the region's pool (null when it is not a pool name) */
function parse(full: string, region: NameRegion): { family: string; given: string } | null {
  const p = POOLS[region]; const giv = new Set([...p.M, ...p.F]);
  if (p.order === 'given-first') { const [g, f] = full.split(p.sep); return g && f && giv.has(g) ? { family: f, given: g } : null; }
  if (p.sep) { const [f, g] = full.split(p.sep); return f && g && giv.has(g) ? { family: f, given: g } : null; }
  for (const f of [...p.family].sort((a, b) => b.length - a.length)) if (full.startsWith(f) && giv.has(full.slice(f.length))) return { family: f, given: full.slice(f.length) };
  return null;
}
function render(region: NameRegion, f: string, g: string, l: L): string {
  const order = POOLS[region].order;
  if (order === 'given-first') return l === 'ja' ? `${g}・${f}` : `${g} ${f}`;
  if (region === 'zh') return l === 'en' ? `${g} ${f}` : `${f}${g}`;
  if (region === 'ja') return l === 'en' ? `${g} ${f}` : `${f} ${g}`;
  if (region === 'ko') return l === 'ja' ? `${f}・${g}` : l === 'ko' ? `${f}${g}` : `${f} ${g}`;
  return l === 'ja' ? `${f}・${g}` : `${f} ${g}`; // vi
}

/** a stored person name (full name, or a lone given name for children / siblings) in the UI language */
export function personName(stored: string, region: string | undefined, lang: string): string {
  if (lang !== 'en' && lang !== 'ja' && lang !== 'ko') return stored;
  const l = lang as L;
  const order = [region as NameRegion, ...REGIONS.filter((r) => r !== region)].filter((r) => r && POOLS[r]);
  for (const r of order) { const g = tok(r, stored, l); if (g && (POOLS[r].M.includes(stored) || POOLS[r].F.includes(stored))) return g; }
  for (const r of order) {
    const pr = parse(stored, r); if (!pr) continue;
    const f = tok(r, pr.family, l), g = tok(r, pr.given, l);
    if (f && g) return render(r, f, g, l);
  }
  return stored;
}
