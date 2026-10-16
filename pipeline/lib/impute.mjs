// Imputation rules (fixed order), applied per series:
//  1. linear interpolation for interior gaps ≤ 3 years  → 'interp'
//  2. edge extension from nearest observed value (before first / after last obs) → 'nearest'   [decision Q6]
//  3. country with no observations: sub-region median of that year → 'region'
//  4. else world median of that year → 'world'
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function fillOne(arr) {
  const v = arr.slice();
  const imp = arr.map((x) => (x == null ? null : ''));
  const obs = v.map((x, i) => (x == null ? -1 : i)).filter((i) => i >= 0);
  if (!obs.length) return null;
  for (let k = 0; k + 1 < obs.length; k++) {
    const a = obs[k], b = obs[k + 1];
    if (b - a > 1 && b - a - 1 <= 3) {
      for (let i = a + 1; i < b; i++) { v[i] = v[a] + ((v[b] - v[a]) * (i - a)) / (b - a); imp[i] = 'interp'; }
    }
  }
  // longer interior gaps and edges: nearest observed value
  for (let i = 0; i < v.length; i++) {
    if (v[i] != null) continue;
    let best = null, bd = Infinity;
    for (const j of obs) { const d = Math.abs(j - i); if (d < bd || (d === bd && j < i)) { bd = d; best = j; } }
    v[i] = v[best]; imp[i] = 'nearest';
  }
  return { v, imp };
}

/** @param raw Map<iso, (number|null)[]>  @param subOf Map<iso, subregionId> */
export function imputeSeries(raw, subOf) {
  const out = new Map();
  for (const [iso, arr] of raw) { const f = fillOne(arr); if (f) out.set(iso, f); }
  const len = [...raw.values()][0].length;
  for (const [iso, arr] of raw) {
    if (out.has(iso)) continue;
    const peers = [...out.keys()].filter((p) => subOf.get(p) === subOf.get(iso) && raw.get(p).some((x) => x != null));
    const v = [], imp = [];
    for (let i = 0; i < len; i++) {
      // medians use source-or-interp values only (not other imputations) where available
      const pv = peers.map((p) => out.get(p).v[i]);
      if (peers.length >= 3) { v.push(median(pv)); imp.push('region'); }
      else { v.push(median([...out.values()].map((o) => o.v[i]))); imp.push('world'); }
    }
    void arr;
    out.set(iso, { v, imp });
  }
  return out;
}
