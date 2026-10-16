# C0 income guardrail across seed sets (1990 cohort)

Question: India 1990 sat at 1.078 (occ-on / occ-off mean lifetime income) on the single seed set used by the guardrail
test — close to the +8% edge. Is that a bias or seed noise?

Method: `tools/c0/multiseed.test.ts`. For each country, 20 independent seed sets × N=200 lives, each life run with
occupations on and off (same seed), ratio = Σ income(on) / Σ income(off) per set. Set 0 is the guardrail test's set
(`c0-<ISO>-<i>`), sets 1–19 use `c0s<j>-<ISO>-<i>`. Born 1990, no focus, constraints random except country.

| Country | Mean ratio | SD (per set) | Min | Max | 95% range of a single N=200 set (mean ± 1.96 SD) | 95% CI of the mean (± 1.96 SD/√20) | Set 0 (guardrail test) |
|---|---|---|---|---|---|---|---|
| IND | 0.990 | 0.051 | 0.882 | 1.078 | 0.889 – 1.090 | 0.967 – 1.012 | 1.078 |
| TWN | 1.016 | 0.040 | 0.944 | 1.094 | 0.937 – 1.096 | 0.999 – 1.034 | 1.026 |
| USA | 0.967 | 0.041 | 0.889 | 1.071 | 0.886 – 1.047 | 0.948 – 0.985 | 1.015 |
| NGA | 0.888 | 0.069 | 0.808 | 1.043 | 0.752 – 1.024 | 0.857 – 0.918 | 0.996 |

Findings
- **India**: 1.078 is the largest of the 20 sets; the mean is ≈ 0.99 and its 95% CI lies well inside ±8%. The edge value
  was seed noise (a single N=200 set has an SD of ≈ 5%, so its own 95% range is about ±10%), not a bias. The 95% range of a single set
  crosses 1.08, but the CI of the mean does not; shifting the India normaliser up would move the mean away from 1, so
  **no tuning** (COUNTRY_K.IND stays 1.026, band stays ±8%).
- Taiwan and USA: means within ±4%.
- **Nigeria**: mean ≈ 0.89 — below the −8% edge on average; set 0 (0.996) happens to sit high. COUNTRY_K.NGA (1.179) was
  fitted on set 0. Not changed in this pass (only India was in scope); a refit should use a multi-seed mean, and the
  guardrail test should then move from one seed set to a pooled multi-seed check so that it is not seed-sensitive.

Reproduce: `C0ISO=IND C0SETS=20 C0N=200 npx vitest run -c tools/c0/vitest.config.ts tools/c0/multiseed.test.ts`.
