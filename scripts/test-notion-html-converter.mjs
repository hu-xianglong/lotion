#!/usr/bin/env node
import assert from "node:assert/strict";

const {
  hasNotionPageBodyContent,
  notionHtmlBodyTextFingerprint,
  parseNotionHtml,
  parseNotionHtmlBody,
  parseNotionHtmlMetadata
} = await import(
  new URL("../dist-electron/main/services/notion-html-converter.js", import.meta.url)
);
const { normalizeDateValue } = await import(
  new URL("../dist-electron/shared/date-values.js", import.meta.url)
);
const { formatDateForField } = await import(
  new URL("../dist-electron/shared/date-values.js", import.meta.url)
);

function page(body) {
  return `<!doctype html><html><body><article class="page sans"><header><h1 class="page-title">Fixture</h1></header><div class="page-body">${body}</div></article></body></html>`;
}

function pageWithProperties(rows) {
  return `<!doctype html><html><body><article class="page sans"><header><h1 class="page-title">Fixture</h1><table class="properties"><tbody>${rows}</tbody></table></header><div class="page-body"></div></article></body></html>`;
}

function parseBody(body, resolveLink) {
  return parseNotionHtml(page(body), { resolveLink }).bodyMarkdown.trim();
}

const imageMarkdown = parseBody(
  `<figure class="image"><a href="row/%25E7%2594%259F%25E4%25BA%25A7%25E5%258A%259B_(6).png"><img src="row/%25E7%2594%259F%25E4%25BA%25A7%25E5%258A%259B_(6).png" style="width:500px"/></a></figure>`,
  (_target, kind) =>
    kind === "image"
      ? "attachments/images/59157dbfe03fc4f15ca315c7-生产力_(6).png"
      : null
);
assert.equal(
  imageMarkdown,
  "![生产力 (6).png](attachments/images/59157dbfe03fc4f15ca315c7-生产力_(6).png)",
  "HTML images without alt should keep filename alt text and loadable attachment URLs"
);

const customAltMarkdown = parseBody(
  `<p><img alt="Custom alt" src="row/%25E7%2594%259F%25E4%25BA%25A7%25E5%258A%259B_(6).png"/></p>`,
  (_target, kind) =>
    kind === "image"
      ? "attachments/images/59157dbfe03fc4f15ca315c7-生产力_(6).png"
      : null
);
assert.equal(
  customAltMarkdown,
  "![Custom alt](attachments/images/59157dbfe03fc4f15ca315c7-生产力_(6).png)",
  "Existing HTML image alt text should not be replaced"
);

const pdfMarkdown = parseBody(
  `<p><a href="files/Notepad3_240424_222434.pdf">Notepad3_240424_222434.pdf</a></p>`,
  (_target, kind) =>
    kind === "anchor"
      ? "attachments/documents/47c6acd48e1a890debd85c81-Notepad3_240424_222434.pdf"
      : null
);
assert.equal(
  pdfMarkdown,
  "[Notepad3_240424_222434.pdf](attachments/documents/47c6acd48e1a890debd85c81-Notepad3_240424_222434.pdf)",
  "Attachment link labels should not keep Turndown underscore escapes"
);

assert.equal(
  parseBody(`<p>校验: [80.320.4174.29220]</p>`),
  "校验: [80.320.4174.29220]",
  "Plain text square brackets from Notion should not keep Turndown escapes"
);

const calloutMarkdown = parseBody(
  `<figure class="block-color-gray_background callout" style="white-space:pre-wrap;display:flex"><div style="font-size:1.5em"><span class="icon">💡</span></div><div style="width:100%"><h2><strong>🎉记录小小的成功和失败</strong></h2><mark class="highlight-brown">写下昨天最成功的，最美好的事情。写下自己的失败。</mark></div></figure>`
);
assert.equal(
  calloutMarkdown,
  "```lotion-callout\nicon: 💡\nbackground: gray\n---\n## **🎉记录小小的成功和失败**\n\n<span data-lotion-bg=\"brown\">写下昨天最成功的，最美好的事情。写下自己的失败。</span>\n```",
  "Notion callouts should keep their icon, background, and block boundary"
);

