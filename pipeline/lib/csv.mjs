import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';

/** RFC-4180-ish single-line parser (WPP files have no embedded newlines). */
export function parseLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Async iterate rows of a gzipped CSV as objects. */
export async function* readGzCsv(path) {
  const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()), crlfDelay: Infinity });
  let header = null;
  for await (const line of rl) {
    if (!line) continue;
    const cells = parseLine(line.replace(/^\uFEFF/, ''));
    if (!header) { header = cells; continue; }
    const o = {};
    for (let i = 0; i < header.length; i++) o[header[i]] = cells[i];
    yield o;
  }
}

/** Parse a whole CSV text (no embedded newlines) into row objects keyed by the header. */
export function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const header = parseLine(lines[0]);
  return lines.slice(1).map((l) => { const c = parseLine(l); return Object.fromEntries(header.map((h, i) => [h, c[i] ?? ''])); });
}
