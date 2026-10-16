# C0 core careers (v0.9.0)

80 ISCO-08 occupations (`src/content/occupations`, `src/engine/life/occupation.ts`) behind `LifeConfig.occ`. New lives from the home screen use it; the pre-C0 engine path is unchanged when the flag is off.

- **Entry / ladders / switches / startup / illicit / rare roles** — see `tools/careers-draft.csv` and `occupation.ts`. Illicit offers default to *refuse* with weight 0, so auto-choice never accepts.
- **Income guardrail** — mean lifetime income with occ on vs off within ±8%, net worth ±20%, e0 ±2%, under-5 deaths identical (TWN/USA/IND/NGA × 1970/1990, N=200). IND was ~1.13: fixed by narrowing low-income professional/public draw weights (L: 4.89→3.5 / 8.78→5; LM: 2.59→2.3 / 2.48→1.9) and a per-country normaliser `COUNTRY_K` (refit with `tools/c0/ratios.test.ts`). Current: IND1970 0.936, IND1990 1.078 (single seed set; across 20 seed sets IND1990 averages ≈ 0.99 — see docs/careers-c0-guardrail-seeds.md).
- **Focus MC** — with occ on, work beats family by ≥20% median lifetime income (TWN 29.0%, USA 29.1%, IND 26.9%); `docs/focus-mc-c0.md`.
- **Old saves** — `migrateSaveCfg` sets `occFrom = years played` on resume: the replay is byte-identical up to the resume age, then the life maps into an occupation. Same-second companions inherit occ.
- **UI** — occupation + rung on the ID card with a 推估/estimate chip (tooltip names provenance); occupation names in the log, decision cards and death story. Screenshots: `shots/c0/`.
