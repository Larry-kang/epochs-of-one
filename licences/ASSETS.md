# Third-party and original assets

| Asset | Path | Source | Licence |
|---|---|---|---|
| Noto Serif TC (subset) | public/fonts/serif-tc.woff2 | github.com/notofonts/noto-cjk (Google Fonts) | SIL OFL 1.1 — tools/fonts/OFL-NotoSerifTC.txt |
| Fraunces (subset) | public/fonts/fraunces.woff2 | github.com/undercasetype/Fraunces | SIL OFL 1.1 — tools/fonts/OFL-fraunces.txt |
| Inter (subset) | public/fonts/inter.woff2 | github.com/rsms/inter | SIL OFL 1.1 — tools/fonts/OFL-inter.txt |
| JetBrains Mono (subset) | public/fonts/mono.woff2 | github.com/JetBrains/JetBrainsMono | SIL OFL 1.1 — tools/fonts/OFL-jetbrainsmono.txt |
| Pixel portrait sprite | src/ui/logic/portrait.ts | original, drawn in code | project licence |
| Share card | src/ui/share.ts | original, canvas-drawn | project licence |
| Final-moments scene | src/ui/ending.ts | original, code-drawn | project licence |
| Fact-box data | src/data | UN WPP 2024 (CC BY 3.0 IGO), World Bank WDI (CC BY 4.0) | attribution shown in each fact box |

Fonts are subset (not modified otherwise) with `tools/fonts/build.mjs` (fonttools pyftsubset); the subset keeps the OFL Reserved Font Name rules by renaming the family to "EO …" in CSS only. No music, map tiles or icon fonts are shipped.
