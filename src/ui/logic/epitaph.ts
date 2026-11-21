// Item 5 P1 / v0.22.0 (C1): local memorial hall epitaphs — stored only in localStorage, cleaned and capped at 60 code points.
// First draft: OpenRouter nemotron-3-ultra:free (OpenCode deepseek free timed out).
/* eslint-disable no-control-regex -- stripping control characters is the point */
export const EPITAPH_MAX = 60;

export function epitaphKey(prefix: string, id: string): string {
  return `${prefix}.epitaph.${id}`;
}

export function cleanEpitaph(s: string): string {
  let result = s.replace(/[\t\n\r]/g, ' ');
  result = result.replace(/[\u0000-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');
  result = result.replace(/\s+/g, ' ').trim();
  const codePoints = Array.from(result);
  if (codePoints.length > EPITAPH_MAX) {
    return codePoints.slice(0, EPITAPH_MAX).join('');
  }
  return result;
}