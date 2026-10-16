// Tiny dependency-free SVG line chart.
export function lineChart(values: number[], opts: { label: string; color: string; w?: number; h?: number }): string {
  const w = opts.w ?? 560, h = opts.h ?? 160, pad = 28;
  if (values.length < 2) return '';
  const min = Math.min(0, ...values), max = Math.max(0, ...values);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (values.length - 1)) * (w - pad - 8);
  const y = (v: number) => 8 + (1 - (v - min) / span) * (h - 8 - pad);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const zero = y(0).toFixed(1);
  return `<figure class="chart"><figcaption>${opts.label}</figcaption>
<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${opts.label}">
<line x1="${pad}" x2="${w - 8}" y1="${zero}" y2="${zero}" class="axis"/>
<polyline fill="none" stroke="${opts.color}" stroke-width="2" points="${pts}"/>
<text x="${pad}" y="${h - 8}" class="tick">0 歲</text><text x="${w - 8}" y="${h - 8}" text-anchor="end" class="tick">${values.length - 1} 歲</text>
</svg></figure>`;
}
