# zh-Hant 風格與術語規範(locked 2026-08-24)

本檔是 `src/i18n/zh-Hant.json`、doc 頁面 zh 區塊、`definition_zh`/`caveats_zh` 的唯一風格依據。
改動術語前先改這裡,再全站同步;`tests/unit/i18n.test.ts` 會擋下退化為英文的翻譯。

## 1. 術語表(不可任意替換)

| 英文                                        | zh-Hant(採用)         | 不採用(原因)                                     |
| ------------------------------------------- | ----------------------- | -------------------------------------------------- |
| refugees                                    | 難民                    |                                                    |
| asylum-seekers                              | 庇護申請者              | 尋求庇護者(冗長)                                 |
| internally displaced persons (IDPs)         | 境內流離失所者(IDP)   | 國內流離失所者(「境內」為 UNHCR 中文慣用)        |
| stateless persons                           | 無國籍者                |                                                    |
| others of concern (OOC)                     | 其他受關注者            |                                                    |
| other people in need of intl. protection    | 其他需要國際保護者      |                                                    |
| returned refugees / IDPs                    | 回返難民/回返境內流離失所者 | 返回(「回返」為人道領域慣用)                 |
| host community (hst)                        | 接待社區                | 收容社區(見下)                                   |
| total people of concern                     | 受關注者總數            |                                                    |
| country of asylum                           | 庇護國                  | **收容國**——台灣法律語境中「收容」指移民收容(拘留),用於難民語境有污名效果 |
| country of origin                           | 來源國                  |                                                    |
| view: "Where they are now"                  | 他們現在在哪裡(短:現居地) |                                                |
| view: "Where they fled from"                | 他們從哪裡逃離(短:來源地) |                                                |
| confirmed / estimate                        | 確認數據/估計數據      |                                                    |
| not reported (≠ zero)                       | 未報告(不等於零)      | 無資料(會被誤讀為「沒有人」)                     |
| forced displacement                         | 被迫流離失所            | 強迫遷徙                                           |

## 2. 標點

- 全形標點:逗號「,」、頓號「、」、句號「。」、冒號「:」、分號「;」、括號「()」。
- 數字、英文縮寫、程式碼、URL 維持半形;數字千分位用半形逗號(12,345)。
- 引號用「」;書名/公約用《》(如《難民地位公約》)。
- 破折號用「——」(雙全形)。

## 3. 語氣與尊嚴

- 一律「流離失所者」「人」,不用「難民潮」「湧入」「氾濫」等水災隱喻。
- 不渲染、不獵奇:事件層彈窗只給數字、類型、日期與 IDMC 連結,不轉貼敘述文字。
- 「估計」「初步」「未報告」必須照實標示,不淡化。

## 4. 機制

- `en.json` 是 key 集合的唯一來源;`zh-Hant.json` 由型別檢查強制 key 完全一致。
- 佔位符(`{n}`、`{year}` …)兩語言必須一致(單元測試強制)。
- 國名:`display_name_zh` 覆寫 → `Intl.DisplayNames('zh-Hant-TW')` → 英文顯示名。
- 資料層翻譯(指標定義、注意事項、爭議地區註記)在 ETL 產出(`definition_zh` 等欄位),
  不在 UI 字典裡。
