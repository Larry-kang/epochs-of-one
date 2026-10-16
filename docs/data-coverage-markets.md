# 市場資料覆蓋（自動產生：pipeline/markets-ext.mjs，2026-10-16）

所有水準皆為**年底值**：OECD 月股價、Pink Sheet 月金價取 12 月（12 月月平均）；TAIEX/BTC 為自行彙整年底收盤。`dd`＝當年月資料路徑的最大峰谷回撤（前一年 12 月為起始高點），無月資料者為 null → 引擎改用 Brownian bridge。引擎斷頭檢查使用 dd × DRAWDOWN_SAFETY_FACTOR（1.25，src/config.ts，推估；見 questions.md Q31）。

| 序列 | kind | 年份 | 有 dd 的年數 |
|---|---|---|---|
| eq.AUS | dec_monthly | 1958–2025 | 67/68 |
| eq.AUT | dec_monthly | 1957–2025 | 68/69 |
| eq.BEL | dec_monthly | 1985–2025 | 40/41 |
| eq.BGR | dec_monthly | 2000–2025 | 25/26 |
| eq.BRA | dec_monthly | 1994–2025 | 32/32 |
| eq.CAN | dec_monthly | 1956–2025 | 69/70 |
| eq.CHE | dec_monthly | 1955–2025 | 70/71 |
| eq.CHL | dec_monthly | 1990–2025 | 35/36 |
| eq.CHN | dec_monthly | 1999–2025 | 26/27 |
| eq.COL | dec_monthly | 1991–2025 | 34/35 |
| eq.CRI | dec_monthly | 1995–2025 | 30/31 |
| eq.CZE | dec_monthly | 1994–2025 | 31/32 |
| eq.DEU | dec_monthly | 1960–2025 | 65/66 |
| eq.DNK | dec_monthly | 1983–2025 | 42/43 |
| eq.ESP | dec_monthly | 1985–2025 | 40/41 |
| eq.EST | dec_monthly | 1996–2025 | 29/30 |
| eq.FIN | dec_monthly | 1957–2025 | 68/69 |
| eq.FRA | dec_monthly | 1955–2025 | 70/71 |
| eq.GBR | dec_monthly | 1957–2025 | 68/69 |
| eq.GRC | dec_monthly | 1985–2025 | 40/41 |
| eq.HRV | dec_monthly | 1997–2025 | 28/29 |
| eq.HUN | dec_monthly | 1991–2025 | 34/35 |
| eq.IDN | dec_monthly | 1997–2025 | 28/29 |
| eq.IND | dec_monthly | 1981–2025 | 45/45 |
| eq.IRL | dec_monthly | 1955–2025 | 70/71 |
| eq.ISL | dec_monthly | 1993–2025 | 32/33 |
| eq.ISR | dec_monthly | 1985–2025 | 41/41 |
| eq.ITA | dec_monthly | 1957–2025 | 68/69 |
| eq.JPN | dec_monthly | 1959–2025 | 66/67 |
| eq.KOR | dec_monthly | 1981–2025 | 44/45 |
| eq.LTU | dec_monthly | 1999–2025 | 26/27 |
| eq.LUX | dec_monthly | 1999–2025 | 26/27 |
| eq.LVA | dec_monthly | 2000–2025 | 25/26 |
| eq.MEX | dec_monthly | 1990–2025 | 36/36 |
| eq.NLD | dec_monthly | 1957–2025 | 68/69 |
| eq.NOR | dec_monthly | 1986–2025 | 39/40 |
| eq.NZL | dec_monthly | 1967–2025 | 58/59 |
| eq.POL | dec_monthly | 1991–2025 | 34/35 |
| eq.PRT | dec_monthly | 1988–2025 | 37/38 |
| eq.ROU | dec_monthly | 1997–2025 | 28/29 |
| eq.RUS | dec_monthly | 1997–2025 | 28/29 |
| eq.SVK | dec_monthly | 1993–2025 | 32/33 |
| eq.SVN | dec_monthly | 1995–2025 | 31/31 |
| eq.SWE | dec_monthly | 1960–2025 | 66/66 |
| eq.TUR | dec_monthly | 1996–2025 | 30/30 |
| eq.TWN | close | 1967–2025 | 0/59 |
| eq.USA | dec_monthly | 1957–2025 | 68/69 |
| eq.ZAF | dec_monthly | 1964–2025 | 62/62 |
| world | synthetic_gdp_weighted | 1960–2025 | 65/66 |
| gold | dec_monthly | 1960–2025 | 65/66 |
| btc | close | 2011–2025 | 0/15 |

## 重點年份年內最大回撤

| 序列 | 1974 | 1987 | 2000 | 2001 | 2002 | 2008 | 2020 | 2022 |
|---|---|---|---|---|---|---|---|---|
| USA | -32.1% | -26.8% | -5.2% | -15.3% | -23.4% | -43.7% | -23.3% | -16.5% |
| GBR | -53.9% | -30.4% | -8.1% | -21.5% | -24.8% | -34.4% | -24.1% | -7.8% |
| JPN | -21.6% | -15.8% | -21.9% | -26.2% | -23.4% | -44.9% | -19.9% | -4.9% |
| DEU | -12.7% | -36.4% | -23.0% | -30.8% | -41.6% | -46.3% | -25.1% | -26.3% |
| world | -25.6% | -23.9% | -8.7% | -19.0% | -23.2% | -45.9% | -19.8% | -13.4% |
| gold | -16.9% | -2.2% | -11.3% | -4.1% | -3.4% | -21.4% | -5.6% | -14.6% |
