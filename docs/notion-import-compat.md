# Notion HTML import — feature support checklist

Source: 用户实测 export（149 DB / 53 顶层页 / 5400+ 子页 / 40990 个 .html）按频次抽样 500 张，统计 `class=` 分布得到下表。

图例:
- ✅ 完整支持（render 与 Notion 接近）
- 🟡 部分支持（lossy 或视觉降级）
- ❌ 暂不支持（丢内容 / 显示异常）
- ⏸ Notion 有但你 export 里没出现 → 暂不实现

---

## A. 块级内容 (Block content)

| Notion 特性          | 频次 | 我们做的事                             | 状态 |
|----------------------|------|---------------------------------------|------|
| Paragraph `<p>`      | —    | 直接渲染                              | ✅   |
| Heading h1/h2/h3     | —    | turndown 自动转 `#` `##` `###`        | ✅   |
| Bulleted list        | 2121 | 相邻 `<ul>` 合并 → 紧凑列表           | ✅   |
| Numbered list        | 160  | 同上                                  | ✅   |
| To-do list           | 597  | `<input type=checkbox>` → GFM `- [x]` | ✅   |
| Toggle `<details>`   | —    | `lotion-toggle` 块，live-preview 渲染为可折叠 `<details>` | ✅   |
| Code block + lang    | 184  | ` ```kotlin ` fenced                  | ✅   |
| Simple table         | 457  | 首行升 `<thead>` → markdown 表        | ✅   |
| Blockquote           | —    | turndown 自动 `>`                     | ✅   |
| Divider `<hr>`       | —    | turndown 自动 `---`                   | ✅   |
| Image                | 79   | 剥包裹 link + 路径重写到 attachments  | ✅   |
| TOC nav              | 215  | `lotion-toc` 块，按当前 headings 实时生成目录 | ✅   |
| Indented block       | 632  | 空的删除，非空的 unwrap               | ✅   |
| Column / column-list | 14   | unwrap 后纵向渲染                     | 🟡   |
| Callout              | —    | `<figure.callout>` → `lotion-callout` 块，保留图标/背景并渲染为 callout | ✅   |
| Bookmark             | —    | turndown 默认行为                     | ⏸   |
| Equation (LaTeX)     | —    | `lotion-equation` 块，保留 TeX 并 live-preview 渲染 | ✅   |
| Audio / video embed  | —    | 保留原 `<a>` 链接                     | ⏸   |
| Synced block         | —    | —                                     | ⏸   |
| Button / template    | —    | —                                     | ⏸   |

## B. 文本样式 (Inline formatting)

| 特性                | 频次 | 我们做的事                | 状态 |
|---------------------|------|---------------------------|------|
| Bold `<strong>`     | —    | `**text**`                | ✅   |
| Italic `<em>`       | —    | `_text_`                  | ✅   |
| Strikethrough       | —    | GFM `~~text~~`            | ✅   |
| Inline code         | —    | `` `text` ``              | ✅   |
| Underline           | —    | 保留为 inline `<u>`，live-preview 渲染下划线 | ✅   |
| Highlight 背景色    | 65+  | 支持的 `highlight-*` 颜色 → 安全 `data-lotion-bg`，未知颜色 fallback `<mark>` | ✅   |
| 文本颜色 `block-color-*` | 227+ | inline span / paragraph / heading / quote / list item class → 安全 `data-lotion-color/bg` 并 live-preview 渲染 | 🟡   |

## C. 链接 (Links)

| 链接类型                       | 频次 | 我们做的事                                                          | 状态 |
|--------------------------------|------|---------------------------------------------------------------------|------|
| 外部 URL (http/https)          | —    | `<a>X</a>` (label===href) → 纯 URL；GFM linkify 渲染为可点链接      | ✅   |
| mailto:                        | —    | 原样保留                                                            | ✅   |
| 行内 attachment (img/PDF/video/audio) | — | 路径 → `attachments/<category>/<sha24>-<safe-original-name>.<ext>`，图片/媒体可预览 | ✅   |
| 跨自由页链接                   | —    | 路径 → `databases/system/pages--db_pages/pages/<title>--<id>.md`（自由页也是系统 `pages` DB 的 row） | ✅   |
| 跨 DB-row 链接                 | 大量 | 路径 → `databases/user/<database-title>--db_<id>/pages/<file>.md`     | ✅   |
| Inline DB view                 | 45   | sentinel → `lotion-view` 块（hash 主、title 兜底）                   | ✅   |
| Linked-DB view（无独立 CSV）   | —    | sentinel 携带 title hint，hash 找不到时按 title 解析                 | ✅   |
| 跨页 DB-HTML 链接（数据库索引）| 50+  | phantom-page redirect + `notion-hash:<hash>` fallback；missing empty DB → synthesize 0-row DB | ✅   |
| label 含 `]`（escape `\]`）    | —    | regex `(?:\\.\|[^\]\\])*` 处理转义，live-preview 解码 label escape      | ✅   |
| Notion CDN icon URL            | —    | 删（404 offline）                                                    | ✅   |
| 第三方 oembed / widgets        | —    | Indify source figure → `lotion-iframe`；其他保留 URL                  | 🟡   |

## D. 数据库 (Database)

| 特性                       | 频次 | 我们做的事                                     | 状态 |
|----------------------------|------|------------------------------------------------|------|
| Schema from CSV header     | —    | 列名 + 列顺序                                  | ✅   |
| Row enumeration            | —    | CSV title / property fingerprint 配对 HTML body | ✅   |
| Multi-select with colors   | 700+ | 值 + `schema.fields[].options[].color`         | ✅   |
| Status field + color       | 76   | 值 + `schema.fields[].options[].color`         | ✅   |
| URL field                  | 134  | `url` 字段，保留可打开链接                     | ✅   |
| Date / datetime            | —    | `date` 字段，尽量规范化可解析日期              | ✅   |
| Checkbox                   | —    | `Yes`/`No` 等显示值规范化为 `true`/`false`     | ✅   |
| Person / user              | —    | 静态 `person` 字段，保留显示姓名               | ✅   |
| Last edited / created time | —    | canonical Notion 列映射到系统时间，同时保留原字段值 | ✅   |
| Formula / Rollup           | —    | 计算结果文本                                   | 🟡   |
| Relation                   | —    | 静态 `entity_ref`，可点击但不做动态同步         | 🟡   |
| Filtered view（`_all.csv`）| —    | 优先用 `_all.csv` 全行                         | ✅   |
| Empty title 行             | 1126 | property fingerprint 配对 HTML body            | ✅   |
| 嵌入 DB（标准 page 顶层）  | —    | phantom page 检测后跳过 + icon 转移到 DB schema | ✅   |
| 嵌入 DB（混合内容 page）   | —    | `lotion-view` 块 inline 渲染                    | ✅   |
| 空的 inline DB view        | —    | 无 CSV 时合成 0-row view，保留标题和列头         | ✅   |
| 用户列名跟系统字段撞名     | 51   | rename → "<header> (Notion)" + fieldId 映射     | ✅   |
| Formula 列预计算值         | 大量 | 保留 Notion 给的值（无表达式时不重算）          | ✅   |
| Field type inference       | —    | HTML `property-row` 优先；CSV-only 保守推 URL/checkbox/number/date | ✅   |

## E. 页面元数据 (Page meta)

| 特性                    | 频次 | 我们做的事                              | 状态 |
|-------------------------|------|----------------------------------------|------|
| Page icon (emoji)       | —    | 解析为 `emoji:<glyph>`，写入 page / row / DB icon metadata 并渲染 | ✅   |
| Page icon (image)       | 319  | 路径重写到 attachments，写入 page / row / DB icon metadata 并渲染 | ✅   |
| Cover image             | —    | 解析 `.page-cover-image`，写入 page / row / DB cover metadata，并保留 object-position offset | ✅   |
| `<table class=properties>` 行属性 | 419 | flatten 进 row record               | ✅   |
| Page description        | 498  | 当 body 一部分                          | ✅   |

## F. 已知 lossy 项汇总

1. 复杂块级 `block-color-*` 背景 —— inline 文本颜色、段落 `<p class=block-color-*>`、标题 `<h1..h6 class=block-color-*>`、quote `<blockquote class=block-color-*>` 和 list/todo item `<li class=block-color-*>` 会保留为安全 span 并渲染；更复杂的整块/容器背景色仍未建富文本块颜色 schema。highlight 支持常见 Notion 颜色并有 `<mark>` fallback，select/status/multi-select 选项颜色已进入字段 schema。
2. Person / user 字段 —— 静态 `person` 字段，保留显示姓名；暂不解析用户目录或头像。
3. Rollup —— 退化为静态计算结果文字（不再动态计算）。
4. Relation —— 静态 `entity_ref`，可导航但不维护双向关系或 rollup。

---

## 待修 / 设计限制

1. **少量孤儿链接** —— Notion 导出有时引用一个根本不在 export 里的 hash。若它出现在数据库索引页且同页大多数 sibling 都是 DB，导入器会合成 0-row 空 DB；其他孤儿链接仍降级为 `https://www.notion.so/<hash>`，不保留 URL-encoded 本地路径。

