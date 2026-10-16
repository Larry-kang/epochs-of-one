// E4 shareable image card, drawn client-side on a canvas (1080×1350). No network, no third-party code.
export interface ShareCard { app: string; title: string; name: string; span: string; country: string; cause: string; facts: string[]; map: number[]; e0: number; text: string }
const C = { paper: '#F6F1E7', card: '#FFFDF8', ink: '#1F2433', ink2: '#4A5063', rule: '#E3DACB', accent: '#C2671D', stamp: '#2F5D8A', gold: '#B8902E' };
const SERIF = '"EO Serif TC", "EO Fraunces", serif', SANS = '"EO Inter", "Noto Sans TC", sans-serif', MONO = '"EO Mono", monospace';

export function drawShareCard(cv: HTMLCanvasElement, d: ShareCard): void {
  const W = 1080, H = 1350; cv.width = W; cv.height = H;
  const g = cv.getContext('2d'); if (!g) return;
  g.fillStyle = C.paper; g.fillRect(0, 0, W, H);
  // ledger rules
  g.strokeStyle = C.rule; g.lineWidth = 2;
  for (let y = 140; y < H - 60; y += 48) { g.beginPath(); g.moveTo(60, y); g.lineTo(W - 60, y); g.stroke(); }
  g.fillStyle = C.card; g.fillRect(60, 60, W - 120, H - 120);
  g.strokeStyle = C.ink; g.lineWidth = 3; g.strokeRect(60, 60, W - 120, H - 120);
  // header band
  g.fillStyle = C.stamp; g.fillRect(60, 60, W - 120, 110);
  g.fillStyle = '#FFFDF8'; g.font = `600 40px ${SERIF}`; g.fillText(d.title, 100, 130);
  g.font = `500 26px ${MONO}`; g.textAlign = 'right'; g.fillText(d.app, W - 100, 128); g.textAlign = 'left';
  g.fillStyle = C.ink; g.font = `700 104px ${SERIF}`; g.fillText(d.name, 100, 320, W - 200);
  g.fillStyle = C.ink2; g.font = `400 40px ${SANS}`; g.fillText(`${d.country} · ${d.span}`, 100, 390, W - 200);
  g.fillStyle = C.accent; g.font = `700 52px ${SERIF}`; g.fillText(d.cause, 100, 480, W - 200);
  g.fillStyle = C.ink; g.font = `500 38px ${SANS}`;
  d.facts.slice(0, 3).forEach((f, i) => { g.fillStyle = C.gold; g.fillRect(100, 556 + i * 70, 14, 14); g.fillStyle = C.ink; g.fillText(f, 136, 572 + i * 70, W - 240); });
  // mini life map (10 columns)
  const cell = 52, gap = 10, x0 = 100, y0 = 800;
  const n = Math.max(d.map.length, Math.ceil(d.e0));
  for (let i = 0; i < Math.min(n, 100); i++) {
    const x = x0 + (i % 10) * (cell + gap) + 120, y = y0 + Math.floor(i / 10) * (cell + gap) * 0.62;
    const h = cell * 0.55;
    if (i < d.map.length) { g.globalAlpha = 0.25 + 0.75 * (d.map[i]! / 100); g.fillStyle = C.stamp; g.fillRect(x, y, cell, h); g.globalAlpha = 1; }
    else { g.strokeStyle = C.rule; g.lineWidth = 2; g.strokeRect(x, y, cell, h); }
    if (i === Math.round(d.e0)) { g.strokeStyle = C.accent; g.lineWidth = 4; g.strokeRect(x - 2, y - 2, cell + 4, h + 4); }
  }
  g.fillStyle = C.ink2; g.font = `400 26px ${MONO}`; g.fillText('1 □ = 1 yr', 100, H - 100);
}