assert.equal(
  parseBody(`<p><s>deal</s> <del>gone</del> <span style="text-decoration: line-through;">old</span></p>`),
  "~~deal~~ ~~gone~~ ~~old~~",
  "Notion strikethrough should import as GFM double-tilde markdown"
);

assert.equal(
  parseBody(`<p><u>important</u> <ins>inserted</ins> <span style="text-decoration: underline;">marked</span></p>`),
  "<u>important</u> <u>inserted</u> <u>marked</u>",
  "Notion underline should import as stable inline underline HTML"
);

assert.equal(
  parseBody(`<p><mark class="highlight-yellow">important</mark> <span class="highlight-blue">marked</span> <mark class="highlight-teal">unknown</mark></p>`),
  `<span data-lotion-bg="yellow">important</span> <span data-lotion-bg="blue">marked</span> <mark>unknown</mark>`,
  "Notion highlighted text should preserve known highlight colors with stable mark fallback"
);

assert.equal(
  parseBody(`<p><span class="block-color-red">risk</span> <span class="block-color-blue_background">context</span></p>`),
  `<span data-lotion-color="red">risk</span> <span data-lotion-bg="blue">context</span>`,
  "Notion inline text colors should import as safe Lotion color spans"
);

assert.equal(
  parseBody(`<p class="block-color-yellow_background">paragraph context</p><p class="block-color-purple">paragraph warning</p>`),
  `<span data-lotion-bg="yellow">paragraph context</span>\n\n<span data-lotion-color="purple">paragraph warning</span>`,
  "Notion paragraph block colors should import through safe Lotion color spans"
);

assert.equal(
  parseBody(`<h2 class="block-color-green_background">Launch notes</h2><h3 class="block-color-red">Risk</h3>`),
  `## <span data-lotion-bg="green">Launch notes</span>\n\n### <span data-lotion-color="red">Risk</span>`,
  "Notion heading block colors should import through safe Lotion color spans"
);

assert.equal(
  parseBody(`<blockquote class="block-color-blue_background">Quoted context</blockquote><blockquote class="block-color-brown">Muted quote</blockquote>`),
  `> <span data-lotion-bg="blue">Quoted context</span>\n\n> <span data-lotion-color="brown">Muted quote</span>`,
  "Notion quote block colors should import through safe Lotion color spans"
);

assert.equal(
  parseBody(`<ul class="bulleted-list"><li class="block-color-red">Risk item</li></ul><ul class="bulleted-list"><li class="block-color-green_background">Context item</li></ul>`),
  `-   <span data-lotion-color="red">Risk item</span>\n-   <span data-lotion-bg="green">Context item</span>`,
  "Notion list item block colors should import through safe Lotion color spans"
);

assert.equal(
  parseBody(`<ul class="to-do-list"><li class="block-color-yellow_background"><div class="checkbox checkbox-on"></div>Done task</li></ul>`),
  `-   [x] <span data-lotion-bg="yellow">Done task</span>`,
  "Notion todo item block colors should not hide the GFM checkbox marker"
);

assert.equal(
  parseBody(`<ul class="bulleted-list"><li class="block-color-blue_background">Parent<ul class="bulleted-list"><li>Child</li></ul></li></ul>`),
  `-   <span data-lotion-bg="blue">Parent</span>\n    -   Child`,
  "Notion list item block colors should not wrap nested child lists"
);

assert.equal(
  parseBody(`<details open><summary>Plan</summary><p>Nested task</p></details>`),
  "```lotion-toggle\nsummary: Plan\nopen: true\n---\nNested task\n```",
  "Notion toggle blocks should import as explicit Lotion toggle fences"
);

assert.equal(
  parseBody(`<div class="equation" data-expression="E = mc^2"></div>`),
  "```lotion-equation\nE = mc^2\n```",
  "Notion equation data-expression should import as explicit Lotion equation fences"
);

