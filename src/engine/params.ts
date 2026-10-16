// Engine parameters. Every entry has a `source`. Values marked TODO(param) are NOT sourced
// and NOT derivable from the allowed data yet — they are placeholders listed in docs/questions.md.
export interface Param { value: number; unit: string; desc: string; source: string }

export const PARAMS = {
  laborEntryAge: { value: 15, unit: 'years', desc: 'age from which labor-force participation/unemployment applies', source: 'WDI SL.UEM.TOTL.ZS definition (labor force ages 15+)' },
  retireAge: { value: 65, unit: 'years', desc: 'FALLBACK only: retirement age when the OECD pension layer is absent (M5 uses OECD PaG CRPLF22 by country/sex, else the OECD median, flagged 推估)', source: 'OECD Pensions at a Glance 2024 median (65.0 men) — see public/data/markets/housing-pension.json' },
  incomeToGdp: { value: 1, unit: 'ratio', desc: 'mean personal income as share of GDP per capita (PPP)', source: 'TODO(param) — needs household-income/GDP data; 1.0 placeholder' },
  urbanQuintileGradient: { value: 0, unit: 'logit/quintile', desc: 'logistic adjustment of P(urban) by income quintile', source: 'TODO(param) — 0 means P(urban|c,q)=urbanization rate' },
  rankPersistence: { value: 1, unit: 'ratio', desc: 'income rank persistence parent→adult (1 = keeps birth quintile rank)', source: 'TODO(param) — intergenerational mobility data not yet in pipeline' },
  minYearSec: { value: 0.5, unit: 's', desc: 'minimum real seconds per sim year at 1×', source: 'design ' },
  maxYearSec: { value: 60, unit: 's', desc: 'maximum real seconds per sim year at 1×', source: 'design ' },
  maxYearsPerFrame: { value: 4, unit: 'years', desc: 'batch-step cap per animation frame', source: 'design' },
  companionsN: { value: 400, unit: 'lives', desc: 'same-country same-year comparison sample for death-screen percentiles', source: 'design (sampling size; statistical, not a calibration constant)' },
  levK: { value: 2, unit: 'ratio', desc: 'target leverage k = A/E for the leveraged equity sleeve', source: 'typical regulatory/broker k_max (TODO(param) per country)' },
  levMaint: { value: 0.25, unit: 'ratio', desc: 'maintenance margin m: liquidate when (A−L) < m·A at the intra-year low', source: 'common maintenance margin m=0.25 (TODO(param) per country/broker)' },
  levSlippage: { value: 0.02, unit: 'ratio', desc: 'fire-sale slippage on forced liquidation', source: 'TODO(param) — names the parameter without a value' },
  levCooldown: { value: 3, unit: 'years', desc: 'years after a margin call before leverage can be reopened', source: 'TODO(param) — cooldown without a value' },
  wageLag: { value: 0.5, unit: 'ratio', desc: 'λ: share of the current year\'s inflation that nominal wages catch up within the year ; the gap is restored the next year', source: 'TODO(param) — ideally estimate λ from ILOSTAT wages vs CPI (ILOSTAT license unverified)' },
  // ---- M5 housing / mortgage — no sourced numbers → all TODO(param)
  priceToIncome: { value: 5, unit: 'ratio', desc: 'house price at purchase = k × national mean income (GDP pc PPP) of that year', source: 'TODO(param) — price-to-income ratio data license unverified' },
  ltv: { value: 0.7, unit: 'ratio', desc: 'maximum loan-to-value for a mortgage', source: 'TODO(param) — per-country LTV caps not in allowed data yet' },
  mortgageTerm: { value: 20, unit: 'years', desc: 'mortgage term (annuity, floating rate)', source: 'TODO(param)' },
  mortgageSpread: { value: 0, unit: 'rate', desc: 'mortgage rate = WDI lending rate (FR.INR.LEND) + spread', source: 'TODO(param) — central-bank mortgage series licenses unverified' },
  rentYieldNet: { value: 0.02, unit: 'ratio/yr', desc: 'imputed rent net of maintenance saved by an owner-occupier (reduces consumption)', source: 'TODO(param)' },
  sellCost: { value: 0.06, unit: 'ratio', desc: 'transaction cost when selling / foreclosing a house', source: 'TODO(param) — high transaction cost (param)' },
  // ---- M5 consumer credit
  creditMinAge: { value: 20, unit: 'years', desc: 'minimum age to apply for a personal loan', source: 'age ≥ 20【參數】' },
  creditSpread: { value: 0.05, unit: 'rate', desc: 'personal-loan rate = WDI lending rate + spread (capped by legal maximum where known)', source: 'TODO(param) — 無官方序列者 = 短率 + 利差參數（推估）' },
  creditTerm: { value: 5, unit: 'years', desc: 'default personal-loan term (1–7 allowed)', source: '期限 1–7 年【參數】' },
  dtiProxy: { value: 0.5, unit: '× annual income', desc: 'unsecured-credit cap where no official rule exists (capProxy, flagged 推估)', source: 'TODO(param) — capProxy' },
  dsrProxy: { value: 0.4, unit: 'ratio', desc: 'max total annual debt service / income where no official DSR exists', source: 'TODO(param) — dsrProxy (KOR official 40% used as reference)' },
  lateFee: { value: 0.05, unit: '× payment', desc: 'late fee added to the balance on a missed payment', source: 'TODO(param) — 滯納金【參數】' },
  garnish: { value: 0.1, unit: '× income', desc: 'share of income taken each year to repay written-off debt', source: 'TODO(param) — 每年收入扣一定比例（參數）' },
  freezeYears: { value: 7, unit: 'years', desc: 'credit freeze after a default (no loans, mortgage, leverage)', source: 'TODO(param) — 信用凍結 N 年' },
  // ---- M5 annuity
  annuityMinAge: { value: 55, unit: 'years', desc: 'earliest age to buy a life annuity', source: 'TODO(param)' },
  annuityRate: { value: 0.02, unit: 'real rate', desc: 'real discount rate used to price the life annuity', source: 'TODO(param)' },
  annuityLoad: { value: 0.05, unit: 'ratio', desc: 'insurer loading on the actuarially fair annuity price', source: 'TODO(param)' },
} as const satisfies Record<string, Param>;
