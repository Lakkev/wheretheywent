# Where They Went — 開發規格書 (Development Specification)

> **版本**:1.0
> **日期**:2026-08-19
> **狀態**:規格凍結,可據此開發
> **本文件是自足的**:開發者(人類或 AI)不需要任何其他上下文即可依此動工。所有標示「實測」的數字皆為 2026-08-19 直接呼叫 API 驗證的結果,非推測。
> **工作目錄**:`D:\Daily`(空目錄,非 git repo)
> **環境**:Node v22.22.2 / npm 10.9.7 / git 2.37.3 / Windows 11

---

## 目錄

1. [產品定義](#1-產品定義)
2. [已確認的需求決策(全部凍結)](#2-已確認的需求決策)
3. [🔴 資料陷阱(先讀這章再寫任何程式)](#3-資料陷阱)
4. [架構總覽](#4-架構總覽)
5. [技術棧(版本鎖定)](#5-技術棧)
6. [專案目錄結構](#6-專案目錄結構)
7. [ETL Pipeline 規格](#7-etl-pipeline-規格)
8. [前端規格](#8-前端規格)
9. [URL 狀態 Schema](#9-url-狀態-schema)
10. [引用與來源標註機制](#10-引用與來源標註機制)
11. [邊界、台灣與爭議地區處理](#11-邊界台灣與爭議地區處理)
12. [分批交付計畫(6 批)](#12-分批交付計畫)
13. [驗證與測試規格](#13-驗證與測試規格)
14. [風險登記簿](#14-風險登記簿)
15. [附錄 A:資料源 API 完整參考(全部實測)](#附錄-a資料源-api-完整參考)
16. [附錄 B:捐款機制(導流模式)](#附錄-b捐款機制)
17. [附錄 C:待委託人決定/提供事項](#附錄-c待委託人決定提供事項)

---

# 1. 產品定義

## 1.1 一句話

面向**記者、研究者、NGO 工作者**的全球流離失所資料平台:互動世界地圖呈現各國難民、庇護申請者、境內流離失所者(IDP)、無國籍者的人數與流向;**所有數字可下載、標明出處與截止日期、可透過固定連結分享重現**。

## 1.2 起源與兩個被否決的原始構想

委託人原始構想為「難民追蹤 + 捐款(自留 10%)+ 金流透明」。經可行性檢視:

1. **「追蹤個別難民」永久否決** — 難民是受迫害人口,公開個別位置/身分可能導致家人被報復、庇護申請被駁回。UNHCR 有明文資料保護政策。**本專案只處理群體統計,永不涉及個人層級資料。這是不可協商的紅線。**
2. **自行收捐款否決** — 台灣《公益勸募條例》僅法人可公開勸募;抽成使性質變為營利平台;金流中介需牌照。**改採導流模式(附錄 B)。**

## 1.3 成功定義

**被專業人士引用與使用**(記者在報導引用、研究者下載資料、NGO 拿去用),不追流量 KPI。
→ 開發優先序:引用格式正確性 > 方法論頁完整性 > 資料品質 > 固定連結穩定性 > 視覺效果。

## 1.4 硬性約束

- 營運成本 **$0/月**
- 委託人**不寫程式**,長期由 AI 維護 → 依賴少、主流、文件齊全、失敗自動降級、Email 告警
- 執行期**完全不呼叫上游 API**(所有資料 build-time 靜態化)

---

# 2. 已確認的需求決策

以下皆經委託人逐項確認,**視為凍結**,除非委託人明示變更。

| # | 項目 | 決定 |
|---|---|---|
| D1 | 專案名稱 | **Where They Went**(中文:他們去了哪裡) |
| D2 | 受眾 | 主:記者/研究者/NGO;次:一般讀者(經 Stories 頁) |
| D3 | 語言 | 英文優先,繁體中文次之。**MVP 只上英文,但 i18n 結構完整到位**(`zh-Hant.json` 先放英文值) |
| D4 | 使用環境 | 桌機優先;手機可看(簡化版),不做完整手機功能 |
| D5 | 首頁版型 | **地圖滿版 + 浮動面板**(可收合左軌 + 右側詳情卡 + 底部時間軸) |
| D6 | 配色 | **中性單色階**(藍/青,ColorBrewer Blues / YlGnBu)。**禁用紅/橙暖色階**(避免暗示「難民=威脅」)。天然色盲友善 |
| D7 | 資料視角 | **雙視角可切換**:「誰逃出來」(origin/coo)/「誰收容他們」(asylum/coa)。ETL 產兩套聚合 |
| D8 | 人口類別 | **全部**:refugees、IDPs、asylum-seekers、stateless、returnees(refugees+IDPs)、OOC、OIP |
| D9 | 數值尺度 | **絕對數 + 人均(每千居民)可切換**。人口分母用 UN WPP(見 §3.6) |
| D10 | 資料新鮮度 | 每日自動更新的靜態快照 |
| D11 | 近即時補強 | **IDMC IDU 為主**(延遲<24h);UNHCR `/nowcasting/` 降級為首頁一張「最新估計」卡片。UI 明確區分「確認數據」vs「估計數據」 |
| D12 | 必要功能 | ①任何圖表可下載 CSV/JSON ②每個數字標出處+截止日+可複製引用 ③國家詳情頁+2–3 國比較 ④篩選狀態全進 URL 可分享重現 |
| D13 | 頁面 | `/` 地圖、`/country/[iso3]`、`/compare`、`/methodology`、`/data` 下載中心、`/about`、`/about/boundaries`、`/stories`(P1) |
| D14 | 邊界 | **混合方案**:繪圖用 Natural Earth(50m 簡化),資料 join 用 ISO3。**COD 已驗證不可用**(§11.1) |
| D15 | Repo | **Public**(Actions 免費無上限)但 **All rights reserved**(非開源授權) |
| D16 | ETL 失敗 | 自動降級(保留上次快照+頁面標示)+ **Email 告警**(GitHub pinned issue 通知) |
| D17 | 錯誤回報 | Email + 頁面上情境化回報連結(預填當前 URL 與篩選狀態) |
| D18 | 聯絡信箱 | 專案專用信箱(委託人另行註冊,勿用個人主信箱) |
| D19 | 無障礙 | **WCAG 2.2 AA** |
| D20 | 交付節奏 | **分批交付(6 批)**,每批可實際跑起來看 |
| D21 | 捐款 | **導流模式,錢不經過本站**(附錄 B) |
| D22 | ACLED | **永久排除**(免費層無 API;EULA 禁止 dashboard 再發布) |
| D23 | IOM DTM | Phase 1 不納入(license 標 `Other`,商業使用需先向 IOM 書面確認) |

**分階段**:

| 階段 | 內容 |
|---|---|
| **Phase 1 (MVP)** | 存量 choropleth + 時間軸(1951–最新)+ 雙視角 + 人均 + 國家詳情 + 比較 + 下載 + 引用 + URL 狀態 + Methodology/Data/About |
| **Phase 2** | 流動路徑弧線(資料已在 Phase 1 ETL 抓齊)、邊界集切換(UNmap/FieldMaps,非 COD) |
| **Phase 3** | 即時事件疊加(ReliefWeb,需先取得 appname 核准) |

---

# 3. 資料陷阱

> **這章是整份規格書最重要的部分。每一條都是實測發現、天真實作必踩、且畫面上看不出來的錯誤。**

## 3.1 🔴 UNHCR 的 `coo`/`coa` 欄位不是 ISO3,且會撞碼

`/countries/` 回傳 232 國,其中 **99 國的 `code` 與 `iso` 不同**,含**致命碰撞**(UNHCR 內部碼恰好等於另一國的 ISO3):

| UNHCR `code` | 其 `iso`(真身) | 💀 若當 ISO3 用 |
|---|---|---|
| `AUS` | `AUT` Austria | 奧地利的數字算到**澳洲** |
| `ARE` | `EGY` Egypt | 埃及的數字算到**阿聯** |
| `MAR` | `MTQ` Martinique | 馬提尼克算到**摩洛哥** |

其他例:`AUL`=Australia、`MOR`=Morocco、`UAE`=UAE、`CHI`=China、`GFR`=Germany、`SRV`=Vietnam、`GAZ`=Palestine、`ALG`=Algeria、`CHD`=Chad、`BSN`=Bosnia、`BKF`=Burkina Faso、`CVI`=Cabo Verde。

**而且 `cf_type=ISO` 參數只影響輸入端**(可用 ISO3 查詢),**輸出欄位仍是內部碼**。實測:`?coa=DEU&cf_type=ISO` 可查到德國,但回傳 `{"coa":"GFR","coa_iso":"DEU"}`。

> **鐵則**:
> 1. 所有查詢一律加 `cf_type=ISO`
> 2. **解析時只讀 `coo_iso` / `coa_iso`,`coo` / `coa` 在 parse 階段就 delete**
> 3. 三組碰撞(`AUS/ARE/MAR`)寫成單元測試 golden case
> 4. `codes.ts` 加主動偵測:若任何下游程式碼觸碰 `coo`/`coa` 欄位即 throw

非 ISO 實體需 override:`CRB`(加勒比彙總,iso=null)、`CUR`(iso=null,應為 CUW)、`SGS`(iso=null)、`UNK`(Unknown)、`TIB`(Tibetan,`region:"Various"`、`iso2:null`,非國家 origin 項,join 會落單)、`STA`(Stateless→`XXA`)。

## 3.2 🔴 UNHCR 所有端點的數值欄位型別不穩

實測 `/population/`、`/demographics/`、`/solutions/`、`/nowcasting/` 一致:

```
值為零   → 字串 "0"
缺值     → 字串 "-"     (= 未報告)
有值     → number
```

> **鐵則**:寫統一的 `toNum()`:`"-"` → `null`、`"0"` → `0`、number → number。
> **`null`(未報告)與 `0`(確實為零)必須全程可區分** — 在 codec、圖表(實線斷點 vs 落到零)、色階(無資料灰 vs 色階最淺端)、CSV 中都不可混淆。這對專業受眾是關鍵區別,寫成 codec round-trip 測試。

## 3.3 🔴 台灣在各資料源中互相矛盾(需委託人決策,見附錄 C)

| 資料源 | 台灣 |
|---|---|
| Natural Earth 幾何(本專案採用) | ✅ 獨立 admin-0 feature |
| UNmap(UN 官方幾何) | ✅ 有 `ISO3CD=TWN` 獨立 polygon,但 `MAPCLR=CHN`(官方規則塗中國色) |
| **UNHCR 統計** | 🔴 **完全不存在**(232 國零命中,連併入 CHN 的註記都沒有) |
| World Bank 人口 | 🔴 完全不存在 |
| UN WPP 人口 | ✅ 有(id 158,iso3 `TWN`,名稱 `"China, Taiwan Province of China"` → UI 顯示名需覆寫) |

→ 台灣畫得出來,但難民數永遠 null。同類:UNHCR 把 Kosovo 併入 SRB(顯示名 `"Serbia and Kosovo: S/RES/1244 (1999)"`,需覆寫)。

## 3.4 🔴 World Bank API 回傳帶 UTF-8 BOM

`api.worldbank.org` 回傳以 `\uFEFF` 開頭。瀏覽器 `Response.json()` 會吃掉,**Node `JSON.parse(fs.readFileSync())` 會炸**。→ `.replace(/^\uFEFF/, '')`。

## 3.5 🔴 HDX 資源下載會 302 到有時效的 S3 presigned URL,且 S3 無 CORS

→ 只能 build-time 抓;**每次先呼叫 `package_show` 取當下的 resource URL,絕不硬編碼 S3 URL**。

## 3.6 🔴 IDMC 的 HDX 鏡像已死,舊 URL 全部作廢

- `idus_view_flat.csv`(Google Sheets 鏡像)→ 實測只剩 912 bytes,已截斷損壞
- `backend.idmcdb.org/*` → 主機已下線(DNS 失敗)

活的端點是 Helix API(附錄 A.5)。其 302 第一跳**無 CORS header** → 純前端 fetch 必死,只能 build-time 抓。

## 3.7 ⚠️ 其他

- **UNHCR `/footnotes/` 的 `year` 是字串**,不是 number
- **`/asylum-applications/` 的 `app_pc` 欄位**:C=案件數 / P=人數,**不過濾會重複計數**
- **IDMC IDU 的 `standard_popup_text` 含 raw HTML**(`<b>`,`<br>`)→ 渲染前 sanitize
- **UNHCR 2026 年無資料**:實測 `yearFrom=2026` → `maxPages: 0`。最新完整年份 = **2025**。年度數據每年 6 月發布上年度、10/11 月發布當年上半年 → **年份上界必須自動偵測,不可寫死**(§7.3)
- **Windows CRLF**:`.gitattributes` 必須設 `* text=auto eol=lf`,否則 JSON 資料檔產生假 diff,「只在變更時 commit」機制失效

---

# 4. 架構總覽

```
GitHub Actions (public repo,免費無上限,每日 03:17 UTC)
  ├─ fetch      UNHCR API(~45 次請求,併發 2,間隔 300ms)+ WPP CSV + IDMC
  ├─ geo        world-atlas 50m → mapshaper 簡化 → TopoJSON
  ├─ transform  ISO3 正規化 → 聚合 → 欄式編碼 → 分片
  ├─ validate   zod schema + 18 條不變量 + golden numbers + 檔案大小
  ├─ promote    逐 source 原子性替換(失敗保留上次快照)
  └─ commit     僅在內容 hash 改變時 commit + push
       └─ Cloudflare Pages Git 整合 → npm ci && npm run build → 部署
              └─ MapLibre GL JS 6 + OpenFreeMap 底圖(免 key)
                 + Natural Earth 50m 簡化 TopoJSON(~80 KB br)
```

**核心洞見:所有資料 build-time 靜態化,執行期零上游呼叫。** 一次解決:Workers 100k/天配額、Workers 10ms CPU、HDX S3 無 CORS、IDMC 302 無 CORS、ReliefWeb 1000 次/天。**Phase 1 不需要 Workers 與 D1。**

**資料 commit 進 git(而非 wrangler 直傳)的理由**:
1. git 歷史 = 資料審計軌跡(`git log -- public/data/v1/country/SYR.json` 回答「這數字在 X 日的快照是多少」)
2. 免管理會過期外洩的 API token
3. Pages Git 整合自帶 preview + rollback
4. UNHCR 年度資料一年只更新 2 次 → 多數日子 diff 為空 → 不 commit → 不觸發 build。預估每年 commit < 60 次,repo 五年 < 200 MB

**平台額度(實測確認)**:

| 平台 | 免費額度 | 本專案用量 |
|---|---|---|
| Cloudflare Pages | 500 builds/月;**單檔 25 MiB**;20,000 檔/站;靜態資產請求與頻寬**免費無限** | <10 builds/月;最大檔 12.5 MB;~1,150 檔 |
| GitHub Actions | **public repo 免費無分鐘上限** | 每日 ETL ~5 分鐘 |
| Cloudflare Workers/D1 | (Phase 1 不用) | — |

---

# 5. 技術棧

> 版本為 2026-08-19 npm registry 實測。安裝時鎖定這些版本,`package-lock.json` 必須 commit。

| 層 | 套件 | 版本 | 理由摘要 |
|---|---|---|---|
| Meta framework | `astro`(`output:'static'`) | 7.2.3 | 國家頁是真靜態 HTML(可引用、Google Dataset Search 可收錄);islands 隔離地圖與圖表 JS;內建 i18n routing |
| UI islands | `svelte` + `@astrojs/svelte` | 5.56.9 / 9.0.1 | MapLibre 是命令式長生命週期物件,React StrictMode 雙掛載 + useEffect 依賴陣列是系統性坑;Svelte 5 runes 免狀態管理套件;runtime 10 KB vs React 45 KB |
| 語言 | `typescript` | **5.9.3**(非 7.x) | svelte-check / @astrojs/check 對 TS 7 成熟度落後。工具鏈相容性 > 編譯速度 |
| 地圖 | `maplibre-gl` | **6.4.1**(非 5.x) | v5 線終將停止安全修補;WebGL2 涵蓋率 97–98%。**必須加 capability check + 表格 fallback**(§8.4)。ESM-only 對 Vite 無影響(exports 含 `./dist/*`,CSS 可正常 import) |
| 底圖 | OpenFreeMap `positron` | — | 免 key、無 request 上限、允許商業、CORS `*`。⚠️ 單一開發者無 SLA → **style URL 抽成環境變數 `PUBLIC_MAP_STYLE_URL`** |
| 國界 | `world-atlas` + `mapshaper`(devDep) | 2.0.2 / 0.7.53 | Natural Earth 公有領域。用 **50m**(110m 下黎巴嫩/約旦等關鍵收容國失真) |
| 圖表 | `@observablehq/plot` | 0.6.17 | 宣告式;輸出 SVG(記者可直接另存);D3 團隊維護 |
| Topo | `topojson-client` | 3.1.0 | 前端 TopoJSON→GeoJSON |
| 驗證 | `zod` | 4.4.3 | 僅 ETL 與 URL 解析 |
| 國碼 | `i18n-iso-countries`(devDep) | 7.14.0 | M49 numeric → alpha3(build time) |
| 測試 | `vitest` / `@playwright/test` | 4.1.11 / 1.62.1 | |
| 格式化 | `prettier` + `prettier-plugin-svelte` | 3.9.6 | **不用 ESLint**(TS strict 已抓大部分;ESLint 生態 = 3 個高頻改版依賴,邊際價值低) |

**執行期依賴共 6 個**:astro、svelte、@astrojs/svelte、maplibre-gl、topojson-client、@observablehq/plot(+zod)。

**其他技術決定**:
- **ETL 用 TypeScript 但零建置**:Node 22.22.2 原生 type stripping(實測 `node t.ts` 直接可跑)。限制:不可用 `enum`/`namespace`,相對匯入寫完整副檔名 `./codes.ts`
- **狀態管理零套件**:單一 `src/lib/state.svelte.ts` 匯出 `$state` 物件,所有面板共享
- **i18n 零套件**:Astro 內建 routing(`defaultLocale:'en'`,`locales:['en','zh-Hant']`,`prefixDefaultLocale:false`)+ JSON 字典(以 en.json 的 key 型別約束 zh-Hant.json → 缺翻譯編譯失敗)+ 國名用 `Intl.DisplayNames`(iso2 來自 UNHCR `/countries/`)
- **逃生路徑**:所有業務邏輯(url codec、citation、colors、csv、columnar)是**框架無關純函式**放 `src/lib/`,100% 單元測試。換框架只需重寫 `src/components/`

---

# 6. 專案目錄結構

```
D:\Daily\
├─ .github/workflows/
│  ├─ etl-daily.yml          每日 03:17 UTC ETL;失敗對 pinned issue #1 留言(→email)
│  ├─ ci.yml                 PR: check → test → validate:data → build → 檔數/大小 gate → e2e
│  └─ upstream-health.yml    每日 curl 上游;連 3 天失敗才開 issue
├─ .nvmrc                    22.22.2
├─ .gitattributes            * text=auto eol=lf        ← 必須,見 §3.7
├─ package.json              engines.node ">=22.12.0"
├─ astro.config.mjs          site / i18n / svelte()
├─ LICENSE                   All rights reserved
├─ DATA-LICENSE.md           CC BY 4.0 傳遞條款說明
│
├─ docs/
│  ├─ RUNBOOK.md             ★ 非工程語言:「收到 ETL 告警信怎麼辦」逐步指引
│  ├─ ARCHITECTURE.md        每個決策的「理由」— AI 長期維護不失憶的關鍵
│  ├─ DATA-DICTIONARY.md     每個 metric 的定義/單位/caveats/來源
│  └─ data-verification.md   人工對帳紀錄
│
├─ scripts/etl/              全部 node 直接執行 .ts(零建置)
│  ├─ run.ts                 orchestrator → .etl-staging/
│  ├─ validate.ts            zod + 18 條不變量 + golden numbers + 大小 gate
│  ├─ promote.ts             staging → public/data/v1(逐 source 原子替換)
│  ├─ config.ts              所有端點 URL/年份範圍/閾值/限流參數(集中+註解)
│  ├─ sources/
│  │  ├─ unhcr-countries.ts  unhcr-population.ts  unhcr-demographics.ts
│  │  ├─ unhcr-idmc.ts       unhcr-solutions.ts   unhcr-nowcasting.ts
│  │  ├─ wpp-population.ts   (WPP CSV 下載+裁切,人均分母)
│  │  └─ idmc-idu.ts         (Helix API,近即時)
│  ├─ lib/
│  │  ├─ codes.ts            ★★ ISO3 正規化;禁用 coo/coa;overrides;碰撞偵測
│  │  ├─ columnar.ts         欄式+zero-run codec(與 src/lib/columnar.ts 同一份)
│  │  ├─ http.ts             fetch+逾時60s+退避5次+併發2+300ms 間隔+UA
│  │  ├─ paginate.ts         limit=1 探 maxPages → limit=10000 逐頁
│  │  ├─ toNum.ts            "-"→null / "0"→0 / number→number
│  │  ├─ csv.ts              RFC 4180
│  │  ├─ provenance.ts       sources.json(data_as_of/retrieved_at/hash)
│  │  └─ atomic.ts
│  └─ geo/
│     ├─ build-geo.ts        world-atlas 50m → mapshaper → TopoJSON+質心+bbox
│     └─ overrides.json      NE id=-99 與爭議地區手動對照(§11.3)
│
├─ public/
│  ├─ _headers               data/v1 immutable 快取;CSP
│  └─ data/v1/               ETL 產出,進 git
│     ├─ manifest.json       檔案清單+sha256+大小+snapshot_id
│     ├─ sources.json        ★ 來源/授權/data_as_of/retrieved_at/status(stale 標記)
│     ├─ metrics.json        metric 定義+caveats+source_id
│     ├─ countries.json      232 國:iso3/iso2/名稱(含覆寫)/區域/質心/bbox
│     ├─ datapackage.json    Frictionless Data 描述檔
│     ├─ geo/world-50m.topo.json + disputed-notes.json
│     ├─ stock/2015-2025.json(首屏)+ 1951-2014.json(idle 預取)
│     ├─ country/{ISO3}.json × 232
│     ├─ live/idu-latest.json + nowcast.json
│     ├─ flows/{year}.json          (Phase 2)
│     └─ downloads/*.csv
│
├─ src/
│  ├─ pages/                 index / country/[iso] / compare / methodology / data
│  │                         about/{index,boundaries} / stories / 404 / zh-Hant/* / sitemap.xml.ts
│  ├─ layouts/               BaseLayout(meta/JSON-LD/skip-link)/ MapLayout(100dvh)
│  ├─ components/
│  │  ├─ map/    MapApp(★唯一根島,client:only="svelte")/ MapCanvas / NoWebGLFallback
│  │  │          TopBar / FilterRail / RankList / DataTable / DetailPanel
│  │  │          CompareTray / Timeline / Legend / AttributionBar
│  │  ├─ charts/ TimeSeries / AgeSexPyramid / TopFlowsBar    (client:visible)
│  │  ├─ data/   SourceNote(★每張圖強制)/ CitationDialog / DownloadButton / CaveatBadge
│  │  └─ ui/     Panel / Toast / CommandPalette / ShareDialog
│  ├─ lib/                   ★ 框架無關純函式,100% 單元測試
│  │  ├─ state.svelte.ts     url.ts        data.ts       columnar.ts
│  │  ├─ citation.ts         csv-client.ts colors.ts     format.ts
│  │  ├─ map-style.ts        webgl.ts
│  ├─ i18n/  en.json  zh-Hant.json  ui.ts
│  └─ styles/  tokens.css  global.css
│
└─ tests/
   ├─ unit/  codes / columnar / url / citation / colors / toNum
   └─ e2e/   share-link ★ / download / citation / no-webgl / no-basemap / a11y / i18n / perf
```

**package.json scripts**:

```
dev / build / preview        astro
check                        astro check && tsc --noEmit
test / test:e2e              vitest run / playwright test
etl                          node scripts/etl/run.ts --out .etl-staging
etl:validate                 node scripts/etl/validate.ts --in .etl-staging
etl:promote                  node scripts/etl/promote.ts
geo                          node scripts/etl/geo/build-geo.ts
validate:data                node scripts/etl/validate.ts --in public/data/v1
```

---

# 7. ETL Pipeline 規格

## 7.1 限流參數(`config.ts`)

```
concurrency: 2 │ minIntervalMs: 300 │ timeoutMs: 60_000(實測單頁需 7.5s)
retries: 5(指數退避 1→2→4→8→16s + jitter)│ retryOn: 429, 5xx, 網路錯誤
pageLimit: 10000(實測可用,無 100 上限)
userAgent: "WhereTheyWent/1.0 (+https://<site>; <contact-email>)"
```

每日對 UNHCR 總請求數 ~45–100 次(雙邊矩陣 138,893 列只需 14 頁)。

## 7.2 分頁協定

先發 `limit=1` 取 `maxPages`(= 總列數)→ 算頁數 → 逐頁抓。**每頁重新確認 `maxPages`**,中途變動(上游正在發布)→ 該 source 標 `unstable`,沿用上次快照。

## 7.3 年份上界自動偵測(不可寫死)

```
1. GET /years/ → 取最大年份 Y
2. GET /population/?year=Y&coa_all=true&limit=1 → maxPages > 0 ?
3. 若 = 0(2026 實測如此)→ Y-1,重複步驟 2
```
→ 2027 年 UNHCR 發布 2026 資料時,網站自動跟上,零人工介入。

## 7.4 各 source 抓取參數

| Source | 參數 | 頁數 |
|---|---|---|
| countries | `/countries/?limit=250` | 1 |
| population(收容國) | `yearFrom=1951&yearTo=<max>&coa_all=true&cf_type=ISO&limit=10000` | 1(7,802 列) |
| population(來源國) | 同上 `coo_all=true` | 1(7,673 列) |
| population(雙邊) | `coo_all=true&coa_all=true` | 14(138,893 列) |
| demographics | 逐年 2010–max `coa_all=true` | ~16 |
| idmc | `/idmc/?yearFrom=2009&coo_all=true` | 1(915 列) |
| solutions | `yearFrom=2000&coo_all&coa_all` | ~3 |
| asylum-applications | `yearFrom=2015&coo_all&coa_all`(**過濾 `app_pc`,只留一種**) | ~8 |
| nowcasting | `/nowcasting/?coa_all=true&limit=1000` | 1(169 列) |
| wpp | WPP CSV(附錄 A.4)→ 裁成 iso3×year×population ~200 列 | 1 檔 |
| idmc-idu | Helix API(附錄 A.5) | 1 檔 606 KB |

## 7.5 輸出檔案與大小預算

| 檔案 | 原始 | Brotli | 載入時機 |
|---|---|---|---|
| manifest + sources + metrics | 26 KB | 6.5 KB | 首屏 |
| countries.json | 55 KB | 14 KB | 首屏 |
| geo/world-50m.topo.json | ~220 KB | **~80 KB** | 首屏 |
| stock/2015-2025.json | ~200 KB | **~45 KB** | 首屏 |
| stock/1951-2014.json | ~580 KB | 125 KB | idle 預取 |
| country/{ISO3}.json ×232 | 計 ~5 MB | 3–12 KB each | 按需 |
| live/idu-latest.json | ~600 KB → 裁後 ~100 KB | | 按需(地圖事件層) |
| downloads/unhcr-population-all-years.csv | **~12.5 MB** | — | 按需 |

**首屏資料 ≈145 KB br;JS ≤320 KB br;LCP 目標 <2.0s。**
**硬 gate(validate.ts)**:每檔 <20 MiB;總檔數 <5,000。

## 7.6 欄式編碼(`columnar.ts`,前後端同一份原始碼)

```jsonc
{
  "schema": 1, "snapshot": "2026-08-19T03:17:02Z",
  "years": [2015, ..., 2025],
  "metrics": ["refugees","asylum_seekers","idps","stateless","ooc","returned_refugees","returned_idps","oip"],
  "asylum": { "SYR": { "v": [[...11 個 int|null],[...]] }, ... },
  "origin": { ... }
}
```
- 整數;`null` = 未報告(源自 `"-"`),與 `0` 嚴格區分
- 連續 ≥4 個 0 壓成 `["z",n]`(zero-run,歷史年份可再省 30–40%)
- round-trip 由 vitest 保證

## 7.7 ISO3 正規化階梯(`codes.ts`)

```
1. 只讀 coo_iso/coa_iso(coo/coa parse 時 delete)
2. 對 countries.json 建 Map
3. 未匹配 → 查 overrides(CRB/CUR/UNK/SGS/XKX/TIB/XXA)
4. 仍未匹配且任一 metric > 10,000 → 整個 source FAIL(拒絕靜默丟資料)
5. 仍未匹配且 < 10,000 → 併入 "OTH" 桶,記入 unmatched-report.json
```

## 7.8 失敗處理(promote 粒度 = source,非整批)

```
某 source fetch 或 validate 失敗:
  → 不動 public/data/v1 中該 source 的檔案(保留上次快照)
  → sources.json[source] = { status:"stale", stale_since, last_error, last_success 不變 }
  → 連續失敗 > 3 天 → workflow 標 failure → 對 pinned issue #1 留言(委託人訂閱→email)
成功:原子替換 + status:"ok"
```
UI:任一 stale → TopBar 琥珀色 chip「部分資料更新延遲(自 X 日)」可展開。**網站永不因上游掛掉而空白**。

## 7.9 三個時間概念(嚴格區分,專業受眾最在意)

| 欄位 | 意義 | 例 |
|---|---|---|
| `data_as_of` | 上游資料涵蓋到哪天(年末資料 = `{Y}-12-31`) | `2025-12-31` |
| `retrieved_at` | 我們何時抓的(**只在內容 hash 改變時更新**,否則每日 commit 不會為空) | `2026-08-19T03:17Z` |
| `snapshot_id` | git commit 短 hash | `a1b2c3d` |

資料檔 fetch URL 加 `?v=<sha256 前 8 碼>` + `_headers` 設 immutable → 永久快取 + 立即更新。

---

# 8. 前端規格

## 8.1 首屏載入時序

```
t=0     HTML(~9 KB br)。TopBar/Legend/Timeline/FilterRail 骨架為純 HTML+CSS,立即可見
        <head>: preconnect tiles.openfreemap.org;preload manifest.json;critical CSS 內聯
t≈50ms  manifest → 並行 4 請求(countries/stock/geo/sources+metrics)
        MapApp 島同時動態 import maplibre-gl(~230 KB br)
t≈400ms 底圖 tiles 繪製
t≈600ms geo+stock 到齊 → topojson→GeoJSON(~20ms)→ choropleth → LCP
t≈idle  requestIdleCallback 預取 1951-2014.json → 時間軸解鎖全歷史
```

## 8.2 關鍵效能決定

1. **骨架先於 JS**:版型外框在 `.astro` 純 HTML 輸出,Svelte 島「接管」既有 DOM
2. **時間軸拖曳零網路**:11 年資料已在記憶體;地圖更新用 `map.setFeatureState()` **而非** `setData()`(不重解析幾何,232 國 ~2–3ms,60fps 年份動畫可行)← **本設計最重要的效能決定**
3. **底圖是裝飾層**:choropleth 用自有 TopoJSON。OpenFreeMap 4 秒逾時 → 自動降級「無底圖模式」(純色背景+自有國界+標籤),核心資訊 100% 可用

## 8.3 版型(地圖滿版 + 浮動面板)

```
外層 .overlays { pointer-events: none }   ← 面板間空隙可直接拖地圖
每個面板     { pointer-events: auto }
fitBounds 一律帶 padding{top:56, left:railWidth+16, right:panelWidth+16, bottom:112}
→ 選中國家永遠在可見區域視覺中心,不被面板遮住
```

**化解「專業篩選 vs 沉浸式版型」的五個機制**:

| # | 機制 | 解決的痛點 |
|---|---|---|
| 1 | **FilterRail 下半部永遠是 Top-20 排行榜**,篩選即時重排 | 「地圖上看不出第 7 名和第 8 名誰大」— 排行給精確數字,地圖給空間分布,同面板同時可見 |
| 2 | **按 `T` 展開密集表格**(左滑 60% 寬,地圖右 40% 同步高亮;232 列全 metric 可排序可選欄可下載當前檢視) | 完整表格在一鍵之內,預設仍沉浸。開合狀態進 URL(`t=1`) |
| 3 | **深度分析升級為獨立路由**(`/country/[iso]`、`/compare`:文件式版型、可捲動列印、有 SEO) | 首頁保持沉浸 |
| 4 | **鍵盤優先**:`/`搜尋、`T`表格、`←/→`年份、`Space`播放、`C`比較、`D`下載、**`Esc`收合全部面板=簡報模式**(記者乾淨截圖) | 專業使用者用鍵盤 |
| 5 | **面板狀態全進 URL** | 工作版型可貼給同事,「沉浸 vs 專業」變成每人自己的預設值 |

## 8.4 WebGL2 fallback(MapLibre v6 強制 WebGL2)

```
canvas.getContext('webgl2') === null 時:
  1. 不動態 import maplibre-gl(230 KB 根本不下載)
  2. 渲染 <NoWebGLFallback>:DataTable + TimeSeries + 下載按鈕
  3. 提示「瀏覽器不支援 WebGL2,已切換表格模式」
```
DataTable 本來就是必做元件 → fallback 幾乎零成本,同時解決無障礙與爬蟲。

## 8.5 按需載入

- 點國家 / hover 500ms prefetch → `country/{ISO3}.json`(in-flight 去重 + LRU 30 國)
- `/country/[iso]` 靜態頁:該國資料 **build 時內聯進 HTML**(`<script type="application/json">`),首屏零請求
- 無資料的呈現:**「無資料」灰**(tooltip「無報告資料」)與「數值 0」(色階最淺端)顏色明確不同

## 8.6 無障礙(WCAG 2.2 AA)

DataTable 是 choropleth 的完整非視覺等價物;年份變更 `aria-live="polite"`;面板 Tab 可進出 + focus trap;單色階色盲安全;對比度達標;`prefers-reduced-motion` 停用自動播放。axe 掃描零 critical/serious 為 CI gate。

---

# 9. URL 狀態 Schema

| 參數 | 值域 | 預設(不寫進 URL) |
|---|---|---|
| `y` | 1951–maxYear | maxYear |
| `m` | `refugees`\|`asylum_seekers`\|`idps`\|`stateless`\|`ooc`\|`returned_refugees`\|`returned_idps`\|`total_poc` | `refugees` |
| `v` | `asylum`\|`origin` | `asylum` |
| `n` | `abs`\|`per1k` | `abs` |
| `sc` | `lin`\|`log`\|`quant` | `quant` |
| `c` | ISO3(選中國) | — |
| `cmp` | ISO3 逗號串 ≤3 | — |
| `r` | 區域 slug 逗號串 | — |
| `min` | int 門檻 | 0 |
| `map` | `z/lat/lon`(2 位小數) | fitWorld |
| `p` | `open`\|`closed`(左軌) | `open` |
| `t` | `1`(表格) | — |
| `tab` | `overview`\|`series`\|`demographics`\|`flows`\|`sources` | `overview` |
| `f` | `1`(Phase 2 流向) | — |
| 語言 | 路徑前綴 `/zh-Hant/`,**不用 query param** | |

**Codec 規則**(`src/lib/url.ts` 純函式):
1. 省略預設值(典型連結 40–90 字元)
2. **穩定排序**(同一狀態 → 位元組相同的 URL;可當快取 key、e2e 精確比對)
3. 連續型變更(平移/時間軸/滑桿)→ `replaceState` + 300ms debounce;離散型(選國/換 metric/開表格)→ `pushState`
4. zod 解析,每參數 `.catch(default)` → 壞參數回退預設 + Toast 提示,不崩潰
5. `popstate` 監聽,用 `isApplyingFromUrl` 旗標防迴圈
6. 正規化:`cmp` 去重排序截 3;`c` 不在 `cmp` 則加入;ISO3 大寫且存在於 countries.json

---

# 10. 引用與來源標註機制

## 10.1 鏈路

```
UNHCR API → provenance.ts → sources.json / metrics.json / 每檔 source_ids
  → src/lib/citation.ts(純函式)
  → <SourceNote>(每張圖下方強制)/ <CitationDialog> / CSV 欄 / JSON meta / JSON-LD
```

## 10.2 sources.json 條目結構

```jsonc
{
  "unhcr_population": {
    "publisher": "UNHCR",
    "title": "Refugee Population Statistics Database",
    "landing_page": "https://www.unhcr.org/refugee-statistics/",
    "license": { "id": "CC-BY-4.0", "url": "https://creativecommons.org/licenses/by/4.0/" },
    "attribution": "UNHCR Refugee Population Statistics Database",   // 官方要求的標註字串
    "data_as_of": "2025-12-31", "period_type": "year-end",
    "retrieved_at": "2026-08-19T03:17:02Z",
    "coverage": { "year_min": 1951, "year_max": 2025 },
    "content_hash": "sha256:…", "status": "ok",
    "caveats": [
      "不含 UNRWA 登記之巴勒斯坦難民(約 600 萬),UNRWA 另有獨立統計。",
      "IDP 數字來源為 IDMC。",
      "\"-\" 表示未報告,與 0(確實為零)意義不同。"
    ]
  }
}
```

## 10.3 四種引用格式(可測純函式,en + zh-Hant 兩套模板)

APA 7 / Chicago author-date / BibTeX / 引用本頁。範例(引用本頁):
```
Where They Went. "Syria — internally displaced persons, 1951–2025."
Data: UNHCR Refugee Population Statistics Database (data as of 31 December 2025;
retrieved 19 August 2026). https://…/country/SYR/?y=2016&m=idps [accessed 19 August 2026].
```

## 10.4 CSV 規格

**預設嚴格 RFC 4180,不加 `#` 註解行**(pandas/R/Excel 預設解析會炸)。provenance 以資料欄攜帶:
```csv
iso3,country_name,year,metric,value,unit,source_id,source_attribution,data_as_of,retrieved_at,snapshot_id
```
下載對話框有 checkbox「加入 `#` 註解行」,選擇存 localStorage。JSON 下載帶完整 meta(含 permalink + 四種引用字串)。

## 10.5 UNHCR `/footnotes/` 整合(免費得到的註腳系統)

官方明文:footnotes 端點**接受與其他端點完全相同的 query 參數**,回傳該查詢對應的所有註腳。
→ ETL 對每組 population 查詢同步抓 footnotes,依 `(coa_iso, year, population_type)` 掛到 tooltip 與詳情卡。⚠️ 其 `year` 是字串。

## 10.6 機器可讀

- 每個國家頁內嵌 schema.org **`Dataset` JSON-LD**(name/creator/license/temporalCoverage/distribution→CSV)→ Google Dataset Search 收錄
- `datapackage.json` 遵循 Frictionless Data Table Schema

---

# 11. 邊界、台灣與爭議地區處理

## 11.1 邊界資料的最終決定(含被推翻的選項)

| 選項 | 判定 |
|---|---|
| **Natural Earth 50m(world-atlas)** ✅ | **Phase 1 採用**。公有領域(官方原文「No permission is needed… Crediting the authors is unnecessary」明含商業使用);739 KB 經 mapshaper 簡化至 ~220 KB / ~80 KB br;台灣為獨立 feature |
| HDX `cod-ab-global` 🔴 | **實測後永久排除**:官方 notes 為「admin level **1–4**」——**根本沒有 admin0 國界圖層**;僅涵蓋 111 國;檔案 995 MiB–1.19 GiB File Geodatabase。缺的是圖層不是解析度,無工具鏈可救 |
| UNmap ArcGIS FeatureServer ⚠️ | Phase 2 「邊界集切換」候選。291 features 一次可取,`maxAllowableOffset=0.01` 為 7 MB(gzip 2.3 MB),可再 TopoJSON 化。**授權灰區**(licenseInfo 寫 "for the Secretariat of the United Nations",非開放授權;資料停在 2019) |
| FieldMaps `global-international-boundaries-usgs` ⚠️ | Phase 2 授權乾淨的替代(Public Domain/CC0,採 UN Clear Map 爭議地區表述),但需下載 357 MB GDB 用 GDAL 轉檔 |
| UN Clear Map 光柵底圖 ✅ | 可作 Phase 2 選用底圖:`https://geoservices.un.org/arcgis/rest/services/ClearMap_{WebGray|WebTopo|WebPlain|WebDark}/MapServer` 實測 200、CORS ✅、免 token(注意:無 `_Web` 前綴的 `ClearMap/MapServer` 需 token) |

**mapshaper 簡化指令(build-geo.ts 內)**:
```bash
npx mapshaper input.json \
  -simplify visvalingam weighted 4% keep-shapes \
  -filter-islands min-area 5km2 -clean \
  -o format=topojson quantization=1e4 world-50m.topo.json
```
⚠️ 輸出大小(預估 ~220 KB)需首次實跑確認,validate.ts gate 設 <280 KB。

## 11.2 Join key 策略

```
規範 key = ISO 3166-1 alpha-3
UNHCR 側:只讀 *_iso(§3.1)
Natural Earth 側:feature.id 是 M49 numeric → i18n-iso-countries 轉 alpha3(build time)
              約 10–15 個 id="-99" feature → geo/overrides.json 以 name 對照
```

## 11.3 geo/overrides.json 必要條目

| NE name / 情況 | ISO3 | 處理 |
|---|---|---|
| Kosovo(id=-99) | `XKX` | UNHCR 資料在 SRB 下,顯示名覆寫(見下) |
| W. Sahara | `ESH` | UNHCR 有 ESH 資料 |
| Palestine | `PSE` | 附 UNRWA caveat |
| Taiwan | `TWN` | **見 §11.5,需委託人決策** |
| Northern Cyprus(id=-99) | `_NCY` | 底線前綴 = 只畫邊界不上色 |
| Somaliland(id=-99) | `_SOL` | 同上 |
| Fr. S. Antarctic Lands 等 | `null` | 從幾何剔除 |

**顯示名覆寫表**(`countries.json` 的 `display_name` 欄):
- UNHCR `"Serbia and Kosovo: S/RES/1244 (1999)"` → 顯示 `Serbia`(Kosovo 另列)
- WPP `"China, Taiwan Province of China"` → 顯示 `Taiwan`(en)/ `台灣`(zh-Hant)——**待委託人確認**

## 11.4 對不上時的處理階梯 + 核心不變量

```
UNHCR 有資料但地圖無 feature:
  → 不上色,但必定出現在排行榜/表格/下載檔
  → Legend 顯示「n 國有資料但無法在地圖上顯示」chip(可點開清單)
  → 該筆 > 10,000 人 → validate.ts FAIL

★ 核心不變量(validate.ts 斷言 + Legend 下方顯示):
   地圖上色總和 + 無法顯示總和 == 全球總計
```

## 11.5 🔴 台灣呈現(唯一待委託人決策的設計項)

資料矛盾見 §3.3。三個選項:
- **(a)** 獨立顯示為「無資料」灰,tooltip「UNHCR 未單獨統計」
- **(b)** 併入中國(委託人已傾向否決)
- **(c)** 獨立顯示 + `/about/boundaries` 專段說明資料源涵蓋差異(最完整)

**開發時若尚未取得決策,先實作 (c) 並在 PR 中標註待確認。**

## 11.6 免責聲明(三層)

1. **常駐**:AttributionBar 右下 `Boundaries: Natural Earth ⓘ`
2. **Modal**:中英雙語 UN 標準措辭 + `disputed-notes.json` 逐區說明(西撒哈拉/克什米爾/巴勒斯坦/克里米亞/科索沃/北賽普勒斯/索馬利蘭/台灣)各附「本站呈現方式」與「資料來源如何命名」。UN 官方免責原文(已從 Clear Map metadata 取得,可直接用):
   > The designations employed and the presentation of material on this map do not imply the expression of any opinion whatsoever on the part of the Secretariat of the United Nations concerning the legal status of any country, territory, city or area or of its authorities, or concerning the delimitation of its frontiers or boundaries.
3. **完整頁** `/about/boundaries`:方法、來源比較、為何選 NE、如何回報

**命名策略**:國家名稱優先用**資料來源(UNHCR)原始 `name`**,旁註「依 UNHCR 命名」,把命名爭議歸屬於被引用的權威來源(覆寫表除外)。

---

# 12. 分批交付計畫

| 批次 | 內容 | 驗收(委託人看得到的) |
|---|---|---|
| **① 骨架** | git init、Astro+Svelte+i18n、版型骨架、`.gitattributes`/`.nvmrc` | `npm run dev` 顯示版型外框 + 語言切換 |
| **② ETL** | `codes.ts`(碰撞防護)、幾何管線、population source、columnar codec、validate、promote | `npm run etl` 產出 JSON;golden numbers 對上 UNHCR 官方公布值;三組碰撞測試綠 |
| **③ 地圖核心** | MapApp/MapCanvas/色階/Legend/Timeline/FilterRail/RankList/TopBar、URL codec | **第一次看到真地圖**:拖時間軸 60fps 零網路、切 metric/視角、貼連結可重現 |
| **④ 詳情與下載** | demographics/idmc/solutions sources、country JSON、DetailPanel+圖表、國家靜態頁、比較頁、citation、CSV/JSON 下載 | 點國家看完整資料;CSV 用 Excel 開;引用可複製 |
| **⑤ 合規與韌性** | DataTable、快捷鍵、WCAG AA、邊界免責、about/methodology/data 頁、WebGL fallback、底圖降級、WPP 人均、nowcast 卡片、IDMC IDU | 鍵盤全操作;關 WebGL 仍可用;axe 零 critical |
| **⑥ 部署與文件** | 3 個 workflows(actions pin SHA)、Cloudflare Pages、e2e 套件、RUNBOOK/ARCHITECTURE/DATA-DICTIONARY | **上線**;`workflow_dispatch` 跑通 ETL;無變更不 commit;收到第一封健康通知 |

每批可獨立部署 Pages preview。委託人可在任一批後喊停或轉向。

---

# 13. 驗證與測試規格

## 13.1 本機端到端

```
npm ci && npm run geo && npm run etl && npm run etl:validate && npm run etl:promote
npm run check && npm test && npm run build && npm run preview && npm run test:e2e
```

## 13.2 validate.ts 的 18 條不變量(任一失敗 = 該 source 不 promote)

1. countries 為 232 筆(±5)
2. **每個 ISO3 不得命中 UNHCR 內部碼黑名單(AUS→AUT / ARE→EGY / MAR→MTQ 三組 golden case)**
3. 最大年份 ≥ 上次快照(資料不倒退)
4. 各 metric 全球年度總和 vs 上次快照變化 <20%(除非新增年份)
5. **地圖可上色總和 + 無法顯示總和 == 全球總計**
6. 無 NaN/Infinity/負數
7. **`null` 與 `0` 在 codec round-trip 後仍可區分**
8. 每檔 <20 MiB;總檔數 <5,000
9. 每 source 有 license + attribution
10. 每個 country JSON 的 ISO3 存在於 countries.json 與幾何(或 override 白名單)
11. unmatched-report 無 >10,000 人項目
12. manifest sha256 與實際檔案相符
13. **Golden numbers:硬編碼已公開查證的錨點(2024 全球難民數、2024 土耳其收容數、2016 敘利亞 IDP 數),誤差 >1% FAIL** ← 抓「上游改口徑」最有效手段
14. geo feature 數在預期範圍且都有 id
15. 每 metric 在 metrics.json 有 definition + source_id
16. **雙邊矩陣與邊際總計一致:`flows/{year}` 逐來源國加總 = 該國 origin 邊際、逐庇護國加總 = 該國 asylum 邊際(refugees 與 asylum_seekers,2015+)。容差 max(1,000 人, 0.5%)——2026-08-27 實測全部 8,344 格完全相等,容差僅為上游遮蔽行為改變時的緩衝,見 docs/data-verification.md**
17. **「每 N 人中有 1 人被迫流離失所」的分子不得含非流離失所類別**:該句一律由 `FORCED_DISPLACEMENT_COMPONENTS`(難民 + 庇護申請者 + IDP + OIP)計算,不得用 `total_poc`——後者另含無國籍者(按居住國計)與其他受關注者,兩者合計約占 6%。2026-09-05 之前曾誤用 total_poc,數字高估約 6%,此不變量即為防止復發而設。
18. **指標的可用視角必須與 metrics.json 一致,且來源國總計不得含居住國指標**:`METRIC_VIEWS`(選單、URL 解碼、衍生加總共用的唯一規則)與 metrics.json 的 `views` 逐項相符;`total_poc` 在 origin 視角下不得含 `stateless`。2026-09-05 之前 `views` 無任何消費端,`?m=stateless&v=origin` 會把居住國數字置於來源國標題下。

## 13.3 人工對帳(自動化做不到的一層)

`docs/data-verification.md`:重大變更時,人工在 unhcr.org/refugee-statistics 查 5 國 × 3 年比對記錄。唯一能抓「對 API 語意理解錯誤」的方法。

## 13.4 e2e 套件(Playwright)

| spec | 斷言 |
|---|---|
| **share-link** ★ | 一連串操作 → 取 URL → **全新 context**(空快取)載入 → legend/年份/國名/表格開合/map center-zoom(±0.01)全同 |
| download | 攔截下載 → 解析 CSV → header 含 data_as_of;列數與數值與畫面一致 |
| citation | 四種格式含 UNHCR、正確 data_as_of、permalink |
| no-webgl | 覆寫 getContext → 表格 fallback 渲染,**maplibre chunk 未下載**(查 network) |
| no-basemap | abort tiles → choropleth 仍正確 |
| a11y | axe 掃三頁,零 critical/serious |
| i18n | `/zh-Hant/` DOM 無未翻譯 key |
| perf | 4G throttle LCP <2.5s;JS transfer <400 KB |

## 13.5 CI gate(PR 必過)

`npm ci → check → test → validate:data → build → 檔數/大小 gate → test:e2e`

---

# 14. 風險登記簿

| # | 風險 | 率 | impact | 緩解 |
|---|---|---|---|---|
| 1 | **UNHCR 內部碼碰撞** | 已存在 | 極高 | §3.1 鐵則 + golden case 測試 |
| 2 | UNHCR API 停機/改版 | 中 | 高 | 逐 source promote + stale 標示 + raw 存 Actions artifact 90 天 + golden numbers |
| 3 | OpenFreeMap 停止服務 | 中 | 中 | 底圖=裝飾層;4s timeout 降級;style URL 環境變數;備援 Protomaps→自架 PMTiles |
| 4 | **資料誤讀**(不含 UNRWA / 年末 vs 年中 / `-` vs 0) | 高 | 高 | metric caveats 強制顯示(CaveatBadge);DATA-DICTIONARY |
| 5 | **AI 維護知識斷層** | 高 | 高 | ARCHITECTURE.md 記理由;config.ts 集中魔術數字;RUNBOOK 非工程語言;actions pin SHA;Renovate 月度彙總 PR |
| 6 | HDX S3 presigned URL | 高 | 中 | build-time + 每次 package_show 取新 URL |
| 7 | IOM DTM license `Other` | 高 | 中 | Phase 1 不用;IDP 走 UNHCR `/idmc/`(CC BY-IGO) |
| 8 | ReliefWeb appname 審核 | 高 | 低 | 架構不相依;第一天送申請 |
| 9 | MapLibre v6 WebGL2 | 低 | 中 | capability check;未通過不下載 |
| 10 | 爭議邊界政治爭議 | 中 | 中 | 三層免責 + 沿用來源命名 + Phase 2 邊界集切換 |
| 11 | Cloudflare 25 MiB/20k 檔 | 低 | 高 | validate gate 20 MiB/5,000 檔(現況 12.5 MB/1,150 檔) |
| 12 | 依賴破壞性改版 | 中 | 中 | 鎖版 + 月度 Renovate + 業務邏輯在框架無關 src/lib |
| 13 | Windows CRLF 假 diff | 中 | 中 | `.gitattributes` `* text=auto eol=lf`;ETL 寫 `\n` |

---

# 附錄 A:資料源 API 完整參考

> 全部 2026-08-19 實測。

## A.1 UNHCR Population API ✅(核心)

- Base:`https://api.unhcr.org/population/v1/`
- **免 key、CORS `*`**、`cache-control: no-cache, private`(官方不做 CDN 快取)
- 授權 **CC BY 4.0**,標註字串:`UNHCR Refugee Population Statistics Database`
- ⚠️ 注意區分:UNHCR Operational Data Portal(data.unhcr.org)與 Microdata 是**不同且禁止商用**的條款
- 12 端點:`/population/ /demographics/ /asylum-applications/ /asylum-decisions/ /solutions/ /nowcasting/ /idmc/ /unrwa/ /countries/ /regions/ /years/ /footnotes/`
- `limit` 無 100 上限(10000 實測 OK,7.5s);`download=true` 可出 CSV
- 回傳欄位(population):`year, coo_id, coo_name, coo, coo_iso, coa_id, coa_name, coa, coa_iso, refugees, asylum_seekers, returned_refugees, idps, returned_idps, stateless, ooc, oip, hst`
- **最新完整年份 2025**;rate limit 未公布(保守限流)
- `/demographics/`:性別 × 6 年齡組(0-4/5-11/12-17/18-59/60+/other)×12 欄 + 3 total
- `/solutions/`:returned_refugees / resettlement / naturalisation / returned_idps(1959 起);其 `total` 是物件
- `/asylum-applications/`:測量欄僅 `applied`;維度 procedure_type(G/U)/app_type/dec_level/`app_pc`(C/P,防重複計數)
- `/asylum-decisions/`:dec_recognized/other/rejected/closed/total
- `/idmc/`:年度 IDP 存量(coa 維度,2009 起,915 列)— **年度 IDP 走這裡最省事**
- `/footnotes/`:接受相同 query 參數回註腳;`year` 為字串;無 `total` 欄
- `/nowcasting/`:僅單月快照(2026 June)、僅 coa 維度 169 國、僅 refugees+asylum_seekers、官方定義為推估(「statistical method… to **predict**」);`source` 欄有三種值,UI 直接顯示

## A.2 世界邊界

- `world-atlas@2.0.2`(ISC;底層 Natural Earth 公有領域):`countries-110m` 105 KB / `countries-50m` 739 KB(**採用**)/ `countries-10m` 3.5 MB。feature.id 為 M49 numeric
- UNmap FeatureServer(Phase 2 候選,授權灰區):
  `https://services3.arcgis.com/7J7WB6yJX0pYke9q/arcgis/rest/services/Countries_and_Territories___boundary_areas_and_labels/FeatureServer/0/query?where=1%3D1&outFields=ISO3CD,ROMNAM,MAPLAB,STSCOD,MAPCLR&outSR=4326&f=geojson&resultRecordCount=2000&returnExceededLimitFeatures=true&maxAllowableOffset=0.01&geometryPrecision=5`
  291 features;`STSCOD`(狀態碼:1=會員國/2=PSE/3=屬地/6=TWN·HKG·MAC/99=爭議區 xJK·xAC 等)、`MAPCLR`(強制填色,TWN=CHN)、`MAPLAB` 內嵌 `*`/`***` 註腳
- UN Clear Map 光柵瓦片(免 token、CORS ✅):`https://geoservices.un.org/arcgis/rest/services/ClearMap_WebGray/MapServer`(另有 WebTopo/WebPlain/WebDark;**無 _Web 前綴的需 token**)

## A.3 OpenFreeMap 底圖 ✅

`https://tiles.openfreemap.org/styles/{liberty|positron|dark|bright|3d}` — 免 key、無上限、允許商業、CORS `*`。標註:`© OpenFreeMap © OpenStreetMap contributors`。glyphs/sprites 同域提供。

## A.4 人口分母:UN WPP ✅(主)+ World Bank(備援)

- **主**:`https://population.un.org/wpp/assets/Excel%20Files/1_Indicator%20(Standard)/CSV_FILES/WPP2024_TotalPopulationBySex.csv.gz`(200,16.2 MiB,CC BY 3.0 IGO,涵蓋 TWN/XKX/PSE,237 國 1950–2100)。⚠️ 舊路徑 `/wpp/Download/Files/` 已 404。⚠️ WPP Data Portal API 的 data 端點 401(token 需寄信申請)— 不要用
- **備援**:`https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=500&mrnev=1` — 免 key、CORS `*`、最新 2025、CC BY 4.0。⚠️ **帶 UTF-8 BOM**;**無台灣**;Palestine 名稱是 "West Bank and Gaza";region aggregates 需以 `/country` 的 `region.id=="NA"` 過濾

## A.5 IDMC ✅

- **近即時(IDU)**:`https://helix-tools-api.idmcdb.org/external-api/idus/last-180-days/?client_id=IDMCWSHSOLO009`
  (client_id 為 IDMC 公開發佈;不帶回 403)。200 → 606 KB gzip JSON,4,198 筆 / 97 國 / 延遲 <24h / 每日 02:00 UTC dump。**302 第一跳無 CORS → 只能 build-time**。`standard_popup_text` 含 raw HTML 需 sanitize。定位:preliminary estimates(校正版在 GIDD)
- **年度(GIDD)**:HDX `idmc-internal-displacements-new-displacements-idps` 單一 CSV **41 KB**,欄位 `iso3,country_name,year,new_displacement,total_displacement`,ISO3 直接可 join,CC BY-IGO,2009–2025
- 🔴 HDX 上的 IDU 鏡像(Google Sheets CSV / backend.idmcdb.org)**已全部死亡,勿用**

## A.6 HDX CKAN ✅

`https://data.humdata.org/api/3/action/package_show?id=<slug>` 免 key。資源 URL 302 → S3 presigned(有時效、無 CORS)→ build-time only,每次重取。

## A.7 ReliefWeb ⚠️(Phase 3)

`https://api.reliefweb.int/v2/` — **需已核准 appname**(2025-11-01 起;無 appname→400,自取→403)。申請:Google 表單(apidoc.reliefweb.int/parameters#appname 有連結)。限額 1,000 次/天。**第一天就送申請**。

## A.8 ACLED 🔴 永久排除

免費層(gmail 註冊自動歸 Open)無 API;EULA 禁止 dashboard 直接再發布與非轉化性使用。不納入,不再評估。

## A.9 流動資料量(Phase 2 依據)

2025 單年全配對 ≈6,300 筆 / gzip ≈92 KB;2015–2025 ≈61,260 筆 / gzip ≈0.89 MB。裁 5 欄後單年 30–50 KB。⚠️ 含 0 值列,build 時過濾 `refugees+asylum_seekers==0`。

---

# 附錄 B:捐款機制(導流模式)

**錢不經過本站。**

- 地圖上每個危機區域列出實際在當地運作的組織(UNHCR、MSF、IRC、NRC、DRC…),連到**它們自己的**捐款頁
- 「金流透明」改為呈現各組織公開財報效率評分(Charity Navigator / GiveWell)
- 收益:聯盟分潤 / 贊助 / 未來法人化後的平台費

**理由**:台灣個人不能公開勸募(《公益勸募條例》有罰則);收轉款=資金傳輸中介需牌照;Stripe/PayPal 對此類 KYC 大概率拒絕。

**未來自行收款前置條件(Phase 1–3 都不做)**:法人主體 + 勸募許可 → 金流商業審查 → 中介牌照確認 → 稅務 → 建議先累積可信度再評估。

---

# 附錄 C:待委託人決定/提供事項

## 待決定

| 項目 | 選項 | 何時需要 |
|---|---|---|
| **台灣呈現方式**(§11.5) | (a) 無資料灰 / (c) 獨立+專段說明 ← 開發預設先做 (c) | 批次 ③ 前確認 |
| 台灣顯示名覆寫 | `Taiwan` / `台灣`(覆寫 WPP 的 "China, Taiwan Province of China") | 同上 |

## 待提供

| 項目 | 何時 |
|---|---|
| 專案專用 email(About 頁 + ETL 告警) | 批次 ⑤ 前 |
| GitHub 帳號(repo 設 public) | 批次 ⑥ |
| Cloudflare 帳號 | 批次 ⑥ |
| 網域(可先用 `*.pages.dev`) | 批次 ⑥ 後亦可 |

## 建議前置(不擋開發)

- 送出 ReliefWeb appname 申請(Phase 3 用,審核需時)
- 註冊專案專用 email

## 仍查不到、動工後需實測/人工確認

- UNHCR API rate limit(文件與 header 皆無 → 保守限流即可)
- World Bank API 確切 rate limit(429 機制存在但數字未公布)
- UNHCR nowcasting 的信賴區間(未提供 → UI 只標「估計值」)
- **mapshaper pipeline 實際輸出大小**(預估 ~220 KB,批次 ② 首次實跑確認,gate <280 KB)
- IOM DTM 正式授權(HDX 標 `Other` → Phase 1 不用,故不阻塞)

---

*本規格書由需求訪談(六輪、24 個決策點)與三輪外部技術驗證(全部實測)彙整而成。*
