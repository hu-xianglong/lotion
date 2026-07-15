#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import {
  assertIntersectsViewport,
  assertNoDocumentHorizontalOverflow,
  assertWithinViewport,
  forEachViewport,
  openPage,
  selectedViewports,
  waitForPageMarkdown,
  withLotionUIHarness,
  workspacePath,
  writeCsv,
  writeJson
} from "./ui-harness.mjs";

const RAW_MARKDOWN_STORAGE_KEY = "lotion.settings.rawMarkdown";

const result = await withLotionUIHarness("markdown-preview-harness", async ({ cdpUrl, openWorkspace, page }) => {
  const previousRawMarkdown = await readRawMarkdownSetting(page);
  const viewports = [];
  try {
    await page.evaluate((key) => window.localStorage.setItem(key, "0"), RAW_MARKDOWN_STORAGE_KEY);
    await forEachViewport(page, selectedViewports(), async (viewport) => {
      const fixture = await createMarkdownPreviewHarnessFixture(viewport.name);
      await openWorkspace(fixture.root);
      await openPage(page, fixture.pageId);
      await page.getByText(fixture.pageTitle).first().waitFor({ timeout: 8_000 });
      const rendered = await assertMarkdownPreview(page, fixture, viewport);
      viewports.push({
        viewport: viewport.name,
        pageId: fixture.pageId,
        rendered
      });
    });
  } finally {
    await restoreRawMarkdownSetting(page, previousRawMarkdown).catch(() => undefined);
  }
  return { cdpUrl, viewports, status: "passed" };
});

console.log(JSON.stringify(result, null, 2));

