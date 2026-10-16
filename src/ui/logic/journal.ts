// batch 3 #4: personal journal — free-text notes per age, stored in localStorage under the life id (never uploaded).
export type Journal = Record<string, string>;   // age → note
export const journalKey = (prefix: string, lifeId: string) => `${prefix}.journal.${lifeId}`;
export function parseJournal(raw: string | null): Journal {
  try { const o = JSON.parse(raw ?? '{}') as unknown; if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
    return Object.fromEntries(Object.entries(o as Record<string, unknown>).filter(([k, v]) => /^\d+$/.test(k) && typeof v === 'string').map(([k, v]) => [k, (v as string).slice(0, 2000)])); } catch { return {}; }
}
export function setEntry(j: Journal, age: number, text: string): Journal {
  const out = { ...j }; const v = text.trim().slice(0, 2000);
  if (v) out[String(age)] = v; else delete out[String(age)];
  return out;
}
export const entries = (j: Journal) => Object.entries(j).map(([a, v]) => ({ age: Number(a), text: v })).sort((a, b) => a.age - b.age);