assert.equal(
  parseBody(`<div class="katex-display"><span class="katex"><annotation encoding="application/x-tex">\\frac{1}{2}</annotation></span></div>`),
  "```lotion-equation\n\\frac{1}{2}\n```",
  "Notion KaTeX annotation source should be preserved as TeX"
);

const tocMarkdown = parseBody(
  `<nav class="block-color-gray table_of_contents"><div class="table_of_contents-item"><a href="#abc">第一节</a></div></nav><h2 id="abc">第一节</h2>`
);
assert.equal(
  tocMarkdown,
  "{{LOTIONTOC}}\n\n## 第一节",
  "Notion table_of_contents blocks should survive as a live TOC sentinel"
);

const indifyEmbedMarkdown = parseBody(
  `<figure><div class="source"><a href="https://indify.co/widgets/live/countdown/BnLVXR99m46qTtalinYH">https://indify.co/widgets/live/countdown/BnLVXR99m46qTtalinYH</a></div></figure>`
);
assert.equal(
  indifyEmbedMarkdown,
  "```lotion-iframe\nurl: https://indify.co/widgets/live/countdown/BnLVXR99m46qTtalinYH\nheight: 300\ntitle: Indify countdown\n```",
  "Notion source-only Indify embeds should import as explicit Lotion iframe previews"
);

const partiallyDecodedUrlLabelMarkdown = parseBody(
  `<p><a href="https://www.anthropic.com/index/prompting-long-context#:~:text=Claude's%20100%2C000%20token%20long%20context,or%20even%20an%20entire%20book">https://www.anthropic.com/index/prompting-long-context#:~:text=Claude's 100%2C000 token long context,or even an entire book</a></p>`
);
assert.equal(
  partiallyDecodedUrlLabelMarkdown,
  "[https://www.anthropic.com/index/prompting-long-context#:~:text=Claude's 100,000 token long context,or even an entire book](https://www.anthropic.com/index/prompting-long-context#:~:text=Claude's%20100%2C000%20token%20long%20context,or%20even%20an%20entire%20book)",
  "URL-like Notion link labels should be decoded for display while keeping href exact"
);

const emptyCollectionHtml = `<div id="11111111-2222-3333-4444-555555555555" class="collection-content"><h4 class="collection-title">收集箱</h4><div class="collection-content-wrapper"><table class="collection-content"><thead><tr><th><span class="icon property-icon"><img src="https://www.notion.so/icons/font_gray.svg"/></span>Name</th><th>Status</th></tr></thead><tbody></tbody></table></div></div>`;
const emptyCollectionParsed = parseNotionHtml(page(emptyCollectionHtml), { convertBody: false });
assert.deepEqual(
  emptyCollectionParsed.collectionViews,
  [{
    hash: "11111111222233334444555555555555",
    title: "收集箱",
    fieldNames: ["Name", "Status"],
    rowCount: 0,
    rows: []
  }],
  "Empty Notion collection views should keep enough metadata to synthesize a visible empty database"
);

const unresolvedCollectionMarkdown = parseNotionHtml(page(emptyCollectionHtml), {
  resolveCollection: () => null
}).bodyMarkdown.trim();
assert.equal(
  unresolvedCollectionMarkdown,
  "_📂 收集箱 (database not found)_",
  "Unresolved Notion collection views should import as a stable standalone missing-database placeholder"
);

const collectionMarkdown = parseNotionHtml(page(emptyCollectionHtml), {
  resolveCollection: (hash, title) =>
    hash === "11111111222233334444555555555555" && title === "收集箱"
      ? "lotion-db:db_empty_inbox"
      : null
}).bodyMarkdown.trim();
assert.equal(
  collectionMarkdown,
  "{{LOTIONVIEW:db\\_empty\\_inbox}}",
  "Resolved empty Notion collection views should emit a lotion-view sentinel for the importer to expand"
);

