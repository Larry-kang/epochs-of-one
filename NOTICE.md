# NOTICE — 資料出處與授權 / Data attribution

本專案程式碼採 MIT（見 LICENSE）。`public/data/` 內資料為下列來源的**衍生/轉換**版本（重新整理格式、四捨五入、補值），
原始資料著作權屬各來源機構；轉換由本專案 `pipeline/` 執行，非來源機構之背書。取用日：2026-10-16。

| id | 來源 | 用途 | 授權 | 條款存檔 |
|---|---|---|---|---|
| `wpp2024` | United Nations, Department of Economic and Social Affairs, Population Division (2024). *World Population Prospects 2024*. https://population.un.org/wpp/ | 出生數、生命表 (abridged, 1950–2023)、e0、u5 (Q5)、出生性別比 | CC BY 3.0 IGO — http://creativecommons.org/licenses/by/3.0/igo/ | `pipeline/licenses/2026-10-16_population.un.org_wpp_downloads.rendered.html`、`…_wpp_downloads.png` |
| `oecd` | OECD (2026), *Analytical house prices* (DF_HOUSE_PRICES, RHP), *Pensions at a Glance* (DF_PAG), *Wealth Distribution Database* (DSD_WEALTH@DF_WEALTH), OECD Data Explorer, https://sdmx.oecd.org/public/rest/ (accessed on 2026-10-16) | （M5）實質房價指數、退休年齡與所得替代率；（P01）家戶淨資產中位數（僅作財富模型校準目標，不隨遊戲發佈） | OECD Terms & Conditions §3 Data：可商用/改作/散布，須署名 — https://www.oecd.org/en/about/terms-conditions.html （v0.10.0 起不再使用 OECD 股價：指數屬第三方指數公司） | `pipeline/licenses/2026-10-16_oecd_terms.md`、`…_oecd_terms.png` |
| `wb-pinksheet` | World Bank, *Commodity Markets (Pink Sheet)* — CMO Historical Data Monthly. https://www.worldbank.org/en/research/commodity-markets | 黃金月價取 12 月為年底值＋年內最大回撤（USD/troy oz, 1960–2025） | CC BY 4.0 + World Bank Terms of Use for Datasets | `pipeline/licenses/2026-10-16_wb_pinksheet.png`、`…terms-of-use-for-datasets.html` |
| `ilostat` | International Labour Organization, ILOSTAT database (SDMX API): *Employment by sex and occupation* (DF_EMP_TEMP_SEX_OCU_NB), *Informal employment rate by sex* (DF_EMP_NIFL_SEX_RT). https://ilostat.ilo.org/ (accessed 2026-10-17) | （L1）`l1/ilostat-occ.json`：各國依性別×ISCO 大類的就業占比（入行機率的性別權重）；`l1/ilostat-informality.json`：依性別的非正式就業率 | CC BY 4.0（2023-05-03 以後發布者）— https://www.ilo.org/rights-and-permissions 。改作聲明：本專案已改作（換算比例、取年代代表年）；ILO 不為改作背書；不使用 ILO 標誌 | `pipeline/licenses/2026-10-17_www.ilo.org_rights-and-permissions.html` |
| `oecd-pag` | OECD (2025), *Pensions at a Glance 2025: OECD and G20 Indicators*, OECD Data Explorer DF_PAG. https://sdmx.oecd.org/public/rest/ | （L1）`l1/pag2025.json`：只取 OECD 年金模型計算之指標（CRPLF22、FRPLF22、GPRR100、NPRR100）；源自國家調查或其他機構的第三方指標一律剔除（清單見檔內 `dropped`） | CC BY 4.0（OECD Terms ）。This is an adaptation of an original work by the OECD. The opinions expressed and arguments employed in this adaptation should not be reported as representing the official views of the OECD or of its Member countries. | `pipeline/licenses/2026-10-16_oecd_terms.md` |
| `uis` | UNESCO Institute for Statistics (UIS), Data API: GER.5T8 (gross enrolment ratio, tertiary). https://databrowser.uis.unesco.org/ (accessed 2026-10-17) | （L1）`sa/uis-tertiary.json`：高等教育毛入學率 | **CC BY-SA 4.0** — https://creativecommons.org/licenses/by-sa/4.0/ 。**相同方式分享**：只放在 `public/data/sa/` 的獨立檔案，該檔整體以 CC BY-SA 4.0 授權，不併入其他資料或程式碼 | `pipeline/licenses/2026-10-17_databrowser.uis.unesco.org_terms-and-conditions.html` |
| `wdi` | World Bank, *World Development Indicators* (API v2). https://data.worldbank.org/ | 人均 GDP (PPP, 2021 國際元)、CPI 通膨、官方匯率 PA.NUS.FCRF、放款利率 FR.INR.LEND、GDP (USD) NY.GDP.MKTP.CD（世界指數權重）、上市公司數 CM.MKT.LDOM.NO、PPP 換算 PA.NUS.PPP、Gini、所得五分位占比（源自 Poverty and Inequality Platform）、都市化率、失業率；（P01）稅收占 GDP GC.TAX.TOTL.GD.ZS、中等/高等教育毛入學率 SE.SEC.ENRR / SE.TER.ENRR、入學年齡 SE.PRM.AGES、人均 GDP 當期本國幣 NY.GDP.PCAP.CN（校準用） | CC BY 4.0 — https://datacatalog.worldbank.org/public-licenses | `pipeline/licenses/2026-10-16_datacatalog.worldbank.org_public-licenses.html`、`…_worldbank_public-licenses.png` |

