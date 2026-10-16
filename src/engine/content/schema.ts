// C1–C3 content scaffolding (batch 1). Large pools (~200 events, ~180 decisions, ~150 dated history items, war/crisis
// periods) land in later batches as JSON under src/content/pool/, validated by validatePool(). Text is written by us;
// facts must cite allowed sources only (UN WPP CC BY 3.0 IGO, World Bank CC BY 4.0, OECD with attribution, own data).
export type Region = 'world' | 'eastAsia' | 'southAsia' | 'seAsia' | 'mena' | 'ssa' | 'europe' | 'latam' | 'northAmerica' | 'oceania' | 'centralAsia';
export interface Window { ageFrom: number; ageTo: number; yearFrom?: number; yearTo?: number }
export interface FactRef { text: string; source: 'wpp' | 'wdi' | 'oecd' | 'own'; code?: string }
export interface EventSpec {
  id: string; kind: 'good' | 'bad' | 'big' | 'note'; window: Window; regions?: Region[]; iso?: string[];
  weight: number; repeatable: boolean; cooldown: number; fact?: FactRef;
}
export interface DecisionSpec extends Omit<EventSpec, 'kind'> { label: 'major' | 'small' | 'family'; options: { id: string; weight: number; effects?: Record<string, number> }[] }
export interface HistoryItem { id: string; from: number; to: number; iso: string[] | '*'; kind: 'milestone' | 'war' | 'crisis' | 'econ'; mortality?: number; displacement?: number; fact?: FactRef }
export interface Pool { events: EventSpec[]; decisions: DecisionSpec[]; history: HistoryItem[] }

const ALLOWED = new Set(['wpp', 'wdi', 'oecd', 'own']);
export function validatePool(p: Pool, text: Record<string, string>): string[] {
  const errs: string[] = []; const ids = new Set<string>();
  const chk = (id: string, f?: FactRef) => {
    if (ids.has(id)) errs.push(`duplicate id ${id}`); ids.add(id);
    if (!text[id]) errs.push(`missing text ${id}`);
    if (f && !ALLOWED.has(f.source)) errs.push(`fact source not allowed: ${id}`);
  };
  for (const e of p.events) { chk(e.id, e.fact); if (e.window.ageFrom > e.window.ageTo) errs.push(`bad window ${e.id}`); if (e.weight <= 0) errs.push(`weight ${e.id}`); }
  for (const d of p.decisions) { chk(d.id, d.fact); if (d.options.length < 2 || d.options.length > 5) errs.push(`options ${d.id}`); }
  for (const h of p.history) { chk(h.id, h.fact); if (h.from > h.to) errs.push(`range ${h.id}`); }
  return errs;
}
