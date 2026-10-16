# C0 income guardrail across seed sets (1970 and 1990 cohorts)

Guardrail: with occupations on, mean lifetime income stays within ±8% of the pre-occupation engine (net worth ±20%,
e0 ±1%, under-5 deaths identical). The band is unchanged; only how it is measured and how the per-country normaliser
`COUNTRY_K` is fitted changed.

Method: `tools/c0/multiseed.test.ts`. For each country and cohort, 20 independent seed sets × N=200 lives; every life runs
with occupations on and off (same seed). Per set, ratio = Σ income(on) / Σ income(off) (likewise net worth and e0). Set 0 is
`c0-<ISO>-<i>`, sets 1–19 are `c0s<j>-<ISO>-<i>`. No focus; constraints random except country.

Why: in rc3 India 1990 sat at 1.078 on the single seed set the old test used. Across 20 sets that was noise (mean 0.990), but the
study showed Nigeria averaging ≈ 0.89 — outside the band — because its normaliser had been fitted on that one set.

## Normalisers (`COUNTRY_K`, src/engine/life/occupation.ts)

Refit: K_new = K_old × mean(mean ratio 1970, mean ratio 1990) — the occupation wage is divided by K, so the ratio scales as 1/K.
One refit was enough: re-running the fit on the new values moves every K by ≤ 0.0014.

| Country | Before (fitted on one seed set) | After (multi-seed mean, 1970 + 1990) |
|---|---|---|
| TWN | 0.9872 | 0.9875 |
| USA | 1.0105 | 0.9808 |
| IND | 1.026 | 0.9997 |
| NGA | 1.179 | 1.0452 |
| BRA | 1.0035 | 1.0887 |
| DEU | 0.9663 | 0.9847 |
| KOR | 0.9483 | 0.9449 |
| CHN | 1.0229 | 1.0053 |
| ETH | 0.9657 | 0.9363 |
| MEX | 1.0557 | 1.11 |
| IDN | 1.0385 | 1.079 |

## Before (rc3 normalisers)

### 1970 cohort
| Country | Mean income ratio | SD per set | Min | Max | 95% CI of the mean | Net worth ratio (mean) | e0 ratio (mean) |
|---|---|---|---|---|---|---|---|
| TWN | 0.984 | 0.039 | 0.941 | 1.077 | 0.967 – 1.001 | 0.966 | 0.9996 |
| USA | 0.975 | 0.038 | 0.873 | 1.042 | 0.958 – 0.991 | 0.985 | 1.0006 |
| IND | 0.959 | 0.046 | 0.913 | 1.076 | 0.939 – 0.979 | 0.918 | 0.9966 |
| NGA | 0.885 ✗ | 0.064 | 0.783 | 1.027 | 0.857 – 0.913 | 0.800 | 0.9969 |
| BRA | 1.069 | 0.057 | 0.997 | 1.217 | 1.044 – 1.094 | 1.095 | 1.0003 |
| DEU | 1.016 | 0.048 | 0.919 | 1.112 | 0.995 – 1.036 | 1.014 | 1.0003 |
| KOR | 0.948 | 0.054 | 0.857 | 1.061 | 0.924 – 0.972 | 0.908 | 0.9989 |
| CHN | 1.038 | 0.050 | 0.957 | 1.148 | 1.017 – 1.060 | 1.041 | 0.9959 |
| ETH | 0.983 | 0.056 | 0.874 | 1.134 | 0.958 – 1.007 | 0.949 | 0.9979 |
| MEX | 1.045 | 0.040 | 0.969 | 1.110 | 1.027 – 1.062 | 1.078 | 1.0006 |
| IDN | 1.025 | 0.050 | 0.945 | 1.137 | 1.003 – 1.047 | 1.053 | 0.9982 |

### 1990 cohort
| Country | Mean income ratio | SD per set | Min | Max | 95% CI of the mean | Net worth ratio (mean) | e0 ratio (mean) |
|---|---|---|---|---|---|---|---|
| TWN | 1.016 | 0.040 | 0.944 | 1.094 | 0.999 – 1.034 | 1.010 | 0.9999 |
| USA | 0.967 | 0.041 | 0.889 | 1.071 | 0.948 – 0.985 | 0.988 | 0.9996 |
| IND | 0.990 | 0.051 | 0.882 | 1.078 | 0.967 – 1.012 | 0.999 | 0.9999 |
| NGA | 0.888 ✗ | 0.069 | 0.808 | 1.043 | 0.857 – 0.918 | 0.797 | 0.9967 |
| BRA | 1.101 ✗ | 0.088 | 1.001 | 1.398 | 1.063 – 1.140 | 1.140 | 1.0005 |
| DEU | 1.023 | 0.054 | 0.926 | 1.166 | 0.999 – 1.046 | 1.043 | 1.0000 |
| KOR | 1.045 | 0.036 | 0.967 | 1.110 | 1.029 – 1.061 | 1.053 | 1.0012 |
| CHN | 0.927 | 0.054 | 0.810 | 1.015 | 0.904 – 0.951 | 0.881 | 0.9980 |
| ETH | 0.956 | 0.034 | 0.907 | 1.015 | 0.941 – 0.971 | 0.919 | 0.9959 |
| MEX | 1.058 | 0.049 | 0.956 | 1.142 | 1.036 – 1.080 | 1.081 | 0.9999 |
| IDN | 1.053 | 0.051 | 0.996 | 1.181 | 1.030 – 1.075 | 1.093 | 0.9991 |

✗ = mean outside ±8% (Nigeria in both cohorts; Brazil 1990 at 1.101 — Brazil is a fit country, not a guardrail cell).