---

## 测试 + audit

- ✅ **`scripts/audit-notion-import.mjs`** —— 跑完 import 后对 149 DBs 做行/列计数对比，flag row explosion (>5×)、row/cell loss、source link loss、body loss，以及 number / URL / select / date / checkbox / entity-ref 等字段异常。
  ```
  node scripts/audit-notion-import.mjs \
    --source .scratch/export-html \
    --imported .scratch/notion-html-test
  ```
- ⏳ **抽样视觉对比** —— 手动驱动 `/tmp/sample-pages.sh` 给 15 个 top-level 页面截屏，目测 vs 原 HTML。每轮新改动后跑一次。
- ✅ **Fixture-based integration test** —— `scripts/test-notion-import-service.mjs` 会跑 `runImport()` against a tiny fixture export，并断言行数、列类型、链接解析、source link 和 audit 回归。

## 详细坑

每个 bug + 修法 shape 见 [notion-import-pitfalls.md](./notion-import-pitfalls.md)。

---

## HTML vs Markdown 导出对比

| 维度                 | HTML export                                  | MD export                                   |
|----------------------|----------------------------------------------|---------------------------------------------|
| Page body            | `<div class="page-body">` + Notion class soup | 原生 markdown + 少量 `<aside>` HTML        |
| Page icon            | `<header><img/span class="icon">` → page / row / DB icon metadata | 开头 icon-only `<aside>` sniff → page / row icon metadata |
| Page properties      | `<table class="properties">` flatten             | ⏸ 不存在（属性只在 CSV 里）                |
| Inline-DB embed      | `<div class="collection-content">` widget       | `[Name](Dir/Name <hash>.csv)` → database view link |
| 跨页 link            | `<a href="…">` rewrite                       | `[Label](…)` markdown link rewrite          |
| 字段颜色             | `<span class="select-value-color-*">`         | select/status/multi-select 写入字段 schema |
| Date / Status field  | `<time>` + class hints                       | 文本                                        |
| Phantom page 检测     | `parsed.isCollectionWrapperOnly` ✅           | 🟡 单链接 CSV wrapper 已跳过；row sub-content 仍待补 |
| DB-row sub-content   | 同 `isUnderAnyDbContent` ✅                   | 🟡 同一逻辑，但 MD nested sub-content 仍可能漏（参 #29） |
| Field type inference | `<tr class="property-row-<TYPE>">` ✅         | 🟡 CSV-only 保守推 URL/checkbox/number/date |
| Top-level page count | 53 ✅                                         | 27,427 ❌（参 [pitfall #29](./notion-import-pitfalls.md#29-md-export-inflates-the-page-count)） |
| Audit 通过率         | 149/149                                      | 一批 NOSRC 错配（参 [pitfall #31](./notion-import-pitfalls.md#31-md-format-audit-reports-false-nosrc-mismatches)） |
| Inline-DB 点击行为   | `lotion-view` 块 → DB 视图 ✅                 | `[](csv)` → DB 视图 ✅                     |

**结论**：HTML 是 lossless source，MD 是 lossy fallback。建议用户优先选 HTML 导出。MD 导出 #29–#32 的修复属于 P2，主要影响场景是用户只有 MD 导出可用时。
