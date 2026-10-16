# NOTICE — 資料出處與授權 / Data attribution

本專案程式碼採 MIT（見 LICENSE）。`public/data/` 內資料為下列來源的**衍生/轉換**版本（重新整理格式、四捨五入、補值），
原始資料著作權屬各來源機構；轉換由本專案 `pipeline/` 執行，非來源機構之背書。取用日：2026-10-16。

| id | 來源 | 用途 | 授權 | 條款存檔 |
|---|---|---|---|---|
| `wpp2024` | United Nations, Department of Economic and Social Affairs, Population Division (2024). *World Population Prospects 2024*. https://population.un.org/wpp/ | 出生數、生命表 (abridged, 1950–2023)、e0、u5 (Q5)、出生性別比 | CC BY 3.0 IGO — http://creativecommons.org/licenses/by/3.0/igo/ | `pipeline/licenses/2026-10-16_population.un.org_wpp_downloads.rendered.html`、`…_wpp_downloads.png` |
| `oecd` | OECD (2026), *Share prices* (DF_FINMARK, monthly), *Analytical house prices* (DF_HOUSE_PRICES, RHP), *Pensions at a Glance* (DF_PAG), *Wealth Distribution Database* (DSD_WEALTH@DF_WEALTH), OECD Data Explorer, https://sdmx.oecd.org/public/rest/ (accessed on 2026-10-16) | 各國股價指數（年平均）、世界合成指數成分；（M5）實質房價指數、退休年齡與所得替代率；（P01）家戶淨資產中位數（僅作財富模型校準目標，不隨遊戲發佈） | OECD Terms & Conditions §3 Data：可商用/改作/散布，須署名 — https://www.oecd.org/en/about/terms-conditions.html （含第三方權利保留條款） | `pipeline/licenses/2026-10-16_oecd_terms.md`、`…_oecd_terms.png` |
| `wb-pinksheet` | World Bank, *Commodity Markets (Pink Sheet)* — CMO Historical Data Monthly. https://www.worldbank.org/en/research/commodity-markets | 黃金月價取 12 月為年底值＋年內最大回撤（USD/troy oz, 1960–2025） | CC BY 4.0 + World Bank Terms of Use for Datasets | `pipeline/licenses/2026-10-16_wb_pinksheet.png`、`…terms-of-use-for-datasets.html` |
| `wdi` | World Bank, *World Development Indicators* (API v2). https://data.worldbank.org/ | 人均 GDP (PPP, 2021 國際元)、CPI 通膨、官方匯率 PA.NUS.FCRF、放款利率 FR.INR.LEND、GDP (USD) NY.GDP.MKTP.CD（世界指數權重）、上市公司數 CM.MKT.LDOM.NO、PPP 換算 PA.NUS.PPP、Gini、所得五分位占比（源自 Poverty and Inequality Platform）、都市化率、失業率；（P01）稅收占 GDP GC.TAX.TOTL.GD.ZS、中等/高等教育毛入學率 SE.SEC.ENRR / SE.TER.ENRR、入學年齡 SE.PRM.AGES、人均 GDP 當期本國幣 NY.GDP.PCAP.CN（校準用） | CC BY 4.0 — https://datacatalog.worldbank.org/public-licenses | `pipeline/licenses/2026-10-16_datacatalog.worldbank.org_public-licenses.html`、`…_worldbank_public-licenses.png` |

變更聲明：數值經單位換算（% → 比例）、四捨五入至 4–6 位有效數字；缺值依 `docs/data-imputation.md` 規則補值並在資料中以 `imp` 標記，遊戲 UI 顯示「推估」。

未使用（授權不符或待驗證）：JST、IHME GBD、Coin Metrics、MSCI、Yahoo/yfinance、market-regime-weekly、Damodaran、FRED 第三方序列、WB `CM.MKT.INDX.ZG`、WID（授權待驗證 → 以 WDI/PIP 五分位占比替代）、ILOSTAT（待驗證 → 以 WDI `SL.UEM.TOTL.ZS` 替代，該序列為 ILO 模型估計經 WDI 以 CC BY 4.0 再散布）。

BTC：依 2026-10-16 使用者決定重新啟用（`FEATURES.btc = true`），僅使用自行交叉比對多個公開來源整理之**年收盤價**（`public/data/markets/annual-closes.json`，逐年註記查核來源）；不使用 Coin Metrics / FRED CBBTCUSD / Yahoo 任何資料庫整批複製。

世界股市（`eqWorld`）：本專案自建合成指數＝OECD 各國股價指數（月資料取 12 月＝年底值）依 WDI 前一年 GDP（USD）加權的美元報酬；**不是 MSCI 指數**。歐元區國家 1999 年前的 WDI 匯率以歐盟理事會公布的不可撤銷換算率換成歐元口徑（`fxEuroRebased`）。

M5：房價變動取自 OECD Analytical House Price Database（實質指數 RHP）；退休年齡與所得替代率取自 OECD *Pensions at a Glance 2024*（DF_PAG：CRPLF22、GPRR100），皆依 OECD 條款署名。信貸規則為各國主管機關公開規定的人工整理（數值規則，不複製任何資料庫），出處列於。