const rowCollectionHtml = `<div id="22222222-3333-4444-5555-666666666666" class="collection-content"><h4 class="collection-title">Rows</h4><div class="collection-content-wrapper"><table class="collection-content"><thead><tr><th>Name</th><th>Status</th></tr></thead><tbody><tr id="33333333-4444-5555-6666-777777777777"><td class="cell-title"><a href="Rows/Alpha%2033333333444455556666777777777777.html">Alpha</a></td><td>Done</td></tr></tbody></table></div></div>`;
const rowCollectionWithoutRows = parseNotionHtml(page(rowCollectionHtml), {
  collectCollectionRows: false,
  resolveCollection: (hash, title) =>
    hash === "22222222333344445555666666666666" && title === "Rows"
      ? "lotion-db:db_rows"
      : null
});
assert.deepEqual(
  rowCollectionWithoutRows.collectionViews,
  [{
    hash: "22222222333344445555666666666666",
    title: "Rows",
    fieldNames: ["Name", "Status"],
    rowCount: 1,
    rowHashes: ["33333333444455556666777777777777"],
    rowHrefs: ["Rows/Alpha%2033333333444455556666777777777777.html"],
    rows: []
  }],
  "Body conversion should keep row hash hints without materializing row cells"
);
assert.equal(
  rowCollectionWithoutRows.bodyMarkdown.trim(),
  "{{LOTIONVIEW:db\\_rows}}",
  "Collection placeholders should still be emitted when row extraction is disabled"
);

const relationProperties = parseNotionHtml(pageWithProperties(`
  <tr class="property-row property-row-relation">
    <th><span class="icon property-icon"><img src="https://www.notion.so/icons/arrow-northeast_gray.svg"/></span>Related</th>
    <td><a href="../任务/复盘 11111111222233334444555555555555.html"><img class="icon" src="../任务/check.png"/>复盘</a></td>
  </tr>
  <tr class="property-row property-row-url">
    <th>URL</th>
    <td><a href="https://example.com/a">https://example.com/a</a></td>
  </tr>
`), { convertBody: false });
assert.deepEqual(
  relationProperties.properties,
  {
    Related: "[复盘](notion-hash:11111111222233334444555555555555)",
    URL: "https://example.com/a"
  },
  "Relation-like properties should preserve Notion page links without breaking URL fields"
);

assert.equal(normalizeDateValue("2023/07/07"), "2023-07-07");
assert.equal(normalizeDateValue("January 1, 2026"), "2026-01-01");
assert.equal(normalizeDateValue("April 24, 2024 7:25 PM"), "2024-04-24");
assert.equal(normalizeDateValue("2023-07-07T00:00:00.000Z"), "2023-07-07");
assert.equal(
  formatDateForField("2026-05-27 03:13", { type: "created_time", dateFormat: "iso", timeFormat: "h24" }),
  "2026-05-27 03:13",
  "Created/updated time fields should support Notion-style ISO + 24-hour display"
);
assert.equal(
  formatDateForField("May 12, 2026 9:35 PM", { type: "date", dateFormat: "day_month_year", timeFormat: "none" }),
  "12 May 2026",
  "Date fields should hide time when the field format says none"
);
assert.equal(
  formatDateForField("2023-07-07T00:00:00.000Z", { type: "date", dateFormat: "iso", timeFormat: "none" }),
  "2023-07-07",
  "Date-only displays should keep the calendar date instead of shifting by timezone"
);
assert.equal(
  formatDateForField("May 12, 2026 9:35 PM", { type: "date", dateFormat: "month_day_year", timeFormat: "h12" }),
  "May 12, 2026 9:35 PM",
  "Date fields should show an explicit imported time when the time format is enabled"
);

const emptyParsed = parseNotionHtml("<main>Not a Notion page</main>");
assert.equal(emptyParsed.title, "");
assert.equal(emptyParsed.bodyMarkdown, "");
assert.deepEqual(emptyParsed.collectionViews, []);