## After (rc4 normalisers)

### 1970 cohort
| Country | Mean income ratio | SD per set | Min | Max | 95% CI of the mean | Net worth ratio (mean) | e0 ratio (mean) |
|---|---|---|---|---|---|---|---|
| TWN | 0.984 | 0.039 | 0.941 | 1.077 | 0.967 – 1.001 | 0.966 | 0.9996 |
| USA | 1.004 | 0.039 | 0.899 | 1.073 | 0.987 – 1.021 | 1.025 | 1.0006 |
| IND | 0.984 | 0.047 | 0.937 | 1.104 | 0.963 – 1.005 | 0.969 | 0.9966 |
| NGA | 0.998 | 0.072 | 0.882 | 1.162 | 0.966 – 1.029 | 0.988 | 0.9969 |
| BRA | 0.986 | 0.053 | 0.919 | 1.123 | 0.963 – 1.009 | 0.987 | 1.0003 |
| DEU | 0.997 | 0.047 | 0.902 | 1.092 | 0.976 – 1.017 | 0.989 | 1.0003 |
| KOR | 0.951 | 0.054 | 0.860 | 1.065 | 0.928 – 0.975 | 0.913 | 0.9989 |
| CHN | 1.056 | 0.050 | 0.974 | 1.168 | 1.034 – 1.078 | 1.068 | 0.9959 |
| ETH | 1.014 | 0.058 | 0.901 | 1.170 | 0.988 – 1.039 | 1.012 | 0.9979 |
| MEX | 0.994 | 0.038 | 0.922 | 1.056 | 0.978 – 1.011 | 1.009 | 1.0006 |
| IDN | 0.987 | 0.048 | 0.910 | 1.095 | 0.966 – 1.008 | 0.989 | 0.9982 |

### 1990 cohort
| Country | Mean income ratio | SD per set | Min | Max | 95% CI of the mean | Net worth ratio (mean) | e0 ratio (mean) |
|---|---|---|---|---|---|---|---|
| TWN | 1.016 | 0.040 | 0.944 | 1.094 | 0.998 – 1.034 | 1.009 | 0.9999 |
| USA | 0.995 | 0.043 | 0.916 | 1.103 | 0.977 – 1.014 | 1.028 | 0.9996 |
| IND | 1.016 | 0.053 | 0.905 | 1.106 | 0.993 – 1.039 | 1.042 | 0.9999 |
| NGA | 1.000 | 0.077 | 0.911 | 1.173 | 0.966 – 1.033 | 0.973 | 0.9967 |
| BRA | 1.016 | 0.081 | 0.924 | 1.290 | 0.981 – 1.052 | 1.031 | 1.0005 |
| DEU | 1.003 | 0.053 | 0.909 | 1.145 | 0.980 – 1.027 | 1.017 | 1.0000 |
| KOR | 1.048 | 0.036 | 0.971 | 1.114 | 1.033 – 1.064 | 1.058 | 1.0012 |
| CHN | 0.944 | 0.055 | 0.824 | 1.033 | 0.919 – 0.968 | 0.903 | 0.9980 |
| ETH | 0.986 | 0.035 | 0.935 | 1.047 | 0.971 – 1.001 | 0.972 | 0.9959 |
| MEX | 1.007 | 0.047 | 0.910 | 1.087 | 0.986 – 1.027 | 1.014 | 0.9999 |
| IDN | 1.014 | 0.049 | 0.958 | 1.137 | 0.992 – 1.035 | 1.034 | 0.9991 |

Every cell's mean is within ±8%, net worth within ±20%, e0 within 1%. One normaliser per country cannot remove cohort
differences: Korea (0.951 / 1.048) and China (1.056 / 0.944) differ by cohort but both cohorts stay inside the band.

## CI check (tests/unit/c0-guardrail-*.test.ts)

The single-set test is replaced by a pooled check: the first 8 of the 20 seed sets × N=200 for TWN/USA/IND/NGA × 1970/1990,
one test file per country so they run in parallel (≈ 2.5 min wall on 8 cores). The **mean of the per-set ratios** must be within
±8% (income), ±20% (net worth) and ±1% (e0); under-5 deaths must be identical in every set. The occupation-mix check
(±5 pts vs the 推估 national structure) stays on set 0 as before.

| Cell | Mean income ratio (8 sets) | Net worth | e0 | Largest pooled mix gap (pts) |
|---|---|---|---|---|
| IND 1970 | 0.975 | 0.951 | 0.9964 | public +1.0 |
| NGA 1970 | 1.042 | 1.037 | 0.9983 | public -3.8 |
| TWN 1970 | 0.983 | 0.947 | 1.0001 | services +3.7 |
| USA 1970 | 0.993 | 1.027 | 1.0008 | services +3.5 |
| IND 1990 | 1.021 | 1.046 | 0.9997 | professional +3.3 |
| NGA 1990 | 1.039 | 1.025 | 0.9975 | services +3.6 |
| TWN 1990 | 1.005 | 0.984 | 1.0011 | services +6.1 |
| USA 1990 | 0.999 | 1.042 | 0.9997 | services +3.6 |

Note on the mix: pooled over 8 sets, Taiwan 1990 has 6.1 pts more service jobs than the 推估 target (other cells ≤ 3.8 pts).
Set 0 is within 5 pts, as the old test required. Not tuned here: changing the group draw weights would move income
in every high-income country and require refitting `COUNTRY_K` again. Candidate for the next calibration pass.

Reproduce: `C0ISO=NGA C0YEAR=1970 C0SETS=20 C0N=200 npx vitest run -c tools/c0/vitest.config.ts tools/c0/multiseed.test.ts`.
