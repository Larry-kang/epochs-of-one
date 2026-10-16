/**
 * Single source of truth for product identity and feature flags.
 * Product name finalized 2026-10-16: 時代人生 / Epochs of One.
 * To rename, change APP only — no other file should hardcode a product name.
 */
export const APP = {
  name: '時代人生',
  nameEn: 'Epochs of One',
  title: '時代人生 · Epochs of One',
  subtitle: '一段人生，放在它所屬的時代裡。',
  storagePrefix: 'epochs',
} as const;

/** NOW_Y comes from config, not new Date(). */
export const NOW_YEAR = 2026;

export const ENGINE_VERSION = '0.5.0';

export const FEATURES = {
  /** Owner re-enabled BTC (2026-10-16) using self-compiled annual closes; investing UI lands in M4/M5. */
  btc: true,
  /** Taiwan stocks (TAIEX annual closes, self-compiled). Investing UI lands in M4. */
  taiex: true,
  /** Consumer credit (信貸, ) — planned for M5; types reserved only. */
  credit: true,
  investing: true,
} as const;

/** Owner decision 2026-10-16: OECD / Pink Sheet monthly values are monthly AVERAGES, which understate
 *  true intra-year lows (e.g. the 1987-10-19 crash). The margin-call check scales the recorded monthly max intra-year drawdown
 *  by this conservative factor (推估). Applies only to recorded drawdowns, not to the Brownian-bridge fallback. */
export const DRAWDOWN_SAFETY_FACTOR = 1.25;