async function assertMarkdownPreview(page, fixture, viewport) {
  await page.locator(".cm-line").first().click();
  await page.getByText("开始恢复锻炼").first().waitFor({ timeout: 8_000 });
  await page.getByText("从国内买茶叶").first().waitFor({ timeout: 8_000 });
  await page.getByText("prompting-long-context").first().waitFor({ timeout: 8_000 });
  await page.getByText("主动增管").first().waitFor({ timeout: 8_000 });
  await assertNoDocumentHorizontalOverflow(page, `markdown preview ${viewport.name}`);
  await assertIntersectsViewport(page, page.locator('[data-testid="markdown-editor"]').first(), `markdown editor ${viewport.name}`, 4);
  await assertWithinViewport(page, page.getByText("从国内买茶叶").first(), `nested strike line ${viewport.name}`, 8);
  await assertWithinViewport(page, page.locator(".cm-md-table-widget").first(), `markdown table ${viewport.name}`, 8);

  const rendered = await page.evaluate(() => {
    const lineData = Array.from(document.querySelectorAll(".cm-line")).map((line) => {
      const element = line;
      return {
        text: element.textContent ?? "",
        links: Array.from(element.querySelectorAll("[data-md-url], .cm-md-link, .cm-md-url")).map((link) => ({
          text: link.textContent ?? "",
          url: link.getAttribute("data-md-url"),
          className: link.getAttribute("class")
        })),
        strikeText: Array.from(element.querySelectorAll(".cm-md-strike")).map((strike) => strike.textContent ?? ""),
        strongText: Array.from(element.querySelectorAll(".cm-md-strong")).map((strong) => strong.textContent ?? ""),
        emphasisText: Array.from(element.querySelectorAll(".cm-md-emphasis")).map((emphasis) => emphasis.textContent ?? "")
      };
    });
    return {
      wipLine: lineData.find((line) => line.text.includes("开始恢复锻炼")) ?? null,
      strongLine: lineData.find((line) => line.text.includes("粗体等待")) ?? null,
      emphasisLine: lineData.find((line) => line.text.includes("斜体等待")) ?? null,
      strikeLine: lineData.find((line) => line.text.includes("完成的删除线")) ?? null,
      nestedStrikeLine: lineData.find((line) => line.text.includes("从国内买茶叶")) ?? null,
      longLinkLine: lineData.find((line) => line.text.includes("prompting-long-context")) ?? null,
      tablePreview: (() => {
        const table = document.querySelector(".cm-md-table-widget table");
        const editableCell = Array.from(table?.querySelectorAll("td") ?? [])
          .find((cell) => (cell.textContent ?? "").trim() === "2(天)");
        return table ? {
          text: table.textContent ?? "",
          editableCellText: editableCell?.textContent ?? "",
          editableCellContentEditable: editableCell?.getAttribute("contenteditable") ?? "",
          editableCellAriaLabel: editableCell?.getAttribute("aria-label") ?? ""
        } : null;
      })()
    };
  });

  if (!rendered.wipLine) throw new Error("Missing [WIP] regression line");
  if (rendered.wipLine.links.length !== 0) {
    throw new Error(`[WIP] literal text rendered as a link: ${JSON.stringify(rendered.wipLine)}`);
  }
  if (!rendered.wipLine.text.includes("[WIP]")) {
    throw new Error(`[WIP] literal brackets disappeared: ${JSON.stringify(rendered.wipLine)}`);
  }

  if (!rendered.strongLine?.strongText.some((text) => text.includes("粗体等待"))) {
    throw new Error(`Bold text did not render with cm-md-strong: ${JSON.stringify(rendered.strongLine)}`);
  }
  if (rendered.strongLine.text.includes("**")) {
    throw new Error(`Bold markers leaked into preview text: ${JSON.stringify(rendered.strongLine)}`);
  }
  if (!rendered.emphasisLine?.emphasisText.some((text) => text.includes("斜体等待"))) {
    throw new Error(`Italic text did not render with cm-md-emphasis: ${JSON.stringify(rendered.emphasisLine)}`);
  }
  if (rendered.emphasisLine.text.includes("*")) {
    throw new Error(`Italic markers leaked into preview text: ${JSON.stringify(rendered.emphasisLine)}`);
  }
  if (!rendered.strikeLine?.strikeText.some((text) => text.includes("完成的删除线"))) {
    throw new Error(`Double-tilde strikethrough did not render: ${JSON.stringify(rendered.strikeLine)}`);
  }

  if (!rendered.nestedStrikeLine?.strikeText.some((text) => text.includes("从国内买茶叶"))) {
    throw new Error(`Imported single-tilde strikethrough did not render: ${JSON.stringify(rendered.nestedStrikeLine)}`);
  }
  if (!rendered.nestedStrikeLine.strongText.some((text) => text.includes("等待"))) {
    throw new Error(`Nested bold inside imported strikethrough did not render: ${JSON.stringify(rendered.nestedStrikeLine)}`);
  }
  if (/[~*]/.test(rendered.nestedStrikeLine.text)) {
    throw new Error(`Nested strikethrough/bold markers leaked into preview text: ${JSON.stringify(rendered.nestedStrikeLine)}`);
  }

  if (!rendered.longLinkLine) throw new Error("Missing long URL link regression line");
  if (!rendered.longLinkLine.text.includes("Claude's 100,000 token long context,or even an entire book")) {
    throw new Error(`Long URL label was not decoded: ${JSON.stringify(rendered.longLinkLine)}`);
  }
  if (/%20|%2C/i.test(rendered.longLinkLine.text)) {
    throw new Error(`Long URL label leaked encoded characters: ${JSON.stringify(rendered.longLinkLine)}`);
  }
  const visibleUrlCopies = rendered.longLinkLine.text.split("https://www.anthropic.com/index/prompting-long-context").length - 1;
  if (visibleUrlCopies !== 1) {
    throw new Error(`Long URL label rendered ${visibleUrlCopies} URL copies: ${JSON.stringify(rendered.longLinkLine)}`);
  }
  if (rendered.longLinkLine.links.length !== 1 || !/%20/.test(rendered.longLinkLine.links[0]?.url ?? "")) {
    throw new Error(`Long URL should expose exactly one encoded click target: ${JSON.stringify(rendered.longLinkLine)}`);
  }

  if (!rendered.tablePreview) {
    throw new Error("Missing Markdown table preview widget");
  }
  if (!rendered.tablePreview.text.includes("主动增管") || rendered.tablePreview.editableCellText !== "2(天)") {
    throw new Error(`Markdown table preview did not render the expected editable cell: ${JSON.stringify(rendered.tablePreview)}`);
  }
  if (rendered.tablePreview.editableCellContentEditable !== "plaintext-only") {
    throw new Error(`Markdown table cell should be directly editable: ${JSON.stringify(rendered.tablePreview)}`);
  }
  if (rendered.tablePreview.editableCellAriaLabel !== "Edit table cell") {
    throw new Error(`Markdown table editable cell should expose button-like edit semantics: ${JSON.stringify(rendered.tablePreview)}`);
  }
  const tableEdit = await assertMarkdownTableDirectEditing(page, fixture, viewport);

  return { ...rendered, tableEdit };
}