變更聲明：數值經單位換算（% → 比例）、四捨五入至 4–6 位有效數字；缺值依 `docs/data-imputation.md` 規則補值並在資料中以 `imp` 標記，遊戲 UI 顯示「推估」。

未使用（授權不符或待驗證）：JST、IHME GBD、Coin Metrics、MSCI、Yahoo/yfinance、market-regime-weekly、Damodaran、FRED 第三方序列、WB `CM.MKT.INDX.ZG`、WID（授權待驗證 → 以 WDI/PIP 五分位占比替代）。ILOSTAT 自 L1（v0.10.0）起直接使用（CC BY 4.0，見上表）。

**L1 禁用來源（授權閘門會擋下）：** WHO GHO（不得再散布衍生資料）、ISSA Country Profiles（著作權，僅供研究參考）、中國國家統計局與奈及利亞國家統計局（無開放授權 → 相關數值標「推估」）、韓國 KOGL 第 2–4 類（非商業/禁改作；只接受第 1 類）、OECD 含第三方權利的序列。World Bank 只接受資料目錄／指標詮釋資料標示 CC BY 4.0 者（逐一檢查見 `pipeline/l1/wdi-licences.json`）。

BTC：依 2026-10-16 使用者決定重新啟用（`FEATURES.btc = true`），僅使用自行交叉比對多個公開來源整理之**年收盤價**（`public/data/markets/annual-closes.json`，逐年註記查核來源）；不使用 Coin Metrics / FRED CBBTCUSD / Yahoo 任何資料庫整批複製。

股市（v0.10.0）：沒有可公開授權的美國或世界股價指數（OECD 股價的指數屬第三方指數公司；WDI CM.MKT.INDX.ZG 為 S&P 資料），因此**美國與世界股價改用推估模型**：股價水準跟著名目 GDP（美元，WDI NY.GDP.MKTP.CD，CC BY 4.0）走，年內最低點用隨機路徑估計；遊戲中標示「推估」。台股仍用自行整理的 TAIEX 年收盤價；其他國家的本國股市以世界指數代理（推估）。

M5：房價變動取自 OECD Analytical House Price Database（實質指數 RHP）；退休年齡與所得替代率取自 OECD *Pensions at a Glance 2024*（DF_PAG：CRPLF22、GPRR100），皆依 OECD 條款署名。信貸規則為各國主管機關公開規定的人工整理（數值規則，不複製任何資料庫），出處列於。
