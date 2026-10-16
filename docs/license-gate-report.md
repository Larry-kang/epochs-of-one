# License gate 報告（2026-10-16）

規則：每個資料檔的每個來源必須已登錄於 pipeline/sources.json 且 license.class ∈ {open, attribution}；nc / restricted / unknown / 未登錄 → build 失敗（prebuild 執行）。

結果：**PASS**，239 檔。

| 來源 / class / 結果 | 檔案-來源配對數 |
|---|---|
| wpp2024 / attribution / PASS | 238 |
| wdi / attribution / PASS | 1 |
| epochs-compiled / open / PASS | 1 |

已登錄但未使用（class=unknown，若使用會被擋）：wid、ilostat。

自動測試另驗證 nc / restricted / unknown / 未登錄 各自會讓 gate 失敗（tests/unit/m0-license-gate.test.ts）。
