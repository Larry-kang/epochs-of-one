# L1: data pipeline, licence gate, mix guardrail (v0.10.0)

Batch L1 of `localization-plan.md` ILOSTAT ISCO×sex + informality, WB (licence audit), UIS in a separate CC BY-SA file,
PaG 2025 with third-party filtering, licence gate, provenance chips. Plus the CEO decision on the occupation-mix guardrail.
All dates Asia/Taipei. Pipeline: `node pipeline/l1.mjs` (runs after `pipeline/run.mjs`; `pnpm data` runs both).

## 1. Datasets and licences

| Dataset (id) | Shipped file | What | Licence | Verified | Transform |
|---|---|---|---|---|---|
| ILOSTAT EMP_TEMP by sex × occupation (`ilostat`) | `public/data/l1/ilostat-occ.json` (203 countries) | share of employment per sex × ISCO-08 major group (ISCO-88 where -08 missing), one obs per decade (±5 y) | CC BY 4.0 (releases on/after 2023-05-03; pulled from the current release 2026-10-17) | ilo.org/rights-and-permissions, archived 2026-10-17 | thousands → share of total; decade sampling |
| ILOSTAT EMP_NIFL informal employment rate by sex (`ilostat`) | `public/data/l1/ilostat-informality.json` (147) | informality T/M/F | CC BY 4.0 | as above | % → proportion; decade + latest |
| OECD Pensions at a Glance 2025, DF_PAG (`oecd-pag`) | `public/data/l1/pag2025.json` (51) | CRPLF22, FRPLF22, GPRR100, NPRR100 by sex (mandatory schemes) | CC BY 4.0 + OECD adaptation disclaimer | oecd terms (archived 2026-10-16) | latest year per measure; **28 third-party-derived measures dropped** (exit ages from national LFS, LE/FR/OAWAR from UN WPP, old-age incomes/poverty from national surveys, average wage, employment rate, spending, tax rates, non-average-earner variants) |
| UNESCO UIS GER.5T8 (`uis`) | `public/data/sa/uis-tertiary.json` (206) | tertiary gross enrolment | **CC BY-SA 4.0, this file only** (licence + attribution inside the file) | databrowser.uis.unesco.org/terms-and-conditions, archived 2026-10-17 | % → proportion; decade sampling |
| World Bank WDI (`wdi`, existing) | `countries.json`, markets | 20 indicators | CC BY 4.0 — **each indicator checked**: WB metadata `License_Type` = "CC BY-4.0" for all 20 (`pipeline/l1/wdi-licences.json`) | api.worldbank.org/v2/sources/2/series/<code>/metadata, 2026-10-17 | unchanged |
| UN WPP 2024, OECD M4/M5, Pink Sheet, self-compiled closes (existing) | as before | — | unchanged | — | transform line added to every manifest entry |

Not used / blocked (registered in `pipeline/sources.json` with a blocking class, so any use fails the gate): WHO GHO
(restricted), ISSA (restricted), China NBS and Nigeria NBS (unknown → values 推估), KOGL Types 2–4 (nc; KOGL Type 1 is
registered and allowed), OECD third-party series (restricted). CN and NG enter only through ILOSTAT/WB/UIS/PaG.

## 2. Licence gate (`pipeline/license-gate.mjs`, `pnpm license-gate`, `prebuild`)

Fails the build when any `public/data` file:
- lacks a source, an https source URL, a licence, a retrieval date or a `transform` line;
- cites an unregistered source or one with class `unknown` / `nc` / `restricted`;
- cites a licence id that is not on the allowlist (plan CC BY 4.0, CC BY 3.0 IGO, CC BY-SA 4.0, OGDL-TW, JP PDL v1,
  dl-de/by-2.0, OGL v3, Licence Ouverte 2.0, KOGL-1, US PD, law facts, self-compiled facts, OECD terms);
- carries share-alike data outside `public/data/sa/`, mixes it with another source, or puts non-SA data in `sa/`;
- or is present in `public/data` without a manifest entry.
It also fails if any World Bank indicator in `pipeline/l1/wdi-licences.json` is not CC BY 4.0.
Tests: `tests/unit/l1-license-gate.test.ts` (15 cases incl. the real manifest; GODL-India is NOT on the allowlist yet —
plan says "after review").

## 3. Engine change: ILOSTAT sex weights + provenance chip

`occWeight` now uses P(ISCO major | sex) / P(ISCO major) for the country at the nearest decade with ILOSTAT data (clamped
0.25–4; merged/omitted groups → 1). It is a weight inside the chosen job group, never a gate; countries without data keep the
推估 ±1.5 rule. The ID card shows an "ILOSTAT" chip (tooltip: year, CC BY 4.0, "probability weight only") or 推估.

## 4. Occupation-mix guardrail: pooled (CEO decision)

`tests/unit/c0-guardrail.ts`: the ±5-pt check per job group now uses the pool of the same 8 seed sets × N=200 as the income
guardrail (was: set 0 only). Same band. Draw weights changed (`GROUP_ADJ`): H services 0.972→0.84, LM services 0.941→0.91,
L agri 1.079→1.0. COUNTRY_K: NGA 1.0452→1.1045 (others unchanged).

| Cell | Largest pooled gap before (v0.9.0) | After (v0.10.0) |
|---|---|---|
| IND 1970 | public +1.0 | agri −2.0 |
| NGA 1970 | public −3.8 | agri +4.1 / public −3.8 |
| TWN 1970 | services +3.7 | services +2.3 |
| USA 1970 | services +3.5 | professional −1.9 |
| IND 1990 | professional +3.3 | professional +3.1 |
| NGA 1990 | services +3.6 | services +3.4 |
| **TWN 1990** | **services +6.1 (fails pooled)** | **services +3.3** |
| USA 1990 | services +3.6 | professional −1.4 |

Note: NGA 1990 set 0 alone now has trades −5.3 (the old set-0 test would have failed); pooled −1.1.

Guardrail numbers (mean of 8 per-set ratios) and focus MC: see `docs/l1-guardrail.md`.

## 5. Equity check (born 1990, 4 seed sets × 200, same seeds on/off)

`tools/l1/equity.test.ts` → `docs/l1-equity.json`. Per country and sex: lifetime income occupations-on / pre-occupation
engine, with ILOSTAT weights ("on") and with no sex weight ("neutral"). Results in `docs/l1-guardrail.md`.

## 6. rc2: OECD share prices removed (CEO decision 3)

The OECD share-price indices (DF_FINMARK) carry third-party index-provider rights, so they break the "no OECD third-party
series" rule. No openly licensed replacement exists (WDI CM.MKT.INDX.ZG is S&P data and is forbidden by the brief).
Fallback: **US and world equity = 推估 model** (`kind: model_ngdp`, `est: true`). The price level tracks nominal GDP in USD
(WDI NY.GDP.MKTP.CD, CC BY 4.0), 1960–2025. There is no intra-year path, so the Brownian bridge uses design σ (US 0.16,
world 0.15). Other countries proxy the world index, as before for countries without data. TWN keeps TAIEX closes; gold
keeps Pink Sheet.
- Every modelled return is flagged 推估 in the engine. The investment screen shows a 推估 badge with a tooltip explaining
  the model, and About says the same.
- Registered blocked sources: `oecd-share-prices`, `wb-sp-equity`. `markets.json` no longer cites `oecd`. Tests in
  `l1-license-gate.test.ts` fail if the old series or source comes back.
- Consequence: historical crash years (1974, 1987, 2008) no longer appear in US/world equity. The M4 leverage acceptance
  tests now run on a synthetic stress-path fixture.