const noHeaderPage = `<article class="page"><div class="page-body"><p>Fallback body</p></div></article>`;
assert.equal(parseNotionHtml(noHeaderPage).bodyMarkdown.trim(), "Fallback body");
assert.equal(parseNotionHtml(`<article class="page"><h1 class="page-title">No body</h1></article>`).title, "No body");
assert.equal(parseNotionHtmlMetadata(noHeaderPage).bodyMarkdown, "");

assert.equal(hasNotionPageBodyContent("<article class=\"page\"></article>"), false);
assert.equal(hasNotionPageBodyContent(page("")), false);
assert.equal(hasNotionPageBodyContent(page("<!-- note --><script>x</script><style>x</style><br>&nbsp;&#160;&#xA0;")), false);
assert.equal(hasNotionPageBodyContent(page("<svg></svg>")), true);
assert.equal(hasNotionPageBodyContent(page("<p>Visible text</p>")), true);
assert.equal(notionHtmlBodyTextFingerprint("<article class=\"page\"></article>"), "");
assert.equal(
  notionHtmlBodyTextFingerprint(page("<p>A&nbsp;&amp;&lt;&gt;&quot;&apos;&#x41;&#65;&#x110000;</p><script>hidden</script>")),
  'A &<>"\'AA&#x110000;'
);

const richHeaderHtml = `<!doctype html><html><body><article class="page sans"><header>
  <img class="page-cover-image" src="cover.jpg" style="object-position:center 140%"/>
  <div class="page-header-icon"><img class="icon" src="icon.png"/><span class="icon">🧴</span></div>
  <h1 class="page-title">Rich metadata</h1>
  <table class="properties"><tbody>
    <tr class="property-row property-row-multi_select"><th>Tags</th><td><span class="selected-value select-value-color-red">One</span><span class="selected-value select-value-color-default">Two</span></td></tr>
    <tr class="property-row property-row-status"><th>Status</th><td><span class="status-value select-value-color-blue">Doing</span></td></tr>
    <tr class="property-row property-row-text"><th>Plain</th><td>Text</td></tr>
    <tr class="property-row property-row-relation"><th>Broken</th><td><a href="bad%ZZ"><img class="notion-static-icon" src="x"/>Linked</a></td></tr>
    <tr class="property-row property-row-relation"><th>Empty href</th><td><a href="">Fallback</a></td></tr>
    <tr class="property-row"><th></th><td>Ignored</td></tr>
  </tbody></table>
  </header><div class="page-body"></div></article></body></html>`;
const richMetadata = parseNotionHtmlMetadata(richHeaderHtml, {
  resolveLink: (target) => target === "bad%ZZ" ? "resolved path).md" : null
});
assert.equal(richMetadata.title, "Rich metadata");
assert.equal(richMetadata.iconSrc, "icon.png");
assert.equal(richMetadata.iconEmoji, "🧴");
assert.equal(richMetadata.coverSrc, "cover.jpg");
assert.equal(richMetadata.coverOffset, 100);
assert.equal(richMetadata.properties.Tags, "One;Two");
assert.equal(richMetadata.properties.Status, "Doing");
assert.equal(richMetadata.properties.Broken, "[Linked](resolved%20path%29.md)");
assert.deepEqual(richMetadata.propertyOptions.Tags, [
  { name: "One", color: "red" },
  { name: "Two", color: "gray" }
]);

const metadataSeed = { ...richMetadata, bodyMarkdown: "stale", collectionViews: [] };
assert.equal(parseNotionHtmlBody("<article></article>", metadataSeed).bodyMarkdown, "");
assert.equal(parseNotionHtmlBody("<div>wrong root</div>", metadataSeed).bodyMarkdown, "");