async function assertMarkdownTableDirectEditing(page, fixture, viewport) {
  const cancelledValue = `cancelled ${viewport.name}`;
  const committedValue = `3(天)-${viewport.name}`;
  const originalLine = "| 主动增管 | 2(天/周) | 2(天) |";
  const committedLine = `| 主动增管 | 2(天/周) | ${committedValue} |`;

  const originalCell = page.locator(".cm-md-table-widget tbody td").filter({ hasText: "2(天)" }).first();
  await originalCell.waitFor({ timeout: 8_000 });
  await originalCell.click();
  await originalCell.fill(cancelledValue);
  await page.keyboard.press("Escape");
  await page.waitForFunction(
    ({ rejected, expected }) => {
      const tableText = document.querySelector(".cm-md-table-widget table")?.textContent ?? "";
      return tableText.includes(expected) && !tableText.includes(rejected);
    },
    { rejected: cancelledValue, expected: "2(天)" },
    { timeout: 5_000 }
  );
  const afterCancelMarkdown = await page.evaluate(async ({ pageId }) => {
    const doc = await window.lotion.pages.get(pageId);
    return doc.markdown;
  }, { pageId: fixture.pageId });
  if (!afterCancelMarkdown.includes(originalLine) || afterCancelMarkdown.includes(cancelledValue)) {
    throw new Error(`Escape should cancel table edit without persisting: ${JSON.stringify({
      originalLine,
      cancelledValue,
      markdown: afterCancelMarkdown
    })}`);
  }

  const commitCell = page.locator(".cm-md-table-widget tbody td").filter({ hasText: "2(天)" }).first();
  await commitCell.click();
  await commitCell.fill(committedValue);
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    ({ expected }) => {
      const tableText = document.querySelector(".cm-md-table-widget table")?.textContent ?? "";
      return tableText.includes(expected);
    },
    { expected: committedValue },
    { timeout: 5_000 }
  );
  const persistedMarkdown = await waitForPageMarkdown(page, fixture.pageId, committedLine, "markdown table direct edit autosave");
  await assertNoDocumentHorizontalOverflow(page, `markdown table edit ${viewport.name}`);
  await assertWithinViewport(page, page.locator(".cm-md-table-widget").first(), `markdown table after edit ${viewport.name}`, 8);

  return {
    cancelledValue,
    committedValue,
    persistedLine: committedLine,
    markdownLength: persistedMarkdown.length
  };
}

async function readRawMarkdownSetting(page) {
  return page.evaluate((key) => window.localStorage.getItem(key) === "1", RAW_MARKDOWN_STORAGE_KEY);
}

async function restoreRawMarkdownSetting(page, enabled) {
  await page.evaluate(({ key, enabled }) => {
    window.localStorage.setItem(key, enabled ? "1" : "0");
  }, { key: RAW_MARKDOWN_STORAGE_KEY, enabled });
}

async function createMarkdownPreviewHarnessFixture(viewportName) {
  const root = await mkdtemp(join(tmpdir(), `lotion-markdown-preview-harness-${viewportName}-`));
  const now = "2026-01-01T00:00:00.000Z";
  const pageId = `pg_markdown_preview_${viewportName}`;
  const pageTitle = `Markdown Preview Harness ${viewportName}`;
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const pagePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(pageId, pageTitle));
  const longUrl = "https://www.anthropic.com/index/prompting-long-context#:~:text=Claude's%20100%2C000%20token%20long%20context,or%20even%20an%20entire%20book";
  const longLabel = "https://www.anthropic.com/index/prompting-long-context#:~:text=Claude's 100%2C000 token long context,or even an entire book";

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: `sp_markdown_preview_${viewportName}`,
    name: `Markdown Preview Harness ${viewportName}`,
    pages: [pageId],
    databases: [],
    systemDatabases: [PAGES_DATABASE_ID]
  });
  await writeJson(join(pagesDir, "schema.json"), {
    id: PAGES_DATABASE_ID,
    name: "pages",
    created_time: now,
    updated_time: now,
    defaultViewId: DEFAULT_VIEW_ID,
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "title", name: "Title", type: "title" },
      { id: "body_path", name: "Body path", type: "text", system: true, hidden: true },
      { id: "icon", name: "Icon", type: "text" },
      { id: "path", name: "Path", type: "text" },
      { id: "created_time", name: "Created time", type: "created_time", system: true },
      { id: "updated_time", name: "Updated time", type: "updated_time", system: true }
    ]
  });
  await writeJson(join(pagesDir, "views", `${DEFAULT_VIEW_ID}.json`), {
    id: DEFAULT_VIEW_ID,
    databaseId: PAGES_DATABASE_ID,
    name: "All",
    type: "table",
    fields: ["title", "path", "icon"],
    sort: [],
    filter: { type: "and", filters: [] },
    pageSize: 20,
    wrap: true
  });
  await writeCsv(join(pagesDir, "data.csv"), ["id", "title", "body_path", "icon", "path", "created_time", "updated_time"], [
    {
      id: pageId,
      title: pageTitle,
      body_path: pagePath,
      icon: "emoji:🧪",
      path: serializePathValue(["Tests", pageTitle]),
      created_time: now,
      updated_time: now
    }
  ]);
  await writeFile(join(root, pagePath), [
    `# ${pageTitle}`,
    "",
    "- [WIP] 开始恢复锻炼 **粗体等待** *斜体等待*",
    "- ~~完成的删除线~~",
    "- ~从国内买茶叶，药品，书法用具(~~**等待**~~)~",
    `- [${longLabel}](${longUrl}).`,
    "",
    "| 名称 | 配额 | 目前余额 |",
    "| --- | --- | --- |",
    "| 主动增管 | 2(天/周) | 2(天) |",
    "| 开心果 | 1(磅/周) | 1(磅) |",
    ""
  ].join("\n"), "utf8");

  return { root, pageId, pageTitle };
}
