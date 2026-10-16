# 時代人生 / Epochs of One

以 UN WPP 2024 與 World Bank WDI 公開資料驅動的人生模擬。線上遊玩：https://larry-kang.github.io/epochs-of-one/

## 本機遊玩
```bash
pnpm install --frozen-lockfile
pnpm build && pnpm preview      # 開 http://localhost:4173/
```
第一次載入後 service worker 會快取全部資料，之後離線也能玩。

## 開發指令
| 指令 | 用途 |
|---|---|
| `pnpm lint` | ESLint（禁 `Math.random`）+ `tsc --noEmit` |
| `pnpm test` | Vitest：單元、性質（fast-check）、golden 5 seeds、N=100k 校準子集 |
| `pnpm e2e` | Playwright（系統 Chrome；`CHROME_PATH` 可覆寫） |
| `pnpm data` | 重建 `public/data`（下載到 `data-raw/`，已 gitignore） |
| `node pipeline/markets.mjs` | 重建 TAIEX/BTC 年收盤（需 `data-raw/markets` 快取） |
| `pnpm sim --seed X --n N [--country ISO --year Y]` | CLI 模擬 |
| `pnpm calibrate [--n 100000]` | 校準報告 → `docs/calibration-report.md` |

名稱與功能旗標集中於 `src/config.ts`。文件：`CHANGELOG.md`、`docs/calibration-report.md`、`docs/calibration-wealth.md`、`docs/license-gate-report.md`、`docs/data-coverage.md`、`docs/data-imputation.md`。