const kitchenSinkMarkdown = parseBody(`
  <a class="pdf-relative-link-path">noise</a>
  <p><a href="row.html"><img class="icon" src="row-icon.png"/>Row</a></p>
  <p><img src="https://www.notion.so/icons/checkmark.svg"/></p>
  <script>bad()</script><style>.bad{}</style><link rel="stylesheet" href="bad.css"/>
  <div class="equation"></div>
  <figure><div class="source"><a href="https://example.com/not-an-embed">source</a></div></figure>
  <p><a href="image.png"><img src="image.png"/> caption</a></p>
  <div class="indented"></div>
  <ul class="to-do-list"><li>Unchecked task</li></ul>
  <ul class="toggle"> text <li><details><summary>Nested</summary><p>Body</p></details></li></ul>
  <div class="indented"><p>Indented text</p></div>
  <div class="column-list"><div class="column"><p>Column text</p></div></div>
  <div style="display:contents"><p>Unwrapped</p></div>
  <table class="simple-table"><tbody></tbody></table>
  <table class="simple-table"><tr><td>Head</td></tr><tr><td>Value</td></tr></table>
  <ul><li><p>Compact item</p></li></ul>
`);
assert.match(kitchenSinkMarkdown, /Unchecked task/);
assert.match(kitchenSinkMarkdown, /Nested/);
assert.match(kitchenSinkMarkdown, /Column text/);
assert.doesNotMatch(kitchenSinkMarkdown, /bad\(\)|checkmark\.svg|pdf-relative/);

const duplicateCollection = `<div class="collection-content" id="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee">
  <h4 class="collection-title">Nested &amp; view</h4>
  <div class="collection-content-wrapper" id="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee">
    <table class="collection-content"><thead><tr><th><img class="icon" src="x"/>Name</th><th></th></tr></thead>
    <tbody><tr><td>No id</td></tr><tr id="ffffffff-1111-2222-3333-444444444444"><td><a href="Bad%ZZ/Row ffffffff111122223333444444444444.html">Row &lt;A&gt;</a></td><td>&quot;ok&quot;</td></tr></tbody></table>
  </div>
</div>`;
const duplicateParsed = parseNotionHtml(page(duplicateCollection), {
  resolveCollection: (_hash, _title, context) => {
    assert.equal(context.rowHashes.includes("ffffffff111122223333444444444444"), true);
    return "./system/databases/Nested--db_nested/data.csv/";
  }
});
assert.equal(duplicateParsed.collectionViews.length, 1);
assert.equal(duplicateParsed.collectionViews[0].rows.length, 1);
assert.equal(duplicateParsed.collectionViews[0].rows[0].title, "Row <A>");
assert.match(duplicateParsed.bodyMarkdown, /LOTIONVIEW/);

const headerlessCollection = parseNotionHtml(
  `<article class="page"><div class="page-body">
    <div class="collection-content" id="12121212-3434-5656-7878-909090909090">
      <table><thead><tr><th><span class="icon">X</span>Name</th></tr></thead>
      <tbody><tr id="abababab-cdcd-efef-0101-232323232323"><td class="cell-title"><a href="Row%20ababababcdcdefef0101232323232323.html">Row</a></td></tr></tbody></table>
    </div>
  </div></article>`,
  {
    resolveCollection: (hash, title, context) => {
      assert.equal(hash, "12121212343456567878909090909090");
      assert.equal(title, "Embedded database");
      assert.deepEqual(context.rowHashes, ["ababababcdcdefef0101232323232323"]);
      return "databases/Headerless--db_headerless/data.csv";
    }
  }
);
assert.equal(headerlessCollection.isCollectionWrapperOnly, true);
assert.equal(headerlessCollection.collectionViews[0].fieldNames[0], "Name");
assert.equal(headerlessCollection.bodyMarkdown.includes("Headerless--db"), true);

const unresolvedHeaderlessCollection = parseNotionHtml(
  `<article class="page"><div class="page-body"><table class="collection-content" id="34343434-5656-7878-9090-abababababab"><thead><tr><th><span class="cell-title">Fallback title</span></th></tr></thead><tbody></tbody></table></div></article>`
);
assert.match(unresolvedHeaderlessCollection.bodyMarkdown, /Fallback title \(database not found\)/);

console.log("Notion HTML converter regression tests passed.");
