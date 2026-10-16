// P16 cited fact boxes. Every fact is computed from data already shipped under the project's licence policy:
// UN WPP 2024 (CC BY 3.0 IGO) and World Bank WDI (CC BY 4.0). Wording is ours; the citation names the source.
import type { CountryRec, Demography } from '../../engine/data/types.ts';
import { seriesAt } from '../../engine/data/types.ts';

export interface Fact { text: string; cite: string; est: boolean }
const WDI = (code: string) => `世界銀行 WDI ${code}（CC BY 4.0）`;
const WPP = '聯合國《世界人口展望 2024》（CC BY 3.0 IGO）';
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function factFor(id: string, c: CountryRec, name: string, year: number, demo?: Demography): Fact | null {
  const s = (k: keyof CountryRec['series']) => seriesAt(c.series[k], year);
  const yi = demo ? Math.min(Math.max(year - demo.from, 0), demo.e0.T.length - 1) : 0;
  switch (id) {
    case 'vaccine': case 'child': {
      if (!demo) return null;
      const q5 = demo.q5.T[yi]!;
      return { text: `${year} 年前後，${name}每 1,000 名新生兒約有 ${Math.round(q5 * 1000)} 名活不到 5 歲。`, cite: WPP, est: year > demo.to };
    }
    case 'school': case 'hs': {
      const r = s('secEnr');
      return { text: `${name}的中學毛入學率約 ${pct(Math.min(r.v, 1.5))}（毛入學率可能超過 100%，因為包含重讀與超齡學生）。`, cite: WDI('SE.SEC.ENRR'), est: r.est };
    }
    case 'uni': case 'grad': {
      const r = s('terEnr');
      return { text: `${name}的高等教育毛入學率約 ${pct(r.v)}。`, cite: WDI('SE.TER.ENRR'), est: r.est };
    }
    case 'career': {
      const r = s('unemp');
      return { text: `${name}當年的失業率約 ${(r.v * 100).toFixed(1)}%。`, cite: WDI('SL.UEM.TOTL.ZS'), est: r.est };
    }
    case 'move': {
      const r = s('urban');
      return { text: `${name}約有 ${pct(r.v)} 的人住在都市地區。`, cite: WDI('SP.URB.TOTL.IN.ZS'), est: r.est };
    }
    case 'marry': case 'parents': case 'treat': {
      if (!demo) return null;
      return { text: `${year} 年前後，${name}的出生時平均餘命約 ${demo.e0.T[yi]!.toFixed(1)} 歲。`, cite: WPP, est: year > demo.to };
    }
    default: return null;
  }
}
