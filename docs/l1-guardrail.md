# L1 guardrails, focus MC and equity check (v0.10.0-rc)

## Pooled guardrail (tests/unit/c0-guardrail-*.test.ts; 8 seed sets × N=200; raw: docs/l1-guardrail.jsonl)

| Cell | Income ratio (mean of 8) | Net worth | e0 | Largest pooled mix gap | Per-set income range |
|---|---|---|---|---|---|
| IND 1970 | 0.998 | 1.033 | 0.9973 | agri −2.0 | 0.928–1.104 |
| NGA 1970 | 1.003 | 0.977 | 1.0002 | agri +4.1 | 0.869–1.110 |
| TWN 1970 | 0.990 | 0.954 | 1.0004 | services +2.3 | 0.913–1.034 |
| USA 1970 | 0.987 | 1.033 | 1.0013 | professional −1.9 | 0.919–1.081 |
| IND 1990 | 1.013 | 1.035 | 1.0002 | professional +3.1 | 0.958–1.081 |
| NGA 1990 | 1.000 | 0.966 | 0.9992 | services +3.4 | 0.886–1.110 |
| TWN 1990 | 1.017 | 1.007 | 1.0013 | services +3.3 | 0.922–1.086 |
| USA 1990 | 0.993 | 1.033 | 1.0001 | professional −1.4 | 0.941–1.107 |

Bands: income ±8%, net worth ±20%, e0 ±1%, mix ±5 pts pooled. 8/8 pass. Under-5 deaths identical in every set.

Countries outside CI, 8 sets × 200 (tools/c0/multiseed.test.ts), born 1990: BRA 0.995, KOR 1.049, CHN 0.942, ETH 0.989,
MEX 1.013, IDN 1.021, DEU 1.017; born 1970: CHN 1.046, KOR 0.923. CHN and KOR split by cohort as before (mean 0.994 /
0.986), so COUNTRY_K was not refit for them; KOR 1970 is the closest to the edge.

## Focus MC with occupations (born 1990, **N=400 per cell** from rc2, seeds fmc-0..399; docs/focus-mc-l1.md)

| Country | Work vs family, median lifetime income | Mean |
|---|---|---|
| TWN | +31.6% | +30.4% |
| USA | +28.6% | +30.4% |
| IND | +29.9% | +34.8% |
| NGA | +24.9% | +31.4% |

All ≥ +20% (median). rc1 used N=200, where NGA's median was +19.4%. N=400 is now the default in scripts/focus-mc.test.ts.
rc2 runs the MC after the equity-model change (see docs/l1-data-licences.md ); the guardrail cells above are unchanged by it
(identical numbers on rerun: guardrail lives do not invest).

## Equity check (tools/l1/equity.test.ts; born 1990, 4 sets × 200 = 800 lives per country; docs/l1-equity.json)

on = occupations with ILOSTAT sex weights; neutral = occupations with no sex weight; off = pre-occupation engine; same seeds.

| Country | All on/off | M on/off | F on/off | M neutral/off | F neutral/off | F/M off | F/M neutral | F/M on |
|---|---|---|---|---|---|---|---|---|
| TWN | 1.020 | 1.024 | 1.016 | 1.005 | 1.025 | 1.065 | 1.086 | 1.057 |
| USA | 0.987 | 0.975 | 0.999 | 0.977 | 0.995 | 1.113 | 1.134 | 1.140 |
| CHN | 0.950 | 0.945 | 0.955 | 0.939 | 0.973 | 0.966 | 1.000 | 0.976 |
| IND | 1.022 | 1.057 | 0.987 | 1.045 | 1.034 | 1.030 | 1.019 | 0.962 |
| JPN | 0.994 | 0.992 | 0.996 | 1.006 | 1.033 | 1.088 | 1.117 | 1.093 |
| KOR | 1.046 | 1.076 | 1.015 | 1.027 | 1.021 | 1.141 | 1.135 | 1.076 |
| DEU | 0.981 | 0.957 | 1.005 | 0.986 | 0.988 | 0.982 | 0.984 | 1.031 |
| GBR | 0.988 | 0.939 | 1.035 | 0.953 | 1.009 | 1.054 | 1.117 | 1.163 |
| FRA | 0.975 | 0.954 | 0.997 | 0.968 | 1.023 | 1.033 | 1.092 | 1.079 |
| BRA | 0.992 | 1.004 | 0.978 | 1.022 | 0.983 | 0.908 | 0.873 | 0.885 |
| IDN | 1.037 | 1.027 | 1.047 | 1.044 | 1.022 | 1.076 | 1.053 | 1.096 |
| NGA | 1.050 | 1.042 | 1.057 | 1.030 | 1.037 | 1.167 | 1.175 | 1.185 |
| MEX | 0.988 | 0.971 | 1.004 | 0.970 | 0.995 | 1.033 | 1.059 | 1.068 |
| ETH | 0.997 | 1.069 | 0.928 | 1.043 | 0.953 | 1.159 | 1.058 | 1.005 |

Findings:
- Every country × sex stays inside ±8% of the pre-occupation engine (range 0.928 ETH women to 1.076 KOR men). No country is
  systematically below: all-sex ratios are 0.950–1.050.
- ILOSTAT weights move F/M by −5.9 (KOR) to +4.6 (GBR) pts versus neutral, in both directions; mean over 14 countries
  ≈ −0.6 pts. By construction that is the observed occupational sex mix, which the policy allows (weight, not gate).
- Tracked as L7-1 in docs/l7-tracking.md. ETH women: F/M drops 10 pts with neutral weights (1.159 → 1.058) and ILOSTAT adds −5 more (→ 1.005), so most
  of the drop is NOT from the data weights. It comes from the occupation system itself in a low-income, agri-heavy country.
  Inside the band, but the largest sex asymmetry. At N=800 this may be partly noise (per-set spread is about ±10%).
- The legacy engine's F/M lifetime income is > 1 in most countries (women live longer, so they collect more pension
  years). This predates L1 and is not an occupation effect.
- Protected attributes: ethnicity, caste, religion and region never enter any weight (only sex, via ILOSTAT).
