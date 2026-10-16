# v0.8.1 focus rebalance (MC-driven)

Baseline MC: main 4498469 (before). Script: scripts/focus-mc.test.ts
(`MC_N=200 MC_LABEL=v081 npx vitest run -c scripts/vitest.mc.config.ts`). Seeds fmc-0..199, born 1990, autoSpend on.

## Changes
- **learn = investment**: −10% paid hours now × W; +0.6%/yr permanent wage growth × W (compounding via career.mult); promotion odds +30% × W.
  Grounding: training raises later wages by ~2–5% per year of training (Bassanini, Booth, Brunello, De Paola & Leuven 2007,
  *Workplace training in Europe*, OUP; Frazis & Loewenstein 2005, *J. Human Resources* 40(2)). We use the conservative end.
- **family**: marriage odds +14 pt × W (was 5); divorce hazard × (1 − 0.6W); child target may rise by one (prob 0.3W) but never above
  ⌈TFR / married share⌉ (WPP alignment); stronger happy/social drift; family bond +3W/yr (bond drifts back to 50 by 8%/yr).
- **health → mortality** (adult only, age ≥ 15, only lives with a focus in force): hazard × 0.94^((health−70)/10), clamped [0.75, 1.35]
  (DeSalvo et al. 2006, *J Gen Intern Med* 21(3): poor vs excellent self-rated health RR ≈ 1.9); health chip × (1 − 0.12W)
  (Arem et al. 2015, *JAMA Intern Med* 175(6); Warburton, Nicol & Bredin 2006, *CMAJ* 174(6): 20–30% lower mortality at guideline activity).
  Under-5 mortality untouched; lives without focus (golden seeds, m2 calibration) unchanged.
- **feedback**: focus card shows "去年重心的效果：…" (pay, wage growth, promotion odds, mortality risk, cost, marriage, bond, school, part-time).

## Guardrails
- Work vs family median lifetime income: TWN +33.2%, USA +33.4%, IND +47.4% (≥ 20% ✔).
- Learn vs work shape: income 25–34 ≈ 0.89×, 45–54 ≈ 1.07× (different life-cycle shape ✔); lifetime ≈ +5%.
- Auto focus vs none (TWN 1970, N=60): income and net worth bands pass; e0 within 2%. m2 e0/u5 calibration passes.

### v081 (N=200/cell, born 1990, seeds fmc-0..199)

| Country | Strategy | Income P10 | Income median | Income P90 | Net worth P10 | Net worth median | Net worth P90 | Mean lifespan | Mean final health | Ever married | Mean children | Mean promotions |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| TWN | work | 568k | 2.81M | 6.94M | 0k | 83k | 546k | 71.6 | 74.1 | 85% | 1.15 | 2.87 |
| TWN | family | 477k | 2.11M | 5.46M | 0k | 45k | 421k | 71.4 | 68.9 | 96% | 1.55 | 2.15 |
| TWN | learn | 614k | 2.95M | 7.52M | 2k | 95k | 532k | 71.6 | 74.1 | 85% | 1.14 | 2.93 |
| TWN | health | 544k | 2.41M | 6.09M | -5k | 40k | 370k | 73.9 | 89.9 | 86% | 1.15 | 2.65 |
| TWN | balance | 515k | 2.36M | 6.11M | -2k | 55k | 466k | 71.5 | 68.8 | 88% | 1.22 | 2.63 |
| TWN | auto | 552k | 2.52M | 6.38M | -2k | 55k | 486k | 71.8 | 69.7 | 87% | 1.21 | 2.69 |
| USA | work | 499k | 3.43M | 10.17M | -9k | 58k | 671k | 72.5 | 66.9 | 86% | 1.83 | 2.79 |
| USA | family | 407k | 2.57M | 8.17M | -12k | 37k | 484k | 72.4 | 60.6 | 96% | 2.35 | 2.08 |
| USA | learn | 546k | 3.63M | 10.62M | -10k | 79k | 647k | 72.6 | 66.9 | 85% | 1.82 | 2.90 |
| USA | health | 462k | 2.77M | 8.72M | -14k | 29k | 388k | 75.0 | 87.1 | 85% | 1.83 | 2.56 |
| USA | balance | 442k | 2.91M | 9.06M | -13k | 38k | 560k | 72.8 | 62.2 | 88% | 1.93 | 2.56 |
| USA | auto | 473k | 3.02M | 9.52M | -12k | 41k | 483k | 73.0 | 63.0 | 88% | 1.92 | 2.60 |
| IND | work | 0k | 314k | 918k | -2k | 4k | 67k | 56.7 | 70.8 | 72% | 1.86 | 2.25 |
| IND | family | 0k | 213k | 734k | -3k | 3k | 51k | 56.5 | 65.2 | 80% | 2.21 | 1.70 |
| IND | learn | 0k | 332k | 999k | -2k | 5k | 63k | 56.7 | 70.4 | 72% | 1.86 | 2.35 |
| IND | health | 0k | 234k | 796k | -3k | 2k | 47k | 58.8 | 86.5 | 72% | 1.86 | 2.13 |
| IND | balance | 0k | 238k | 803k | -3k | 3k | 54k | 56.7 | 66.7 | 74% | 1.93 | 2.08 |
| IND | auto | 0k | 252k | 850k | -3k | 3k | 57k | 57.1 | 67.4 | 74% | 1.92 | 2.14 |

| Country | Work vs family median lifetime income | Work vs family mean income |
|---|---|---|
| TWN | 33.2% | 29.3% |
| USA | 33.4% | 28.7% |
| IND | 47.4% | 30.7% |

| Country | learn/work income age 25–34 | learn/work income age 45–54 | divorce share work / family |
|---|---|---|---|
| TWN | 0.886 | 1.068 | 11% / 3% |
| USA | 0.885 | 1.062 | 11% / 3% |
| IND | 0.893 | 1.076 | 10% / 2% |

## Single-select (v0.8.1 release)

The yearly focus is single-select: one chip at a time, picking another replaces it. Recorded multi-chip allocations from
older saves collapse deterministically to the chip with the largest share (ties: fixed chip order) — `single()` in
src/engine/life/focus.ts. Comparison lives keep the engine-internal auto blend, so the comparison calibration is unchanged; the
player-facing auto-choice records `single(autoAlloc(...))`. MC rerun (N=200/cell, same seeds; strategies now single chips,
"balance" = the balance chip alone): work / family / learn / health / auto rows are identical to the table above
(work vs family median lifetime income TWN +33.2%, USA +33.4%, IND +47.4%; learn/work 25–34 ≈ 0.89×, 45–54 ≈ 1.07×; divorce 11% / 3%).
Balance chip alone: TWN median income 2.17M, USA 2.72M, IND 227k; lifespans 71.4 / 72.5 / 56.6. No weight recalibration needed.
A cleared focus ("{}") is no effect at all (hazard multiplier back to 1, no feedback line).
