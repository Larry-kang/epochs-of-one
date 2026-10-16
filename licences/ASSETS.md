# Third-party and original assets

| Asset | Path | Source | Licence |
|---|---|---|---|
| Noto Serif TC (subset) | public/fonts/serif-tc.woff2 | github.com/notofonts/noto-cjk (Google Fonts) | SIL OFL 1.1 — tools/fonts/OFL-NotoSerifTC.txt |
| Noto Sans TC (subset) | public/fonts/sans-tc.woff2 | github.com/google/fonts ofl/notosanstc (Google Fonts) | SIL OFL 1.1 — tools/fonts/OFL-NotoSansTC.txt |
| Fraunces (subset) | public/fonts/fraunces.woff2 | github.com/undercasetype/Fraunces | SIL OFL 1.1 — tools/fonts/OFL-fraunces.txt |
| Inter (subset) | public/fonts/inter.woff2 | github.com/rsms/inter | SIL OFL 1.1 — tools/fonts/OFL-inter.txt |
| JetBrains Mono (subset) | public/fonts/mono.woff2 | github.com/JetBrains/JetBrainsMono | SIL OFL 1.1 — tools/fonts/OFL-jetbrainsmono.txt |
| Pixel portrait sprite | src/ui/logic/portrait.ts | original, drawn in code | project licence |
| Share card | src/ui/share.ts | original, canvas-drawn | project licence |
| Final-moments scene | src/ui/ending.ts | original, code-drawn | project licence |
| Background music | src/ui/logic/music.ts, src/ui/music.ts | original, generated at runtime with the Web Audio API (pentatonic melody over a I–vi–IV–V loop); no audio files shipped | project licence |
| Event sound cues | src/ui/logic/milestones.ts, src/ui/sfx.ts | original, generated at runtime with the Web Audio API (short arpeggio / fanfare / falling-minor note patterns); no audio files shipped | project licence |
| Fact-box data | src/data | UN WPP 2024 (CC BY 3.0 IGO), World Bank WDI (CC BY 4.0) | attribution shown in each fact box |

## Data files (public/data)

Every file in `public/data/` has a manifest entry in `public/data/manifest.json` with source id(s), source URL(s), licence id(s), retrieval date and a `transform` line; `pnpm license-gate` (and `tests/unit/l1-license-gate.test.ts`) fails on any file without them, on an unregistered / unknown / non-commercial / restricted source, on a licence id that is not on the allowlist, and on share-alike data outside `public/data/sa/`. Full table and verdicts: `docs/l1-data-licences.md`; attribution text: `NOTICE.md`.

| Data | Path | Source (id) | Licence |
|---|---|---|---|
| Country series | public/data/countries.json | UN WPP 2024 (`wpp2024`), World Bank WDI (`wdi`) | CC BY 3.0 IGO; CC BY 4.0 (each WDI indicator checked: License_Type = CC BY-4.0) |
| Life tables, births | public/data/demography/*.json | UN WPP 2024 (`wpp2024`) | CC BY 3.0 IGO |
| Fertility extras | public/data/wpp-extra.json | UN WPP 2024 (`wpp2024`) | CC BY 3.0 IGO |
| Markets, housing, pensions (M4/M5) | public/data/markets/*.json | OECD (`oecd`), WB Pink Sheet (`wb-pinksheet`), WDI, self-compiled closes | OECD terms (attribution); CC BY 4.0; facts |
| Employment by sex × ISCO major group (L1) | public/data/l1/ilostat-occ.json | ILOSTAT (`ilostat`) | CC BY 4.0 |
| Informal employment rate by sex (L1) | public/data/l1/ilostat-informality.json | ILOSTAT (`ilostat`) | CC BY 4.0 |
| Pension-model indicators (L1) | public/data/l1/pag2025.json | OECD PaG 2025 (`oecd-pag`), third-party measures dropped | CC BY 4.0 + OECD adaptation disclaimer |
| Tertiary gross enrolment (L1) | public/data/sa/uis-tertiary.json | UNESCO UIS (`uis`) | **CC BY-SA 4.0 — this file only** (not the project licence) |

Fonts are subset (not modified otherwise) with `tools/fonts/build.mjs` (fonttools pyftsubset); the subset keeps the OFL Reserved Font Name rules by renaming the family to "EO …" in CSS only. No audio files, map tiles or icon fonts are shipped; music is synthesised in the browser.
