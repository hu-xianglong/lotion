#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_VIEW_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { serializePathValue } from "../dist-electron/shared/path-values.js";
import { databaseFolderName, pageMarkdownFileName } from "../dist-electron/shared/workspace-paths.js";
import { assertEditorRegressionArtifactContract } from "./lib/editor-regression-artifacts.mjs";
import {
  assertElementSnapshotBaseline,
  assertFocusWithin,
  assertIntersectsViewport,
  assertNoDocumentHorizontalOverflow,
  assertRectsDoNotOverlap,
  assertWithinViewport,
  captureElementSnapshot,
  forEachViewport,
  nextAnimationFrame,
  openPage,
  openRowPage,
  readRect,
  selectedViewports,
  waitForPageMarkdown,
  waitForRowPageMarkdown,
  withLotionUIHarness,
  workspacePath,
  writeCsv,
  writeJson
} from "./ui-harness.mjs";

const results = await withLotionUIHarness("editor-regression", async (harness) => {
  const perViewport = [];
  await forEachViewport(harness.page, selectedViewports(), async (viewport) => {
    const fixture = await createEditorRegressionFixture(viewport.name);
    await harness.openWorkspace(fixture.root);
    const editorResult = await exerciseEditorRegression(harness.page, fixture, viewport, harness.artifactRoot);
    perViewport.push(editorResult);
  });
  const summary = {
    cdpUrl: harness.cdpUrl,
    artifactRoot: harness.artifactRoot,
    viewports: perViewport,
    status: "passed"
  };
  summary.artifactContract = await assertEditorRegressionArtifactContract(summary, {
    expectedViewportNames: selectedViewports().map((viewport) => viewport.name)
  });
  return summary;
});

await writeFile(join(results.artifactRoot, "result.json"), `${JSON.stringify(results, null, 2)}\n`, "utf8");
console.log(JSON.stringify(results, null, 2));

async function exerciseEditorRegression(page, fixture, viewport, artifactRoot) {
  const normal = await exerciseNormalPageEditing(page, fixture, viewport);
  const empty = await exerciseEmptyRowPageFirstTyping(page, fixture, viewport);
  const large = await exerciseLargeDocumentEditing(page, fixture, viewport);
  const visualSnapshot = await captureEditorRegressionSnapshot(page, fixture, viewport, artifactRoot, { normal, empty, large });
  return {
    viewport,
    normal,
    empty,
    large,
    visualSnapshot
  };
}

async function exerciseNormalPageEditing(page, fixture, viewport) {
  await openPage(page, fixture.mainPageId);
  await page.locator(".title-input").first().waitFor({ timeout: 60_000 });
  await waitForTitleValue(page, fixture.mainTitle);
  await assertEditorLayout(page, `normal-${viewport.name}`);
  const tagSearch = await exercisePageTagSearchChip(page, {
    tag: fixture.mainPageTag,
    label: `normal page tag ${viewport.name}`
  });
  const smallText = await exercisePageSmallTextSetting(page, {
    label: `normal page ${viewport.name}`,
    target: { type: "page", pageId: fixture.mainPageId }
  });
  const markdownLinks = await exerciseMarkdownLinkClickEditing(page, fixture, viewport);

  const editor = editorContent(page);
  await editor.click();
  await moveToDocumentEnd(page);
  await assertEditorFocused(page, "normal page initial focus");

  const firstToken = `Typed insertion ${viewport.name} ${Date.now()}`;
  const started = await page.evaluate(() => performance.now());
  await page.keyboard.type(`\n${firstToken}`);
  await waitForEditorText(page, firstToken, "typed insertion");
  const typedMs = Number(((await page.evaluate(() => performance.now())) - started).toFixed(1));
  if (typedMs > 1_500) throw new Error(`Typing insertion took too long: ${typedMs}ms`);

  const selectionReplacement = `Selection replacement ${viewport.name}`;
  await selectEditorTextByDrag(page, "Second seed line for selection.");
  await page.keyboard.type(selectionReplacement);
  await waitForEditorText(page, selectionReplacement, "selection replacement");
  await waitForEditorTextNot(page, "Second seed line for selection.", "selected seed after replacement");
  await waitForEditorText(page, "Alpha seed line.", "adjacent seed after selection replacement");
  await assertEditorFocused(page, "normal page selection replacement focus");
  const selectionMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, selectionReplacement, "selection replacement autosave");
  if (selectionMarkdown.includes("Second seed line for selection.")) {
    throw new Error(`Selection replacement left the original seed text in persisted markdown: ${JSON.stringify(selectionMarkdown)}`);
  }

  const backspaceToken = `Backspace survivor ${viewport.name}`;
  await page.keyboard.press("Enter");
  await page.keyboard.type(`${backspaceToken}x`);
  await page.keyboard.press("Backspace");
  await waitForEditorText(page, backspaceToken, "backspace survivor");
  await waitForEditorTextNot(page, `${backspaceToken}x`, "deleted backspace suffix");

  const mergeLeft = `Merge left ${viewport.name}`;
  const mergeRight = `merge right ${viewport.name}`;
  const mergedLine = `${mergeLeft}${mergeRight}`;
  await page.keyboard.press("Enter");
  await page.keyboard.type(`${mergeLeft}\n${mergeRight}`);
  await waitForEditorExactLine(page, mergeLeft, "line merge left before backspace");
  await waitForEditorExactLine(page, mergeRight, "line merge right before backspace");
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");
  await waitForEditorExactLine(page, mergedLine, "line merge after backspace");
  await waitForEditorExactLineNot(page, mergeRight, "line merge removed second line");
  const mergeMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, mergedLine, "line merge autosave");
  if (mergeMarkdown.includes(`${mergeLeft}\n${mergeRight}`)) {
    throw new Error(`Line-merge Backspace left the original newline in persisted markdown: ${JSON.stringify(mergeMarkdown)}`);
  }

  const undoToken = `Undo redo token ${viewport.name}`;
  await page.keyboard.press("Enter");
  await page.keyboard.type(undoToken);
  await waitForEditorText(page, undoToken, "undo token before undo");
  await pressModifierShortcut(page, "z");
  await waitForEditorTextNot(page, undoToken, "undo removed token");
  await pressRedo(page);
  await waitForEditorText(page, undoToken, "redo restored token");

  const markdownHeadingShortcut = await exerciseMarkdownHeadingShortcut(page, fixture, viewport);
  const markdownEmphasisShortcuts = await exerciseMarkdownEmphasisShortcuts(page, fixture, viewport);

  const slashHeading = `Slash heading ${viewport.name}`;
  await page.keyboard.press("Enter");
  await page.keyboard.type("/h2");
  await page.locator(".slash-menu").first().waitFor({ timeout: 5_000 });
  await page.keyboard.press("Enter");
  await page.keyboard.type(slashHeading);
  await waitForEditorText(page, slashHeading, "slash command heading text");
  const slashChineseHeading = await exerciseSlashChineseHeadingAlias(page, fixture, viewport);
  const slashChineseHeading1 = await exerciseSlashChineseHeadingAlias(page, fixture, viewport, {
    command: "/一级标题",
    expectedLabel: "Heading 1",
    marker: "#",
    label: "Chinese heading 1"
  });
  const slashChineseHeading2 = await exerciseSlashChineseHeadingAlias(page, fixture, viewport, {
    command: "/二级标题",
    expectedLabel: "Heading 2",
    marker: "##",
    label: "Chinese heading 2"
  });
  const slashChineseHeading3 = await exerciseSlashChineseHeadingAlias(page, fixture, viewport, {
    command: "/三级标题",
    expectedLabel: "Heading 3",
    marker: "###",
    label: "Chinese heading 3"
  });
  const slashChineseBigHeading = await exerciseSlashChineseHeadingAlias(page, fixture, viewport, {
    command: "/大标题",
    expectedLabel: "Heading 1",
    marker: "#",
    label: "Chinese big heading"
  });
  const slashChineseMediumHeading = await exerciseSlashChineseHeadingAlias(page, fixture, viewport, {
    command: "/中标题",
    expectedLabel: "Heading 2",
    marker: "##",
    label: "Chinese medium heading"
  });
  const slashChineseSmallHeading = await exerciseSlashChineseHeadingAlias(page, fixture, viewport, {
    command: "/小标题",
    expectedLabel: "Heading 3",
    marker: "###",
    label: "Chinese small heading"
  });
  const slashText = await exerciseSlashText(page, fixture, viewport);
  const slashChineseText = await exerciseSlashChineseTextAlias(page, fixture, viewport);
  const slashChineseBodyText = await exerciseSlashChineseTextAlias(page, fixture, viewport, {
    command: "/正文",
    label: "slash Chinese body text"
  });
  const slashChinesePlainText = await exerciseSlashChineseTextAlias(page, fixture, viewport, {
    command: "/普通文本",
    label: "slash Chinese plain text"
  });
  const slashLink = await exerciseSlashLink(page, fixture, viewport);
  const slashUrlLink = await exerciseSlashLink(page, fixture, viewport, {
    command: "/url",
    testLabel: "slash URL link",
    labelPrefix: "Slash URL link label"
  });
  const slashChineseLink = await exerciseSlashLink(page, fixture, viewport, {
    command: "/网址",
    testLabel: "slash Chinese link",
    labelPrefix: "Slash Chinese link label"
  });
  const slashImage = await exerciseSlashImage(page, fixture, viewport);
  const slashChineseImage = await exerciseSlashImage(page, fixture, viewport, {
    command: "/图片",
    testLabel: "slash Chinese image",
    altPrefix: "Slash Chinese image alt",
    afterPrefix: "After slash Chinese image"
  });
  const slashToc = await exerciseSlashToc(page, fixture, viewport, slashHeading);
  const slashChineseToc = await exerciseSlashChineseTocAlias(page, fixture, viewport, slashHeading);

  const persistedMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, slashHeading, "normal page autosave");
  if (!persistedMarkdown.includes(`## ${slashHeading}`)) {
    throw new Error(`Slash heading did not persist as h2 markdown: ${JSON.stringify(persistedMarkdown)}`);
  }

  const slashKeyboard = await exerciseSlashMenuKeyboard(page, fixture, viewport);
  const slashEmpty = await exerciseSlashMenuEmptyResult(page, fixture, viewport);
  const slashTable = await exerciseSlashTable(page, fixture, viewport);
  const slashChineseTable = await exerciseSlashTable(page, fixture, viewport, {
    command: "/表格",
    testLabel: "slash Chinese table",
    cellPrefix: "Slash Chinese table cell",
    afterPrefix: "After slash Chinese table"
  });
  const slashSpacedHintTable = await exerciseSlashTable(page, fixture, viewport, {
    command: "/Markdown 表格",
    testLabel: "slash spaced hint table",
    cellPrefix: "Slash spaced hint table cell",
    afterPrefix: "After slash spaced hint table"
  });
  const slashBulletList = await exerciseSlashListCommand(page, fixture, viewport, {
    command: "bullet",
    marker: "-",
    label: "bullet"
  });
  const slashChineseBulletList = await exerciseSlashListCommand(page, fixture, viewport, {
    command: "/列表",
    marker: "-",
    label: "Chinese bullet"
  });
  const slashChineseExplicitBulletList = await exerciseSlashListCommand(page, fixture, viewport, {
    command: "/无序列表",
    marker: "-",
    label: "Chinese explicit bullet"
  });
  const slashChineseProjectBulletList = await exerciseSlashListCommand(page, fixture, viewport, {
    command: "/项目列表",
    marker: "-",
    label: "Chinese project bullet"
  });
  const markdownTaskCheckboxShortcut = await exerciseMarkdownTaskCheckboxShortcut(page, fixture, viewport);
  const markdownQuoteShortcut = await exerciseMarkdownQuoteShortcut(page, fixture, viewport);
  const markdownDividerShortcut = await exerciseMarkdownDividerShortcut(page, fixture, viewport);
  const markdownBulletListShortcut = await exerciseMarkdownBulletListShortcut(page, fixture, viewport);
  const markdownNumberedListShortcut = await exerciseMarkdownNumberedListShortcut(page, fixture, viewport);
  const markdownCodeFenceShortcut = await exerciseMarkdownCodeFenceShortcut(page, fixture, viewport);
  const markdownImageSyntax = await exerciseMarkdownImageSyntax(page, fixture, viewport);
  const markdownTableSyntax = await exerciseMarkdownTableSyntax(page, fixture, viewport);
  const markdownInlineLinkSyntax = await exerciseMarkdownInlineLinkSyntax(page, fixture, viewport);
  const lotionCalloutFence = await exerciseLotionCalloutFence(page, fixture, viewport);
  const lotionEquationFence = await exerciseLotionEquationFence(page, fixture, viewport);
  const lotionIframeFence = await exerciseLotionIframeFence(page, fixture, viewport);
  const lotionToggleFence = await exerciseLotionToggleFence(page, fixture, viewport);
  const lotionViewFence = await exerciseLotionViewFence(page, fixture, viewport);
  const slashToggle = await exerciseSlashToggleBlock(page, fixture, viewport);
  const slashChineseToggle = await exerciseSlashToggleBlock(page, fixture, viewport, {
    command: "/折叠",
    label: "slash Chinese toggle block",
    summaryPrefix: "Slash Chinese toggle summary",
    bodyPrefix: "Slash Chinese toggle body",
    afterPrefix: "After slash Chinese toggle block"
  });
  const slashChineseExplicitToggle = await exerciseSlashToggleBlock(page, fixture, viewport, {
    command: "/折叠块",
    label: "slash Chinese explicit toggle block",
    summaryPrefix: "Slash Chinese explicit toggle summary",
    bodyPrefix: "Slash Chinese explicit toggle body",
    afterPrefix: "After slash Chinese explicit toggle block"
  });
  const slashEquation = await exerciseSlashEquationBlock(page, fixture, viewport);
  const slashChineseEquation = await exerciseSlashEquationBlock(page, fixture, viewport, {
    command: "/公式",
    label: "slash Chinese equation block",
    afterPrefix: "After slash Chinese equation block"
  });
  const slashChineseExplicitEquation = await exerciseSlashEquationBlock(page, fixture, viewport, {
    command: "/数学公式",
    label: "slash Chinese explicit equation block",
    afterPrefix: "After slash Chinese explicit equation block"
  });
  const slashEmbed = await exerciseSlashEmbedBlock(page, fixture, viewport);
  const slashChineseEmbed = await exerciseSlashEmbedBlock(page, fixture, viewport, {
    command: "/嵌入",
    label: "slash Chinese embed iframe block",
    afterPrefix: "After slash Chinese embed block"
  });
  const slashChineseWebEmbed = await exerciseSlashEmbedBlock(page, fixture, viewport, {
    command: "/网页",
    label: "slash Chinese web embed iframe block",
    afterPrefix: "After slash Chinese web embed block"
  });
  const slashChineseExplicitWebEmbed = await exerciseSlashEmbedBlock(page, fixture, viewport, {
    command: "/网页嵌入",
    label: "slash Chinese explicit web embed iframe block",
    afterPrefix: "After slash Chinese explicit web embed block"
  });
  const slashChineseEmbedWeb = await exerciseSlashEmbedBlock(page, fixture, viewport, {
    command: "/嵌入网页",
    label: "slash Chinese embed web iframe block",
    afterPrefix: "After slash Chinese embed web block"
  });
  const slashNumberedList = await exerciseSlashListCommand(page, fixture, viewport, {
    command: "numbered",
    marker: "1.",
    label: "numbered"
  });
  const slashChineseNumberedList = await exerciseSlashListCommand(page, fixture, viewport, {
    command: "/有序列表",
    marker: "1.",
    label: "Chinese numbered"
  });
  const slashChineseIndexNumberedList = await exerciseSlashListCommand(page, fixture, viewport, {
    command: "/编号列表",
    marker: "1.",
    label: "Chinese index numbered"
  });
  const slashTodo = await exerciseSlashTodoTask(page, fixture, viewport);
  const slashChineseTodo = await exerciseSlashTodoTask(page, fixture, viewport, {
    command: "/待办",
    label: "slash Chinese todo",
    textPrefix: "Slash Chinese todo task"
  });
  const slashChineseTaskTodo = await exerciseSlashTodoTask(page, fixture, viewport, {
    command: "/任务",
    label: "slash Chinese task todo",
    textPrefix: "Slash Chinese task todo task"
  });
  const slashChineseTaskListTodo = await exerciseSlashTodoTask(page, fixture, viewport, {
    command: "/任务列表",
    label: "slash Chinese task-list todo",
    textPrefix: "Slash Chinese task-list todo task"
  });
  const slashChineseCheckboxTodo = await exerciseSlashTodoTask(page, fixture, viewport, {
    command: "/复选框",
    label: "slash Chinese checkbox todo",
    textPrefix: "Slash Chinese checkbox todo task"
  });
  const slashDivider = await exerciseSlashDivider(page, fixture, viewport);
  const slashChineseDivider = await exerciseSlashDivider(page, fixture, viewport, {
    command: "/分割",
    testLabel: "slash Chinese divider",
    afterPrefix: "After slash Chinese divider"
  });
  const slashChineseExplicitDivider = await exerciseSlashDivider(page, fixture, viewport, {
    command: "/分割线",
    testLabel: "slash Chinese explicit divider",
    afterPrefix: "After slash Chinese explicit divider"
  });
  const slashCallout = await exerciseSlashCallout(page, fixture, viewport);
  const slashChineseCallout = await exerciseSlashCallout(page, fixture, viewport, {
    command: "/提示",
    testLabel: "slash Chinese callout",
    bodyPrefix: "Slash Chinese callout body",
    afterPrefix: "After slash Chinese callout"
  });
  const slashChineseAnnotationCallout = await exerciseSlashCallout(page, fixture, viewport, {
    command: "/标注",
    testLabel: "slash Chinese annotation callout",
    bodyPrefix: "Slash Chinese annotation callout body",
    afterPrefix: "After slash Chinese annotation callout"
  });
  const slashChineseExplicitCallout = await exerciseSlashCallout(page, fixture, viewport, {
    command: "/强调块",
    testLabel: "slash Chinese explicit callout",
    bodyPrefix: "Slash Chinese explicit callout body",
    afterPrefix: "After slash Chinese explicit callout"
  });
  const slashCodeBlock = await exerciseSlashCodeBlock(page, fixture, viewport);
  const slashChineseCodeBlock = await exerciseSlashCodeBlock(page, fixture, viewport, {
    command: "/代码",
    testLabel: "slash Chinese code block",
    codeNamePrefix: "slashChineseCode",
    afterPrefix: "After slash Chinese code block"
  });
  const slashChineseExplicitCodeBlock = await exerciseSlashCodeBlock(page, fixture, viewport, {
    command: "/代码块",
    testLabel: "slash Chinese explicit code block",
    codeNamePrefix: "slashChineseExplicitCode",
    afterPrefix: "After slash Chinese explicit code block"
  });
  const slashDatabaseView = await exerciseSlashDatabaseView(page, fixture, viewport);
  const slashChineseDatabaseView = await exerciseSlashDatabaseView(page, fixture, viewport, {
    command: "/数据库",
    testLabel: "slash Chinese database view",
    afterPrefix: "After slash Chinese database view"
  });
  const slashChineseViewDatabaseView = await exerciseSlashDatabaseView(page, fixture, viewport, {
    command: "/视图",
    testLabel: "slash Chinese view database view",
    afterPrefix: "After slash Chinese view database view"
  });
  const slashDbDatabaseView = await exerciseSlashDatabaseView(page, fixture, viewport, {
    command: "/db",
    testLabel: "slash db database view",
    afterPrefix: "After slash db database view"
  });
  const slashDatabaseAliasView = await exerciseSlashDatabaseView(page, fixture, viewport, {
    command: "/database",
    testLabel: "slash database alias view",
    afterPrefix: "After slash database alias view"
  });
  const slashViewAliasDatabaseView = await exerciseSlashDatabaseView(page, fixture, viewport, {
    command: "/view",
    testLabel: "slash view alias database view",
    afterPrefix: "After slash view alias database view"
  });
  const slashPageLink = await exerciseSlashPageLink(page, fixture, viewport);
  const slashPageAliasLink = await exerciseSlashPageLink(page, fixture, viewport, {
    command: "/page",
    testLabel: "slash page alias link"
  });
  const slashChinesePageLink = await exerciseSlashPageLink(page, fixture, viewport, {
    command: "/页面",
    testLabel: "slash Chinese page link"
  });
  const slashChineseLinkPageLink = await exerciseSlashPageLink(page, fixture, viewport, {
    command: "/链接",
    testLabel: "slash Chinese link page link"
  });
  const slashQuote = await exerciseSlashQuote(page, fixture, viewport);
  const slashChineseQuote = await exerciseSlashQuote(page, fixture, viewport, {
    command: "/引用",
    testLabel: "slash Chinese quote",
    quotePrefix: "Slash Chinese quote text",
    afterPrefix: "After slash Chinese quote"
  });

  await page.keyboard.press("Enter");
  const pasteText = `Pasted plain text ${viewport.name}\n- **markdown-ish paste** ${viewport.name}`;
  const pasteMode = await pasteTextIntoEditor(page, pasteText);
  await waitForEditorText(page, `Pasted plain text ${viewport.name}`, "plain text paste");
  await waitForEditorText(page, `markdown-ish paste`, "markdown-ish paste");

  await page.keyboard.press("Enter");
  const longPastedUrl = `https://example.com/lotion/editor-regression/${viewport.name}/${"long-segment-".repeat(14)}?q=${"notion-like-editor-long-paste".repeat(5)}`;
  const longPasteMode = await pasteTextIntoEditor(page, longPastedUrl);
  await waitForEditorText(page, longPastedUrl, "long URL paste");
  await assertEditorLayout(page, `normal-after-long-url-paste-${viewport.name}`);
  const longPasteMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, longPastedUrl, "long URL paste autosave");
  if (!longPasteMarkdown.includes(longPastedUrl)) {
    throw new Error(`Long URL paste did not persist exactly: ${JSON.stringify({ expected: longPastedUrl, markdown: longPasteMarkdown })}`);
  }
  const notionHtmlPaste = await exerciseNotionHtmlPaste(page, fixture, viewport);
  const notionHtmlOrderedListStartPaste = await exerciseNotionHtmlOrderedListStartPaste(page, fixture, viewport);
  const notionHtmlOrderedListItemValuePaste = await exerciseNotionHtmlOrderedListItemValuePaste(page, fixture, viewport);
  const notionHtmlNestedListPaste = await exerciseNotionHtmlNestedListPaste(page, fixture, viewport);
  const notionHtmlDetailsTogglePaste = await exerciseNotionHtmlDetailsTogglePaste(page, fixture, viewport);
  const notionHtmlParagraphBreakPaste = await exerciseNotionHtmlParagraphBreakPaste(page, fixture, viewport);
  const notionHtmlDescriptionListPaste = await exerciseNotionHtmlDescriptionListPaste(page, fixture, viewport);
  const notionHtmlKeyboardShortcutPaste = await exerciseNotionHtmlKeyboardShortcutPaste(page, fixture, viewport);
  const notionHtmlHighlightPaste = await exerciseNotionHtmlHighlightPaste(page, fixture, viewport);
  const notionHtmlUnderlinePaste = await exerciseNotionHtmlUnderlinePaste(page, fixture, viewport);
  const notionHtmlSupSubPaste = await exerciseNotionHtmlSupSubPaste(page, fixture, viewport);
  const notionHtmlColorClassPaste = await exerciseNotionHtmlColorClassPaste(page, fixture, viewport);
  const notionHtmlBlockColorClassPaste = await exerciseNotionHtmlBlockColorClassPaste(page, fixture, viewport);
  const notionHtmlListItemColorClassPaste = await exerciseNotionHtmlListItemColorClassPaste(page, fixture, viewport);
  const notionHtmlNestedListItemColorPaste = await exerciseNotionHtmlNestedListItemColorPaste(page, fixture, viewport);
  const notionHtmlCalloutBackgroundPaste = await exerciseNotionHtmlCalloutBackgroundPaste(page, fixture, viewport);
  const notionHtmlTablePaste = await exerciseNotionHtmlTablePaste(page, fixture, viewport);
  const notionHtmlQuoteCodePaste = await exerciseNotionHtmlQuoteCodePaste(page, fixture, viewport);
  const notionHtmlCodeLanguagePaste = await exerciseNotionHtmlCodeLanguagePaste(page, fixture, viewport);
  const notionHtmlCodeBrPaste = await exerciseNotionHtmlCodeBrPaste(page, fixture, viewport);
  const notionHtmlDividerPaste = await exerciseNotionHtmlDividerPaste(page, fixture, viewport);
  const notionHtmlImagePaste = await exerciseNotionHtmlImagePaste(page, fixture, viewport);
  const notionHtmlFigureCaptionPaste = await exerciseNotionHtmlFigureCaptionPaste(page, fixture, viewport);
  const notionHtmlCheckboxListPaste = await exerciseNotionHtmlCheckboxListPaste(page, fixture, viewport);
  const markdownTablePaste = await exerciseMarkdownTablePaste(page, fixture, viewport);
  const droppedAttachment = await exerciseDroppedAttachmentInsertion(page, fixture, viewport);
  const droppedImageAttachment = await exerciseDroppedImageAttachmentInsertion(page, fixture, viewport);

  await openPage(page, fixture.secondaryPageId);
  await waitForTitleValue(page, fixture.secondaryTitle);
  await openPage(page, fixture.mainPageId);
  await waitForTitleValue(page, fixture.mainTitle);
  await waitForPageMarkdown(page, fixture.mainPageId, firstToken, "page switch preserved typed text");
  await assertEditorFocused(page, "page switch restored editor focus");
  const switchContinuation = `Page switch continued typing ${viewport.name}`;
  await page.keyboard.type(`\n${switchContinuation}`);
  await waitForEditorText(page, switchContinuation, "page switch continued typing");
  await waitForPageMarkdown(page, fixture.mainPageId, switchContinuation, "page switch continued typing autosave");

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.lotion?.workspace), null, { timeout: 8_000 });
  await openPage(page, fixture.mainPageId);
  await waitForTitleValue(page, fixture.mainTitle);
  await waitForPageMarkdown(page, fixture.mainPageId, firstToken, "reload preserved typed text");
  await waitForPageMarkdown(page, fixture.mainPageId, slashHeading, "reload preserved slash heading");
  await waitForSmallTextClass(page, true, `normal page reload ${viewport.name}`);
  await assertEditorLayout(page, `normal-after-reload-${viewport.name}`);

  return {
    firstToken,
    selectionReplacement,
    mergedLine,
    switchContinuation,
    typedMs,
    markdownHeadingShortcut,
    markdownEmphasisShortcuts,
    pasteMode,
    longPasteMode,
    longPastedUrlLength: longPastedUrl.length,
    notionHtmlPaste,
    notionHtmlOrderedListStartPaste,
    notionHtmlOrderedListItemValuePaste,
    notionHtmlNestedListPaste,
    notionHtmlDetailsTogglePaste,
    notionHtmlParagraphBreakPaste,
    notionHtmlDescriptionListPaste,
    notionHtmlKeyboardShortcutPaste,
    notionHtmlHighlightPaste,
    notionHtmlUnderlinePaste,
    notionHtmlSupSubPaste,
    notionHtmlColorClassPaste,
    notionHtmlBlockColorClassPaste,
    notionHtmlListItemColorClassPaste,
    notionHtmlNestedListItemColorPaste,
    notionHtmlCalloutBackgroundPaste,
    notionHtmlTablePaste,
    notionHtmlQuoteCodePaste,
    notionHtmlCodeLanguagePaste,
    notionHtmlCodeBrPaste,
    notionHtmlDividerPaste,
    notionHtmlImagePaste,
    notionHtmlFigureCaptionPaste,
    notionHtmlCheckboxListPaste,
    markdownTablePaste,
    droppedAttachment,
    droppedImageAttachment,
    slashKeyboard,
    slashEmpty,
    slashHeading,
    slashChineseHeading,
    slashChineseHeading1,
    slashChineseHeading2,
    slashChineseHeading3,
    slashChineseBigHeading,
    slashChineseMediumHeading,
    slashChineseSmallHeading,
    slashText,
    slashChineseText,
    slashChineseBodyText,
    slashChinesePlainText,
    slashLink,
    slashUrlLink,
    slashChineseLink,
    slashImage,
    slashChineseImage,
    slashToc,
    slashChineseToc,
    slashBulletList,
    slashChineseBulletList,
    slashChineseExplicitBulletList,
    slashChineseProjectBulletList,
    markdownTaskCheckboxShortcut,
    markdownQuoteShortcut,
    markdownDividerShortcut,
    markdownBulletListShortcut,
    markdownNumberedListShortcut,
    markdownCodeFenceShortcut,
    markdownImageSyntax,
    markdownTableSyntax,
    markdownInlineLinkSyntax,
    lotionCalloutFence,
    lotionEquationFence,
    lotionIframeFence,
    lotionToggleFence,
    lotionViewFence,
    slashToggle,
    slashChineseToggle,
    slashChineseExplicitToggle,
    slashEquation,
    slashChineseEquation,
    slashChineseExplicitEquation,
    slashEmbed,
    slashChineseEmbed,
    slashChineseWebEmbed,
    slashChineseExplicitWebEmbed,
    slashChineseEmbedWeb,
    slashNumberedList,
    slashChineseNumberedList,
    slashChineseIndexNumberedList,
    slashTable,
    slashChineseTable,
    slashSpacedHintTable,
    slashTodo,
    slashChineseTodo,
    slashChineseTaskTodo,
    slashChineseTaskListTodo,
    slashChineseCheckboxTodo,
    slashDivider,
    slashChineseDivider,
    slashChineseExplicitDivider,
    slashCallout,
    slashChineseCallout,
    slashChineseAnnotationCallout,
    slashChineseExplicitCallout,
    slashCodeBlock,
    slashChineseCodeBlock,
    slashChineseExplicitCodeBlock,
    slashDatabaseView,
    slashChineseDatabaseView,
    slashChineseViewDatabaseView,
    slashDbDatabaseView,
    slashDatabaseAliasView,
    slashViewAliasDatabaseView,
    slashQuote,
    slashChineseQuote,
    slashPageLink,
    slashPageAliasLink,
    slashChinesePageLink,
    slashChineseLinkPageLink,
    markdownLinks,
    tagSearch,
    smallText,
    markdownLength: persistedMarkdown.length
  };
}

async function exerciseNotionHtmlPaste(page, fixture, viewport) {
  const stamp = `${viewport.name} ${Date.now()}`;
  const heading = `Notion pasted heading ${stamp}`;
  const strongText = `important paste ${stamp}`;
  const italicText = `soft paste ${stamp}`;
  const strikeText = `obsolete paste ${stamp}`;
  const firstItem = `Notion list item ${stamp}`;
  const linkLabel = `Notion source link ${stamp}`;
  const linkUrl = `https://example.com/notion-paste/${viewport.name}?token=${Date.now()}`;
  const afterText = `After Notion HTML paste ${stamp}`;
  const label = "Notion HTML paste";
  const plainText = [
    heading,
    `Paragraph with ${strongText}, ${italicText}, and ${strikeText}.`,
    firstItem,
    `${linkLabel} ${linkUrl}`
  ].join("\n");
  const html = `
    <div data-notion-block-id="smoke-${viewport.name}">
      <h2>${heading}</h2>
      <p>Paragraph with <strong>${strongText}</strong>, <em>${italicText}</em>, and <s>${strikeText}</s>.</p>
      <ul>
        <li>${firstItem}</li>
        <li><a href="${linkUrl}">${linkLabel}</a></li>
      </ul>
    </div>
  `;
  const expectedPieces = [
    `## ${heading}`,
    `**${strongText}**`,
    `*${italicText}*`,
    `~~${strikeText}~~`,
    `- ${firstItem}`,
    `- [${linkLabel}](${linkUrl})`
  ];

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const pasteMode = await pasteHtmlIntoEditor(page, { html, plainText });
  await waitForEditorText(page, heading, `${label} heading ${viewport.name}`);
  for (const piece of expectedPieces) {
    const markdown = await waitForPageMarkdown(page, fixture.mainPageId, piece, `${label} ${piece} ${viewport.name}`);
    if (!markdown.includes(piece)) {
      throw new Error(`${label} missing expected Markdown piece: ${JSON.stringify({ piece, markdown })}`);
    }
  }

  const headingLine = page.locator(".cm-line.cm-md-line-h2").filter({ hasText: heading }).last();
  await headingLine.waitFor({ timeout: 5_000 });
  await headingLine.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, headingLine, `${label} rendered heading ${viewport.name}`, 4);
  const renderedLink = page.locator(".cm-md-link").filter({ hasText: linkLabel }).last();
  await renderedLink.waitFor({ timeout: 5_000 });
  await renderedLink.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, renderedLink, `${label} rendered link ${viewport.name}`, 4);

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} final autosave ${viewport.name}`);
  for (const piece of [...expectedPieces, afterText]) {
    if (!finalMarkdown.includes(piece)) {
      throw new Error(`${label} final markdown missing piece: ${JSON.stringify({ piece, markdown: finalMarkdown })}`);
    }
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `notion-html-paste-${viewport.name}`, 8);
  return {
    heading,
    strongText,
    italicText,
    strikeText,
    firstItem,
    linkLabel,
    linkUrl,
    afterText,
    pasteMode
  };
}

async function exerciseNotionHtmlOrderedListStartPaste(page, fixture, viewport) {
  const stamp = `${viewport.name} ${Date.now()}`;
  const firstItem = `Notion ordered start first ${stamp}`;
  const secondItem = `Notion ordered start second ${stamp}`;
  const afterText = `After Notion HTML ordered start paste ${stamp}`;
  const label = "Notion HTML ordered list start paste";
  const html = `
    <div data-notion-block-id="ordered-start-${viewport.name}">
      <ol start="3">
        <li>${firstItem}</li>
        <li>${secondItem}</li>
      </ol>
    </div>
  `;
  const plainText = `3. ${firstItem}\n4. ${secondItem}`;
  const expectedBlock = `3. ${firstItem}\n4. ${secondItem}`;

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const pasteMode = await pasteHtmlIntoEditor(page, { html, plainText });
  await waitForEditorText(page, firstItem, `${label} first item ${viewport.name}`);
  await waitForEditorText(page, secondItem, `${label} second item ${viewport.name}`);
  const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedBlock, `${label} autosave ${viewport.name}`);
  if (!sourceMarkdown.includes(expectedBlock)) {
    throw new Error(`${label} did not preserve the ordered list start value: ${JSON.stringify({ expectedBlock, markdown: sourceMarkdown })}`);
  }

  const firstLine = page.locator(".cm-content .cm-line").filter({ hasText: firstItem }).last();
  await firstLine.waitFor({ timeout: 5_000 });
  await firstLine.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, firstLine, `${label} first line ${viewport.name}`, 4);
  const secondLine = page.locator(".cm-content .cm-line").filter({ hasText: secondItem }).last();
  await secondLine.waitFor({ timeout: 5_000 });
  await secondLine.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, secondLine, `${label} second line ${viewport.name}`, 4);

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(expectedBlock) || !finalMarkdown.includes(afterText)) {
    throw new Error(`${label} final Markdown missing ordered list or following text: ${JSON.stringify({ expectedBlock, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `notion-html-ordered-list-start-paste-${viewport.name}`, 8);
  return {
    firstItem,
    secondItem,
    afterText,
    pasteMode,
    persisted: true
  };
}

async function exerciseNotionHtmlOrderedListItemValuePaste(page, fixture, viewport) {
  const stamp = `${viewport.name} ${Date.now()}`;
  const firstItem = `Notion ordered value first ${stamp}`;
  const jumpedItem = `Notion ordered value jumped ${stamp}`;
  const followingItem = `Notion ordered value following ${stamp}`;
  const afterText = `After Notion HTML ordered value paste ${stamp}`;
  const label = "Notion HTML ordered list item value paste";
  const html = `
    <div data-notion-block-id="ordered-value-${viewport.name}">
      <ol start="3">
        <li>${firstItem}</li>
        <li value="7">${jumpedItem}</li>
        <li>${followingItem}</li>
      </ol>
    </div>
  `;
  const plainText = `3. ${firstItem}\n7. ${jumpedItem}\n8. ${followingItem}`;
  const expectedBlock = plainText;

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const pasteMode = await pasteHtmlIntoEditor(page, { html, plainText });
  await waitForEditorText(page, firstItem, `${label} first item ${viewport.name}`);
  await waitForEditorText(page, jumpedItem, `${label} jumped item ${viewport.name}`);
  await waitForEditorText(page, followingItem, `${label} following item ${viewport.name}`);
  const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedBlock, `${label} autosave ${viewport.name}`);
  if (!sourceMarkdown.includes(expectedBlock)) {
    throw new Error(`${label} did not preserve the ordered list item value: ${JSON.stringify({ expectedBlock, markdown: sourceMarkdown })}`);
  }

  for (const [name, text] of [
    ["first", firstItem],
    ["jumped", jumpedItem],
    ["following", followingItem]
  ]) {
    const line = page.locator(".cm-content .cm-line").filter({ hasText: text }).last();
    await line.waitFor({ timeout: 5_000 });
    await line.scrollIntoViewIfNeeded();
    await nextAnimationFrame(page);
    await assertIntersectsViewport(page, line, `${label} ${name} line ${viewport.name}`, 4);
  }

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(expectedBlock) || !finalMarkdown.includes(afterText)) {
    throw new Error(`${label} final Markdown missing ordered list or following text: ${JSON.stringify({ expectedBlock, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `notion-html-ordered-list-item-value-paste-${viewport.name}`, 8);
  return {
    firstItem,
    jumpedItem,
    followingItem,
    afterText,
    pasteMode,
    persisted: true
  };
}

async function exerciseNotionHtmlNestedListPaste(page, fixture, viewport) {
  const stamp = `${viewport.name} ${Date.now()}`;
  const parentItem = `Notion nested parent ${stamp}`;
  const childItem = `Notion nested child ${stamp}`;
  const orderedChild = `Notion nested ordered ${stamp}`;
  const siblingItem = `Notion nested sibling ${stamp}`;
  const afterText = `After Notion HTML nested list paste ${stamp}`;
  const label = "Notion HTML nested list paste";
  const html = `
    <div data-notion-block-id="nested-list-${viewport.name}">
      <ul>
        <li>${parentItem}
          <ul>
            <li>${childItem}
              <ol start="4">
                <li>${orderedChild}</li>
              </ol>
            </li>
          </ul>
        </li>
        <li>${siblingItem}</li>
      </ul>
    </div>
  `;
  const plainText = [
    `- ${parentItem}`,
    `  - ${childItem}`,
    `    4. ${orderedChild}`,
    `- ${siblingItem}`
  ].join("\n");
  const expectedBlock = plainText;

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const pasteMode = await pasteHtmlIntoEditor(page, { html, plainText });
  for (const [name, text] of [
    ["parent", parentItem],
    ["child", childItem],
    ["ordered child", orderedChild],
    ["sibling", siblingItem]
  ]) {
    await waitForEditorText(page, text, `${label} ${name} ${viewport.name}`);
  }
  const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedBlock, `${label} autosave ${viewport.name}`);
  if (!sourceMarkdown.includes(expectedBlock)) {
    throw new Error(`${label} did not preserve nested list Markdown: ${JSON.stringify({ expectedBlock, markdown: sourceMarkdown })}`);
  }

  for (const [name, text] of [
    ["parent", parentItem],
    ["child", childItem],
    ["ordered child", orderedChild],
    ["sibling", siblingItem]
  ]) {
    const line = page.locator(".cm-content .cm-line").filter({ hasText: text }).last();
    await line.waitFor({ timeout: 5_000 });
    await line.scrollIntoViewIfNeeded();
    await nextAnimationFrame(page);
    await assertIntersectsViewport(page, line, `${label} ${name} line ${viewport.name}`, 4);
  }

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(expectedBlock) || !finalMarkdown.includes(afterText)) {
    throw new Error(`${label} final Markdown missing nested list or following text: ${JSON.stringify({ expectedBlock, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `notion-html-nested-list-paste-${viewport.name}`, 8);
  return {
    parentItem,
    childItem,
    orderedChild,
    siblingItem,
    afterText,
    pasteMode,
    persisted: true
  };
}

async function exerciseNotionHtmlDetailsTogglePaste(page, fixture, viewport) {
  const stamp = `${viewport.name} ${Date.now()}`;
  const summary = `Notion details summary ${stamp}`;
  const bodyText = `Notion details body ${stamp}`;
  const bodyListItem = `Notion details nested item ${stamp}`;
  const afterText = `After Notion HTML details paste ${stamp}`;
  const label = "Notion HTML details toggle paste";
  const html = `
    <details open data-notion-block-id="details-toggle-${viewport.name}">
      <summary>${summary}</summary>
      <p>${bodyText}</p>
      <ul>
        <li>${bodyListItem}</li>
      </ul>
    </details>
  `;
  const plainText = `${summary}\n${bodyText}\n- ${bodyListItem}`;
  const expectedBlock = [
    "```lotion-toggle",
    `summary: ${summary}`,
    "open: true",
    "---",
    bodyText,
    "",
    `- ${bodyListItem}`,
    "```"
  ].join("\n");

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const pasteMode = await pasteHtmlIntoEditor(page, { html, plainText });
  const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedBlock, `${label} autosave ${viewport.name}`);
  if (!sourceMarkdown.includes(expectedBlock)) {
    throw new Error(`${label} did not persist the expected toggle fence: ${JSON.stringify({ expectedBlock, markdown: sourceMarkdown })}`);
  }

  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  await moveToDocumentEnd(page);
  await nextAnimationFrame(page);
  await nextAnimationFrame(page);

  const toggleWidget = page.locator(".cm-md-toggle-widget-outer").last();
  await toggleWidget.waitFor({ timeout: 8_000 });
  await toggleWidget.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, toggleWidget, `${label} widget ${viewport.name}`, 4);
  const rendered = await toggleWidget.evaluate((element) => {
    const summaryText = element.querySelector(".cm-md-toggle-summary-text");
    const body = element.querySelector(".cm-md-toggle-body");
    return {
      summary: summaryText?.textContent?.trim() ?? "",
      bodyText: body?.textContent ?? "",
      expanded: element.querySelector(".cm-md-toggle-disclosure")?.getAttribute("aria-expanded") ?? "",
      bodyHidden: Boolean(body instanceof HTMLElement && body.hidden),
      hasEditSource: Boolean(element.querySelector(".cm-md-edit-source"))
    };
  });
  if (rendered.summary !== summary || !rendered.bodyText.includes(bodyText) || !rendered.bodyText.includes(bodyListItem) || rendered.expanded !== "true" || rendered.bodyHidden || rendered.hasEditSource) {
    throw new Error(`${label} widget did not render expected content: ${JSON.stringify(rendered)}`);
  }

  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(expectedBlock) || !finalMarkdown.includes(afterText)) {
    throw new Error(`${label} final Markdown missing toggle fence or following text: ${JSON.stringify({ expectedBlock, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `notion-html-details-toggle-paste-${viewport.name}`, 8);
  return {
    summary,
    bodyText,
    bodyListItem,
    afterText,
    pasteMode,
    rendered: true
  };
}

async function exerciseNotionHtmlParagraphBreakPaste(page, fixture, viewport) {
  const stamp = `${viewport.name} ${Date.now()}`;
  const firstLine = `Notion paragraph break first ${stamp}`;
  const secondLine = `Notion paragraph break second ${stamp}`;
  const afterText = `After Notion HTML paragraph break paste ${stamp}`;
  const label = "Notion HTML paragraph break paste";
  const html = `
    <div data-notion-block-id="paragraph-break-${viewport.name}">
      <p>${firstLine}<br>${secondLine}</p>
    </div>
  `;
  const plainText = `${firstLine}\n${secondLine}`;
  const expectedBlock = plainText;

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const pasteMode = await pasteHtmlIntoEditor(page, { html, plainText });
  await waitForEditorText(page, firstLine, `${label} first line ${viewport.name}`);
  await waitForEditorText(page, secondLine, `${label} second line ${viewport.name}`);
  const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedBlock, `${label} autosave ${viewport.name}`);
  if (!sourceMarkdown.includes(expectedBlock) || sourceMarkdown.includes(`${firstLine} ${secondLine}`)) {
    throw new Error(`${label} did not preserve the paragraph line break: ${JSON.stringify({ expectedBlock, markdown: sourceMarkdown })}`);
  }

  for (const [name, text] of [
    ["first", firstLine],
    ["second", secondLine]
  ]) {
    const line = page.locator(".cm-content .cm-line").filter({ hasText: text }).last();
    await line.waitFor({ timeout: 5_000 });
    await line.scrollIntoViewIfNeeded();
    await nextAnimationFrame(page);
    await assertIntersectsViewport(page, line, `${label} ${name} line ${viewport.name}`, 4);
  }

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(expectedBlock) || !finalMarkdown.includes(afterText)) {
    throw new Error(`${label} final Markdown missing paragraph break or following text: ${JSON.stringify({ expectedBlock, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `notion-html-paragraph-break-paste-${viewport.name}`, 8);
  return {
    firstLine,
    secondLine,
    afterText,
    pasteMode,
    persisted: true
  };
}

async function exerciseNotionHtmlDescriptionListPaste(page, fixture, viewport) {
  const stamp = `${viewport.name} ${Date.now()}`;
  const firstTerm = `Notion description term ${stamp}`;
  const firstDefinition = `Notion description definition ${stamp}`;
  const secondTerm = `Notion description second term ${stamp}`;
  const secondDefinition = `Notion description second definition ${stamp}`;
  const afterText = `After Notion HTML description list paste ${stamp}`;
  const label = "Notion HTML description list paste";
  const html = `
    <div data-notion-block-id="description-list-${viewport.name}">
      <dl>
        <dt>${firstTerm}</dt>
        <dd>${firstDefinition}</dd>
        <dt>${secondTerm}</dt>
        <dd><p>${secondDefinition}</p></dd>
      </dl>
    </div>
  `;
  const plainText = `${firstTerm}\n${firstDefinition}\n${secondTerm}\n${secondDefinition}`;
  const expectedBlock = [
    `- **${firstTerm}**: ${firstDefinition}`,
    `- **${secondTerm}**: ${secondDefinition}`
  ].join("\n");

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const pasteMode = await pasteHtmlIntoEditor(page, { html, plainText });
  for (const text of [firstTerm, firstDefinition, secondTerm, secondDefinition]) {
    await waitForEditorText(page, text, `${label} ${text} ${viewport.name}`);
  }
  const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedBlock, `${label} autosave ${viewport.name}`);
  if (!sourceMarkdown.includes(expectedBlock) || sourceMarkdown.includes(`${firstTerm}${firstDefinition}`)) {
    throw new Error(`${label} did not preserve readable description-list Markdown: ${JSON.stringify({ expectedBlock, markdown: sourceMarkdown })}`);
  }

  for (const [name, text] of [
    ["first term", firstTerm],
    ["first definition", firstDefinition],
    ["second term", secondTerm],
    ["second definition", secondDefinition]
  ]) {
    const line = page.locator(".cm-content .cm-line").filter({ hasText: text }).last();
    await line.waitFor({ timeout: 5_000 });
    await line.scrollIntoViewIfNeeded();
    await nextAnimationFrame(page);
    await assertIntersectsViewport(page, line, `${label} ${name} line ${viewport.name}`, 4);
  }

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(expectedBlock) || !finalMarkdown.includes(afterText)) {
    throw new Error(`${label} final Markdown missing description list or following text: ${JSON.stringify({ expectedBlock, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `notion-html-description-list-paste-${viewport.name}`, 8);
  return {
    firstTerm,
    firstDefinition,
    secondTerm,
    secondDefinition,
    afterText,
    pasteMode,
    persisted: true
  };
}

async function exerciseNotionHtmlKeyboardShortcutPaste(page, fixture, viewport) {
  const stamp = `${viewport.name} ${Date.now()}`;
  const introText = `Notion keyboard shortcut ${stamp}`;
  const firstKey = "Cmd";
  const secondKey = "K";
  const afterText = `After Notion HTML keyboard paste ${stamp}`;
  const label = "Notion HTML keyboard shortcut paste";
  const html = `
    <p data-notion-block-id="keyboard-shortcut-${viewport.name}">
      ${introText}: Press <kbd>${firstKey}</kbd> + <kbd>${secondKey}</kbd> to search
    </p>
  `;
  const plainText = `${introText}: Press ${firstKey} + ${secondKey} to search`;
  const expectedLine = `${introText}: Press \`${firstKey}\` + \`${secondKey}\` to search`;

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const pasteMode = await pasteHtmlIntoEditor(page, { html, plainText });
  await waitForEditorText(page, introText, `${label} intro ${viewport.name}`);
  const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedLine, `${label} autosave ${viewport.name}`);
  if (!sourceMarkdown.includes(expectedLine) || sourceMarkdown.includes(`Press ${firstKey} + ${secondKey}`)) {
    throw new Error(`${label} did not persist keyboard keys as inline code: ${JSON.stringify({ expectedLine, markdown: sourceMarkdown })}`);
  }

  const line = page.locator(".cm-content .cm-line").filter({ hasText: introText }).last();
  await line.waitFor({ timeout: 5_000 });
  await line.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, line, `${label} line ${viewport.name}`, 4);
  const rendered = await line.evaluate((element) => ({
    text: element.textContent ?? "",
    codeTexts: Array.from(element.querySelectorAll(".cm-md-inline-code")).map((node) => node.textContent ?? "")
  }));
  if (!rendered.codeTexts.includes(firstKey) || !rendered.codeTexts.includes(secondKey)) {
    throw new Error(`${label} did not render pasted keys as inline code: ${JSON.stringify(rendered)}`);
  }

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(expectedLine) || !finalMarkdown.includes(afterText)) {
    throw new Error(`${label} final Markdown missing shortcut line or following text: ${JSON.stringify({ expectedLine, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `notion-html-keyboard-shortcut-paste-${viewport.name}`, 8);
  return {
    introText,
    firstKey,
    secondKey,
    afterText,
    pasteMode,
    persisted: true,
    rendered
  };
}

async function exerciseNotionHtmlHighlightPaste(page, fixture, viewport) {
  const stamp = `${viewport.name} ${Date.now()}`;
  const introText = `Notion highlighted note ${stamp}`;
  const highlightedText = `highlighted decision ${stamp}`;
  const styledText = `styled highlight ${stamp}`;
  const afterText = `After Notion HTML highlight paste ${stamp}`;
  const label = "Notion HTML highlight paste";
  const html = `
    <p data-notion-block-id="highlight-${viewport.name}">
      ${introText}: <mark>${highlightedText}</mark> and <span style="background-color: rgb(255, 242, 184);">${styledText}</span>
    </p>
  `;
  const plainText = `${introText}: ${highlightedText} and ${styledText}`;
  const expectedLine = `${introText}: <mark>${highlightedText}</mark> and <mark>${styledText}</mark>`;

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const pasteMode = await pasteHtmlIntoEditor(page, { html, plainText });
  await waitForEditorText(page, introText, `${label} intro ${viewport.name}`);
  const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedLine, `${label} autosave ${viewport.name}`);
  if (!sourceMarkdown.includes(expectedLine) || sourceMarkdown.includes(`${introText}: ${highlightedText} and ${styledText}`)) {
    throw new Error(`${label} did not persist highlighted text as safe mark tags: ${JSON.stringify({ expectedLine, markdown: sourceMarkdown })}`);
  }

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  const line = page.locator(".cm-content .cm-line").filter({ hasText: introText }).last();
  await line.waitFor({ timeout: 5_000 });
  await line.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, line, `${label} line ${viewport.name}`, 4);
  const rendered = await line.evaluate((element) => ({
    text: element.textContent ?? "",
    highlightTexts: Array.from(element.querySelectorAll(".cm-md-highlight")).map((node) => node.textContent ?? ""),
    markerTexts: Array.from(element.querySelectorAll(".cm-md-marker")).map((node) => node.textContent ?? "")
  }));
  if (!rendered.highlightTexts.includes(highlightedText) || !rendered.highlightTexts.includes(styledText)) {
    throw new Error(`${label} did not render pasted highlights: ${JSON.stringify(rendered)}`);
  }
  if (rendered.markerTexts.some((text) => /<\/?mark/i.test(text))) {
    throw new Error(`${label} leaked inactive mark source markers: ${JSON.stringify(rendered)}`);
  }

  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(expectedLine) || !finalMarkdown.includes(afterText)) {
    throw new Error(`${label} final Markdown missing highlight line or following text: ${JSON.stringify({ expectedLine, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `notion-html-highlight-paste-${viewport.name}`, 8);
  return {
    introText,
    highlightedText,
    styledText,
    afterText,
    pasteMode,
    persisted: true,
    rendered
  };
}

async function exerciseNotionHtmlUnderlinePaste(page, fixture, viewport) {
  const stamp = `${viewport.name} ${Date.now()}`;
  const introText = `Notion underlined note ${stamp}`;
  const underlinedText = `underlined action ${stamp}`;
  const insertedText = `inserted underline ${stamp}`;
  const afterText = `After Notion HTML underline paste ${stamp}`;
  const label = "Notion HTML underline paste";
  const html = `
    <p data-notion-block-id="underline-${viewport.name}">
      ${introText}: <u>${underlinedText}</u> and <ins>${insertedText}</ins>
    </p>
  `;
  const plainText = `${introText}: ${underlinedText} and ${insertedText}`;
  const expectedLine = `${introText}: <u>${underlinedText}</u> and <u>${insertedText}</u>`;

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const pasteMode = await pasteHtmlIntoEditor(page, { html, plainText });
  await waitForEditorText(page, introText, `${label} intro ${viewport.name}`);
  const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedLine, `${label} autosave ${viewport.name}`);
  if (!sourceMarkdown.includes(expectedLine) || sourceMarkdown.includes(`${introText}: ${underlinedText} and ${insertedText}`)) {
    throw new Error(`${label} did not persist underline text as safe u tags: ${JSON.stringify({ expectedLine, markdown: sourceMarkdown })}`);
  }

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  const line = page.locator(".cm-content .cm-line").filter({ hasText: introText }).last();
  await line.waitFor({ timeout: 5_000 });
  await line.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, line, `${label} line ${viewport.name}`, 4);
  const rendered = await line.evaluate((element) => ({
    text: element.textContent ?? "",
    underlineTexts: Array.from(element.querySelectorAll(".cm-md-underline")).map((node) => node.textContent ?? ""),
    markerTexts: Array.from(element.querySelectorAll(".cm-md-marker")).map((node) => node.textContent ?? "")
  }));
  if (!rendered.underlineTexts.includes(underlinedText) || !rendered.underlineTexts.includes(insertedText)) {
    throw new Error(`${label} did not render pasted underline text: ${JSON.stringify(rendered)}`);
  }
  if (rendered.markerTexts.some((text) => /<\/?u/i.test(text))) {
    throw new Error(`${label} leaked inactive underline source markers: ${JSON.stringify(rendered)}`);
  }

  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(expectedLine) || !finalMarkdown.includes(afterText)) {
    throw new Error(`${label} final Markdown missing underline line or following text: ${JSON.stringify({ expectedLine, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `notion-html-underline-paste-${viewport.name}`, 8);
  return {
    introText,
    underlinedText,
    insertedText,
    afterText,
    pasteMode,
    persisted: true,
    rendered
  };
}

async function exerciseNotionHtmlSupSubPaste(page, fixture, viewport) {
  const stamp = `${viewport.name} ${Date.now()}`;
  const introText = `Notion script note ${stamp}`;
  const superscriptText = `sup note ${stamp}`;
  const subscriptText = `sub note ${stamp}`;
  const afterText = `After Notion HTML sup sub paste ${stamp}`;
  const label = "Notion HTML sup/sub paste";
  const html = `
    <p data-notion-block-id="script-${viewport.name}">
      ${introText}: x<sup>${superscriptText}</sup> and H<sub>${subscriptText}</sub>
    </p>
  `;
  const plainText = `${introText}: x${superscriptText} and H${subscriptText}`;
  const expectedLine = `${introText}: x<sup>${superscriptText}</sup> and H<sub>${subscriptText}</sub>`;

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const pasteMode = await pasteHtmlIntoEditor(page, { html, plainText });
  await waitForEditorText(page, introText, `${label} intro ${viewport.name}`);
  const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedLine, `${label} autosave ${viewport.name}`);
  if (!sourceMarkdown.includes(expectedLine) || sourceMarkdown.includes(`${introText}: x${superscriptText} and H${subscriptText}`)) {
    throw new Error(`${label} did not persist script text as safe HTML tags: ${JSON.stringify({ expectedLine, markdown: sourceMarkdown })}`);
  }

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  const line = page.locator(".cm-content .cm-line").filter({ hasText: introText }).last();
  await line.waitFor({ timeout: 5_000 });
  await line.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, line, `${label} line ${viewport.name}`, 4);
  const rendered = await line.evaluate((element) => ({
    text: element.textContent ?? "",
    superscriptTexts: Array.from(element.querySelectorAll(".cm-md-superscript")).map((node) => node.textContent ?? ""),
    subscriptTexts: Array.from(element.querySelectorAll(".cm-md-subscript")).map((node) => node.textContent ?? ""),
    markerTexts: Array.from(element.querySelectorAll(".cm-md-marker")).map((node) => node.textContent ?? "")
  }));
  if (!rendered.superscriptTexts.includes(superscriptText) || !rendered.subscriptTexts.includes(subscriptText)) {
    throw new Error(`${label} did not render pasted script text: ${JSON.stringify(rendered)}`);
  }
  if (rendered.markerTexts.some((text) => /<\/?(?:sup|sub)/i.test(text))) {
    throw new Error(`${label} leaked inactive script source markers: ${JSON.stringify(rendered)}`);
  }

  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(expectedLine) || !finalMarkdown.includes(afterText)) {
    throw new Error(`${label} final Markdown missing script line or following text: ${JSON.stringify({ expectedLine, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `notion-html-sup-sub-paste-${viewport.name}`, 8);
  return {
    introText,
    superscriptText,
    subscriptText,
    afterText,
    pasteMode,
    persisted: true,
    rendered
  };
}

async function exerciseNotionHtmlColorClassPaste(page, fixture, viewport) {
  const stamp = `${viewport.name} ${Date.now()}`;
  const introText = `Notion color note ${stamp}`;
  const foregroundText = `red foreground ${stamp}`;
  const backgroundText = `blue background ${stamp}`;
  const highlightText = `yellow highlight ${stamp}`;
  const afterText = `After Notion HTML color class paste ${stamp}`;
  const label = "Notion HTML color class paste";
  const html = `<p data-notion-block-id="color-${viewport.name}">${introText}: <span class="block-color-red">${foregroundText}</span> <span class="block-color-blue_background">${backgroundText}</span> <mark class="highlight-yellow">${highlightText}</mark></p>`;
  const plainText = `${introText}: ${foregroundText} ${backgroundText} ${highlightText}`;
  const expectedLine = `${introText}: <span data-lotion-color="red">${foregroundText}</span> <span data-lotion-bg="blue">${backgroundText}</span> <span data-lotion-bg="yellow">${highlightText}</span>`;

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const pasteMode = await pasteHtmlIntoEditor(page, { html, plainText });
  await waitForEditorText(page, introText, `${label} intro ${viewport.name}`);
  const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedLine, `${label} autosave ${viewport.name}`);
  if (!sourceMarkdown.includes(expectedLine) || sourceMarkdown.includes(plainText)) {
    throw new Error(`${label} did not persist Notion color classes as safe color spans: ${JSON.stringify({ expectedLine, markdown: sourceMarkdown })}`);
  }

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  const line = page.locator(".cm-content .cm-line").filter({ hasText: introText }).last();
  await line.waitFor({ timeout: 5_000 });
  await line.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, line, `${label} line ${viewport.name}`, 4);
  const rendered = await line.evaluate((element) => ({
    text: element.textContent ?? "",
    foregroundTexts: Array.from(element.querySelectorAll(".cm-md-notion-color-red")).map((node) => node.textContent ?? ""),
    backgroundTexts: Array.from(element.querySelectorAll(".cm-md-notion-bg-blue, .cm-md-notion-bg-yellow")).map((node) => node.textContent ?? ""),
    markerTexts: Array.from(element.querySelectorAll(".cm-md-marker")).map((node) => node.textContent ?? "")
  }));
  if (!rendered.foregroundTexts.includes(foregroundText)
    || !rendered.backgroundTexts.includes(backgroundText)
    || !rendered.backgroundTexts.includes(highlightText)) {
    throw new Error(`${label} did not render pasted Notion color classes with color decorations: ${JSON.stringify(rendered)}`);
  }
  if (rendered.markerTexts.some((text) => /<\/?span|data-lotion-(?:color|bg)/i.test(text))) {
    throw new Error(`${label} leaked inactive color span source markers: ${JSON.stringify(rendered)}`);
  }

  await selectEditorTextWithSearch(page, highlightText);
  const selectedHighlight = await line.evaluate((element, expectedHighlight) => {
    const target = Array.from(element.querySelectorAll(".cm-md-notion-bg-yellow"))
      .find((node) => (node.textContent ?? "").includes(expectedHighlight));
    const style = target ? getComputedStyle(target) : null;
    return {
      found: Boolean(target),
      editorHasSelection: Boolean(element.closest(".cm-editor")?.classList.contains("cm-md-has-selection")),
      backgroundColor: style?.backgroundColor ?? "",
      selectedText: window.__lotionEditorSelectionText ?? ""
    };
  }, highlightText);
  if (!selectedHighlight.found
    || !selectedHighlight.editorHasSelection
    || !selectedHighlight.selectedText.includes(highlightText)
    || !/^(?:transparent|rgba?\(0,\s*0,\s*0(?:,\s*0)?\))$/.test(selectedHighlight.backgroundColor)) {
    throw new Error(`${label} selected highlight should not obscure the native selection: ${JSON.stringify(selectedHighlight)}`);
  }

  await page.keyboard.press("Escape");
  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(expectedLine) || !finalMarkdown.includes(afterText)) {
    throw new Error(`${label} final Markdown missing color span line or following text: ${JSON.stringify({ expectedLine, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `notion-html-color-class-paste-${viewport.name}`, 8);
  return {
    introText,
    foregroundText,
    backgroundText,
    highlightText,
    afterText,
    pasteMode,
    persisted: true,
    rendered
  };
}

async function exerciseNotionHtmlBlockColorClassPaste(page, fixture, viewport) {
  const stamp = `${viewport.name} ${Date.now()}`;
  const foregroundText = `Notion block foreground ${stamp}`;
  const backgroundText = `Notion block background ${stamp}`;
  const headingText = `Notion block colored heading ${stamp}`;
  const afterText = `After Notion HTML block color class paste ${stamp}`;
  const label = "Notion HTML block color class paste";
  const html = [
    `<p class="block-color-green" data-notion-block-id="block-fg-${viewport.name}">${foregroundText}</p>`,
    `<p class="block-color-purple_background" data-notion-block-id="block-bg-${viewport.name}">${backgroundText}</p>`,
    `<h2 class="block-color-blue_background" data-notion-block-id="block-heading-${viewport.name}">${headingText}</h2>`
  ].join("");
  const plainText = [foregroundText, backgroundText, headingText].join("\n");
  const expectedForegroundLine = `<span data-lotion-color="green">${foregroundText}</span>`;
  const expectedBackgroundLine = `<span data-lotion-bg="purple">${backgroundText}</span>`;
  const expectedHeadingLine = `## <span data-lotion-bg="blue">${headingText}</span>`;

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const pasteMode = await pasteHtmlIntoEditor(page, { html, plainText });
  await waitForEditorText(page, foregroundText, `${label} foreground ${viewport.name}`);
  await waitForEditorText(page, headingText, `${label} heading ${viewport.name}`);
  const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedHeadingLine, `${label} autosave ${viewport.name}`);
  const expectedLines = [expectedForegroundLine, expectedBackgroundLine, expectedHeadingLine];
  const sourceLines = sourceMarkdown.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  for (const expectedLine of expectedLines) {
    if (!sourceMarkdown.includes(expectedLine)) {
      throw new Error(`${label} missing expected safe color wrapper: ${JSON.stringify({ expectedLine, markdown: sourceMarkdown })}`);
    }
  }
  for (const unwrappedLine of [foregroundText, backgroundText, `## ${headingText}`]) {
    if (sourceLines.includes(unwrappedLine)) {
      throw new Error(`${label} persisted an unwrapped colored block: ${JSON.stringify({ unwrappedLine, markdown: sourceMarkdown })}`);
    }
  }

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  const foregroundLine = page.locator(".cm-content .cm-line").filter({ hasText: foregroundText }).last();
  const backgroundLine = page.locator(".cm-content .cm-line").filter({ hasText: backgroundText }).last();
  const headingLine = page.locator(".cm-content .cm-line").filter({ hasText: headingText }).last();
  await foregroundLine.waitFor({ timeout: 5_000 });
  await backgroundLine.waitFor({ timeout: 5_000 });
  await headingLine.waitFor({ timeout: 5_000 });
  await headingLine.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, headingLine, `${label} heading line ${viewport.name}`, 4);
  const rendered = {
    foreground: await colorLineDecorationState(foregroundLine),
    background: await colorLineDecorationState(backgroundLine),
    heading: await colorLineDecorationState(headingLine)
  };
  if (!rendered.foreground.colorTexts.includes(foregroundText)
    || !rendered.background.bgTexts.includes(backgroundText)
    || !rendered.heading.bgTexts.includes(headingText)) {
    throw new Error(`${label} did not render block colors with expected decorations: ${JSON.stringify(rendered)}`);
  }
  for (const [key, state] of Object.entries(rendered)) {
    if (state.markerTexts.some((text) => /<\/?span|data-lotion-(?:color|bg)/i.test(text))) {
      throw new Error(`${label} leaked inactive ${key} color span source markers: ${JSON.stringify(state)}`);
    }
  }

  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} final autosave ${viewport.name}`);
  if (!expectedLines.every((expectedLine) => finalMarkdown.includes(expectedLine)) || !finalMarkdown.includes(afterText)) {
    throw new Error(`${label} final Markdown missing colored block lines or following text: ${JSON.stringify({ expectedLines, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `notion-html-block-color-class-paste-${viewport.name}`, 8);
  return {
    foregroundText,
    backgroundText,
    headingText,
    afterText,
    pasteMode,
    persisted: true,
    rendered
  };
}

async function colorLineDecorationState(line) {
  return line.evaluate((element) => ({
    text: element.textContent ?? "",
    colorTexts: Array.from(element.querySelectorAll(".cm-md-notion-color-green, .cm-md-notion-color-red")).map((node) => node.textContent ?? ""),
    bgTexts: Array.from(element.querySelectorAll(".cm-md-notion-bg-blue, .cm-md-notion-bg-yellow, .cm-md-notion-bg-purple")).map((node) => node.textContent ?? ""),
    markerTexts: Array.from(element.querySelectorAll(".cm-md-marker")).map((node) => node.textContent ?? "")
  }));
}

async function exerciseNotionHtmlListItemColorClassPaste(page, fixture, viewport) {
  const stamp = `${viewport.name} ${Date.now()}`;
  const bulletText = `Notion colored bullet ${stamp}`;
  const orderedText = `Notion colored ordered ${stamp}`;
  const afterText = `After Notion HTML list item color class paste ${stamp}`;
  const label = "Notion HTML list item color class paste";
  const html = [
    `<ul data-notion-block-id="list-color-${viewport.name}"><li class="block-color-red">${bulletText}</li></ul>`,
    `<ol data-notion-block-id="ordered-list-color-${viewport.name}"><li class="block-color-green_background">${orderedText}</li></ol>`
  ].join("");
  const plainText = `${bulletText}\n${orderedText}`;
  const expectedBulletLine = `- <span data-lotion-color="red">${bulletText}</span>`;
  const expectedOrderedLine = `1. <span data-lotion-bg="green">${orderedText}</span>`;

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const pasteMode = await pasteHtmlIntoEditor(page, { html, plainText });
  await waitForEditorText(page, bulletText, `${label} bullet ${viewport.name}`);
  await waitForEditorText(page, orderedText, `${label} ordered ${viewport.name}`);
  const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedOrderedLine, `${label} autosave ${viewport.name}`);
  if (!sourceMarkdown.includes(expectedBulletLine) || !sourceMarkdown.includes(expectedOrderedLine)) {
    throw new Error(`${label} did not persist list item colors as safe spans: ${JSON.stringify({ expectedBulletLine, expectedOrderedLine, markdown: sourceMarkdown })}`);
  }
  const sourceLines = sourceMarkdown.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (sourceLines.includes(`- ${bulletText}`) || sourceLines.includes(`1. ${orderedText}`)) {
    throw new Error(`${label} persisted unwrapped colored list items: ${JSON.stringify({ markdown: sourceMarkdown })}`);
  }

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  const bulletLine = page.locator(".cm-content .cm-line").filter({ hasText: bulletText }).last();
  const orderedLine = page.locator(".cm-content .cm-line").filter({ hasText: orderedText }).last();
  await bulletLine.waitFor({ timeout: 5_000 });
  await orderedLine.waitFor({ timeout: 5_000 });
  await orderedLine.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, orderedLine, `${label} ordered line ${viewport.name}`, 4);
  const rendered = {
    bullet: await listColorLineDecorationState(bulletLine),
    ordered: await listColorLineDecorationState(orderedLine)
  };
  if (!rendered.bullet.colorTexts.includes(bulletText) || !rendered.ordered.bgTexts.includes(orderedText)) {
    throw new Error(`${label} did not render list item colors with expected decorations: ${JSON.stringify(rendered)}`);
  }
  for (const [key, state] of Object.entries(rendered)) {
    if (state.markerTexts.some((text) => /<\/?span|data-lotion-(?:color|bg)/i.test(text))) {
      throw new Error(`${label} leaked inactive ${key} color span source markers: ${JSON.stringify(state)}`);
    }
  }

  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(expectedBulletLine) || !finalMarkdown.includes(expectedOrderedLine) || !finalMarkdown.includes(afterText)) {
    throw new Error(`${label} final Markdown missing colored list lines or following text: ${JSON.stringify({ expectedBulletLine, expectedOrderedLine, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `notion-html-list-item-color-class-paste-${viewport.name}`, 8);
  return {
    bulletText,
    orderedText,
    afterText,
    pasteMode,
    persisted: true,
    rendered
  };
}

async function listColorLineDecorationState(line) {
  return line.evaluate((element) => ({
    text: element.textContent ?? "",
    colorTexts: Array.from(element.querySelectorAll(".cm-md-notion-color-red")).map((node) => node.textContent ?? ""),
    bgTexts: Array.from(element.querySelectorAll(".cm-md-notion-bg-green")).map((node) => node.textContent ?? ""),
    markerTexts: Array.from(element.querySelectorAll(".cm-md-marker")).map((node) => node.textContent ?? "")
  }));
}

async function exerciseNotionHtmlNestedListItemColorPaste(page, fixture, viewport) {
  const stamp = `${viewport.name} ${Date.now()}`;
  const parentItem = `Notion nested color parent ${stamp}`;
  const childItem = `Notion nested color child ${stamp}`;
  const orderedChild = `Notion nested color ordered ${stamp}`;
  const siblingItem = `Notion nested color sibling ${stamp}`;
  const afterText = `After Notion HTML nested list item color paste ${stamp}`;
  const label = "Notion HTML nested list item color paste";
  const html = `
    <div data-notion-block-id="nested-list-color-${viewport.name}">
      <ul>
        <li>${parentItem}
          <ul>
            <li class="block-color-yellow_background">${childItem}
              <ol start="4">
                <li class="block-color-red">${orderedChild}</li>
              </ol>
            </li>
          </ul>
        </li>
        <li>${siblingItem}</li>
      </ul>
    </div>
  `;
  const plainText = [
    `- ${parentItem}`,
    `  - ${childItem}`,
    `    4. ${orderedChild}`,
    `- ${siblingItem}`
  ].join("\n");
  const expectedBlock = [
    `- ${parentItem}`,
    `  - <span data-lotion-bg="yellow">${childItem}</span>`,
    `    4. <span data-lotion-color="red">${orderedChild}</span>`,
    `- ${siblingItem}`
  ].join("\n");

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const pasteMode = await pasteHtmlIntoEditor(page, { html, plainText });
  for (const [name, text] of [
    ["parent", parentItem],
    ["child", childItem],
    ["ordered child", orderedChild],
    ["sibling", siblingItem]
  ]) {
    await waitForEditorText(page, text, `${label} ${name} ${viewport.name}`);
  }
  const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedBlock, `${label} autosave ${viewport.name}`);
  if (!sourceMarkdown.includes(expectedBlock)) {
    throw new Error(`${label} did not preserve nested list item colors: ${JSON.stringify({ expectedBlock, markdown: sourceMarkdown })}`);
  }
  const sourceLines = sourceMarkdown.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (sourceLines.includes(`- ${childItem}`) || sourceLines.includes(`4. ${orderedChild}`)) {
    throw new Error(`${label} persisted unwrapped nested colored list items: ${JSON.stringify({ markdown: sourceMarkdown })}`);
  }

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  const childLine = page.locator(".cm-content .cm-line").filter({ hasText: childItem }).last();
  const orderedLine = page.locator(".cm-content .cm-line").filter({ hasText: orderedChild }).last();
  await childLine.waitFor({ timeout: 5_000 });
  await orderedLine.waitFor({ timeout: 5_000 });
  await orderedLine.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, orderedLine, `${label} ordered line ${viewport.name}`, 4);
  const rendered = {
    child: await nestedListColorLineDecorationState(childLine),
    ordered: await nestedListColorLineDecorationState(orderedLine)
  };
  if (!rendered.child.bgTexts.includes(childItem) || !rendered.ordered.colorTexts.includes(orderedChild)) {
    throw new Error(`${label} did not render nested list item colors with expected decorations: ${JSON.stringify(rendered)}`);
  }
  for (const [key, state] of Object.entries(rendered)) {
    if (state.markerTexts.some((text) => /<\/?span|data-lotion-(?:color|bg)/i.test(text))) {
      throw new Error(`${label} leaked inactive ${key} nested color span source markers: ${JSON.stringify(state)}`);
    }
  }

  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(expectedBlock) || !finalMarkdown.includes(afterText)) {
    throw new Error(`${label} final Markdown missing nested colored list or following text: ${JSON.stringify({ expectedBlock, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `notion-html-nested-list-item-color-paste-${viewport.name}`, 8);
  return {
    parentItem,
    childItem,
    orderedChild,
    siblingItem,
    afterText,
    pasteMode,
    persisted: true,
    rendered
  };
}

async function nestedListColorLineDecorationState(line) {
  return line.evaluate((element) => ({
    text: element.textContent ?? "",
    colorTexts: Array.from(element.querySelectorAll(".cm-md-notion-color-red")).map((node) => node.textContent ?? ""),
    bgTexts: Array.from(element.querySelectorAll(".cm-md-notion-bg-yellow")).map((node) => node.textContent ?? ""),
    markerTexts: Array.from(element.querySelectorAll(".cm-md-marker")).map((node) => node.textContent ?? "")
  }));
}

async function exerciseNotionHtmlCalloutBackgroundPaste(page, fixture, viewport) {
  const stamp = `${viewport.name} ${Date.now()}`;
  const titleText = `Notion callout heading ${stamp}`;
  const highlightText = `Notion callout highlighted body ${stamp}`;
  const afterText = `After Notion HTML callout paste ${stamp}`;
  const label = "Notion HTML callout background paste";
  const html = `
    <figure class="block-color-gray_background callout" data-notion-block-id="callout-bg-${viewport.name}" style="white-space:pre-wrap;display:flex">
      <div style="font-size:1.5em"><span class="icon">💡</span></div>
      <div style="width:100%">
        <h2><strong>${titleText}</strong></h2>
        <mark class="highlight-brown">${highlightText}</mark>
      </div>
    </figure>
  `;
  const plainText = `${titleText}\n${highlightText}`;
  const expectedBlock = [
    "```lotion-callout",
    "icon: 💡",
    "background: gray",
    "---",
    `## **${titleText}**`,
    "",
    `<span data-lotion-bg="brown">${highlightText}</span>`,
    "```"
  ].join("\n");

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const pasteMode = await pasteHtmlIntoEditor(page, { html, plainText });
  await waitForEditorText(page, titleText, `${label} heading ${viewport.name}`);
  await waitForEditorText(page, highlightText, `${label} body ${viewport.name}`);
  const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedBlock, `${label} autosave ${viewport.name}`);
  if (!sourceMarkdown.includes(expectedBlock)) {
    throw new Error(`${label} did not persist as callout fence: ${JSON.stringify({ expectedBlock, markdown: sourceMarkdown })}`);
  }

  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);

  const callout = page.locator(".cm-md-callout-widget").last();
  await callout.waitFor({ timeout: 8_000 });
  await callout.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, callout, `${label} widget ${viewport.name}`, 4);
  const rendered = await page.evaluate(({ titleText: expectedTitle, highlightText: expectedHighlight }) => {
    const widget = Array.from(document.querySelectorAll(".cm-md-callout-widget")).at(-1);
    const body = widget?.querySelector(".cm-md-callout-body");
    const icon = widget?.querySelector(".cm-md-callout-icon");
    const visibleSourceLines = Array.from(document.querySelectorAll(".cm-content .cm-line"))
      .filter((line) => /lotion-callout|background:\s*gray/i.test(line.textContent ?? ""))
      .map((line) => line.textContent ?? "");
    return {
      text: body?.textContent ?? "",
      icon: icon?.textContent ?? "",
      className: widget?.getAttribute("class") ?? "",
      hasExpectedTitle: Boolean(body?.textContent?.includes(expectedTitle)),
      hasExpectedHighlight: Boolean(body?.textContent?.includes(expectedHighlight)),
      visibleSourceLines
    };
  }, { titleText, highlightText });
  if (!rendered.hasExpectedTitle || !rendered.hasExpectedHighlight || rendered.icon.trim() !== "💡" || !rendered.className.includes("cm-md-callout-bg-gray")) {
    throw new Error(`${label} preview did not render expected body/icon/background: ${JSON.stringify(rendered)}`);
  }
  if (rendered.visibleSourceLines.length) {
    throw new Error(`${label} source remained visible after cursor left fence: ${JSON.stringify(rendered)}`);
  }

  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(expectedBlock) || !finalMarkdown.includes(afterText)) {
    throw new Error(`${label} final Markdown missing callout fence or following text: ${JSON.stringify({ expectedBlock, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `notion-html-callout-background-paste-${viewport.name}`, 8);
  return {
    titleText,
    highlightText,
    afterText,
    pasteMode,
    persisted: true,
    rendered
  };
}

async function exerciseNotionHtmlTablePaste(page, fixture, viewport) {
  const stamp = `${viewport.name} ${Date.now()}`;
  const rowName = `Notion HTML table row ${stamp}`;
  const strongValue = `HTML table value ${stamp}`;
  const afterText = `After Notion HTML table paste ${stamp}`;
  const label = "Notion HTML table paste";
  const html = `
    <table data-notion-block-id="table-${viewport.name}">
      <thead>
        <tr><th>Name</th><th>Progress</th></tr>
      </thead>
      <tbody>
        <tr><td>${rowName}</td><td><strong>${strongValue}</strong></td></tr>
      </tbody>
    </table>
  `;
  const plainText = `Name\tProgress\n${rowName}\t${strongValue}`;
  const tableSource = `| Name | Progress |\n| --- | --- |\n| ${rowName} | **${strongValue}** |`;

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const pasteMode = await pasteHtmlIntoEditor(page, { html, plainText });
  await waitForEditorText(page, rowName, `${label} row ${viewport.name}`);
  const initialMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, tableSource, `${label} autosave ${viewport.name}`);
  if (!initialMarkdown.includes(tableSource)) {
    throw new Error(`${label} source did not persist as Markdown table: ${JSON.stringify({ tableSource, markdown: initialMarkdown })}`);
  }

  await page.waitForFunction(
    ({ rowName, strongValue }) => Array.from(document.querySelectorAll(".cm-md-table-widget table"))
      .some((table) => {
        const text = table.textContent ?? "";
        return text.includes("Name") && text.includes("Progress") && text.includes(rowName) && text.includes(strongValue);
      }),
    { rowName, strongValue },
    { timeout: 8_000 }
  );
  const widget = page.locator(".cm-md-table-widget").last();
  await widget.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, widget, `${label} widget ${viewport.name}`, 4);

  const rendered = await widget.evaluate((element, expected) => {
    const table = element.querySelector("table");
    const editableCell = element.querySelector("tbody td[contenteditable='plaintext-only']");
    const text = table?.textContent ?? "";
    return {
      text,
      hasRow: text.includes(expected.rowName),
      hasStrongValue: text.includes(expected.strongValue),
      editableCellRole: editableCell?.getAttribute("role") ?? "",
      editableCellAriaLabel: editableCell?.getAttribute("aria-label") ?? ""
    };
  }, { rowName, strongValue });
  if (!rendered.text.includes("Name") || !rendered.text.includes("Progress") || !rendered.hasRow || !rendered.hasStrongValue) {
    throw new Error(`${label} widget did not render the pasted HTML table: ${JSON.stringify(rendered)}`);
  }
  if (rendered.editableCellRole !== "textbox" || rendered.editableCellAriaLabel !== "Edit table cell") {
    throw new Error(`${label} body cell should keep editable table semantics: ${JSON.stringify(rendered)}`);
  }

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(tableSource) || !finalMarkdown.includes(afterText)) {
    throw new Error(`${label} final Markdown missing pasted table or following text: ${JSON.stringify({ tableSource, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `notion-html-table-paste-${viewport.name}`, 8);
  return {
    rowName,
    strongValue,
    afterText,
    pasteMode,
    rendered: true
  };
}

async function exerciseNotionHtmlQuoteCodePaste(page, fixture, viewport) {
  const stamp = `${viewport.name} ${Date.now()}`;
  const quoteText = `Notion HTML quote ${stamp}`;
  const codeText = `const htmlPaste${viewport.name.replace(/\W/g, "")} = "${Date.now()}";`;
  const afterText = `After Notion HTML quote code paste ${stamp}`;
  const label = "Notion HTML quote/code paste";
  const html = `
    <div data-notion-block-id="quote-code-${viewport.name}">
      <blockquote>${quoteText}</blockquote>
      <pre><code>${codeText}</code></pre>
    </div>
  `;
  const plainText = `${quoteText}\n${codeText}`;
  const expectedQuote = `> ${quoteText}`;
  const expectedCodeBlock = `\`\`\`\n${codeText}\n\`\`\``;

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const pasteMode = await pasteHtmlIntoEditor(page, { html, plainText });
  await waitForEditorText(page, quoteText, `${label} quote ${viewport.name}`);
  await waitForEditorText(page, codeText, `${label} code ${viewport.name}`);

  const initialMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedCodeBlock, `${label} autosave ${viewport.name}`);
  if (!initialMarkdown.includes(expectedQuote) || !initialMarkdown.includes(expectedCodeBlock)) {
    throw new Error(`${label} source did not persist as quote and fenced code: ${JSON.stringify({ expectedQuote, expectedCodeBlock, markdown: initialMarkdown })}`);
  }

  const quoteLine = page.locator(".cm-line.cm-md-line-blockquote").filter({ hasText: quoteText }).last();
  await quoteLine.waitFor({ timeout: 5_000 });
  await quoteLine.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, quoteLine, `${label} quote preview ${viewport.name}`, 4);

  const codeLine = page.locator(".cm-line.cm-md-line-code").filter({ hasText: codeText }).last();
  await codeLine.waitFor({ timeout: 5_000 });
  await codeLine.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, codeLine, `${label} code preview ${viewport.name}`, 4);
  const fenceCount = await page.locator(".cm-line.cm-md-line-code-fence").count();
  if (fenceCount < 2) {
    const debugLines = await page.locator(".cm-content .cm-line").evaluateAll((lines) =>
      lines.slice(-12).map((line) => ({ text: line.textContent ?? "", className: line.className }))
    );
    throw new Error(`${label} did not style both pasted code fence lines: ${JSON.stringify(debugLines)}`);
  }

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(expectedQuote) || !finalMarkdown.includes(expectedCodeBlock) || !finalMarkdown.includes(afterText)) {
    throw new Error(`${label} final Markdown missing quote, code, or following text: ${JSON.stringify({ expectedQuote, expectedCodeBlock, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `notion-html-quote-code-paste-${viewport.name}`, 8);
  return {
    quoteText,
    codeText,
    afterText,
    pasteMode,
    rendered: true
  };
}

async function exerciseNotionHtmlCodeLanguagePaste(page, fixture, viewport) {
  const stamp = `${viewport.name} ${Date.now()}`;
  const language = "ts";
  const codeText = `const htmlLanguagePaste${viewport.name.replace(/\W/g, "")}: string = "${Date.now()}";`;
  const afterText = `After Notion HTML code language paste ${stamp}`;
  const label = "Notion HTML code language paste";
  const html = `
    <div data-notion-block-id="code-language-${viewport.name}">
      <pre><code class="language-${language}">${codeText}</code></pre>
    </div>
  `;
  const plainText = codeText;
  const expectedCodeBlock = `\`\`\`${language}\n${codeText}\n\`\`\``;

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const pasteMode = await pasteHtmlIntoEditor(page, { html, plainText });
  await waitForEditorText(page, codeText, `${label} code ${viewport.name}`);
  const initialMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedCodeBlock, `${label} autosave ${viewport.name}`);
  if (!initialMarkdown.includes(expectedCodeBlock)) {
    throw new Error(`${label} source did not persist as a language-tagged fenced code block: ${JSON.stringify({ expectedCodeBlock, markdown: initialMarkdown })}`);
  }

  const codeLine = page.locator(".cm-line.cm-md-line-code").filter({ hasText: codeText }).last();
  await codeLine.waitFor({ timeout: 5_000 });
  await codeLine.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, codeLine, `${label} code preview ${viewport.name}`, 4);
  const fenceCount = await page.locator(".cm-line.cm-md-line-code-fence").count();
  if (fenceCount < 2) {
    const debugLines = await page.locator(".cm-content .cm-line").evaluateAll((lines) =>
      lines.slice(-12).map((line) => ({ text: line.textContent ?? "", className: line.className }))
    );
    throw new Error(`${label} did not style both language-tagged code fence lines: ${JSON.stringify(debugLines)}`);
  }

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(expectedCodeBlock) || !finalMarkdown.includes(afterText)) {
    throw new Error(`${label} final Markdown missing language-tagged code or following text: ${JSON.stringify({ expectedCodeBlock, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `notion-html-code-language-paste-${viewport.name}`, 8);
  return {
    language,
    codeText,
    afterText,
    pasteMode,
    rendered: true
  };
}

async function exerciseNotionHtmlCodeBrPaste(page, fixture, viewport) {
  const stamp = `${viewport.name} ${Date.now()}`;
  const firstLine = `const htmlBrFirst${viewport.name.replace(/\W/g, "")} = "${Date.now()}";`;
  const secondLine = `const htmlBrSecond${viewport.name.replace(/\W/g, "")} = true;`;
  const afterText = `After Notion HTML code br paste ${stamp}`;
  const label = "Notion HTML code br paste";
  const html = `
    <div data-notion-block-id="code-br-${viewport.name}">
      <pre><code>${firstLine}<br>${secondLine}</code></pre>
    </div>
  `;
  const plainText = `${firstLine}\n${secondLine}`;
  const expectedCodeBlock = `\`\`\`\n${firstLine}\n${secondLine}\n\`\`\``;

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const pasteMode = await pasteHtmlIntoEditor(page, { html, plainText });
  await waitForEditorText(page, firstLine, `${label} first line ${viewport.name}`);
  await waitForEditorText(page, secondLine, `${label} second line ${viewport.name}`);
  const initialMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedCodeBlock, `${label} autosave ${viewport.name}`);
  if (!initialMarkdown.includes(expectedCodeBlock)) {
    throw new Error(`${label} source did not preserve code <br> line breaks: ${JSON.stringify({ expectedCodeBlock, markdown: initialMarkdown })}`);
  }

  for (const [index, codeText] of [firstLine, secondLine].entries()) {
    const codeLine = page.locator(".cm-line.cm-md-line-code").filter({ hasText: codeText }).last();
    await codeLine.waitFor({ timeout: 5_000 });
    await codeLine.scrollIntoViewIfNeeded();
    await nextAnimationFrame(page);
    await assertIntersectsViewport(page, codeLine, `${label} code line ${index + 1} ${viewport.name}`, 4);
  }

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(expectedCodeBlock) || !finalMarkdown.includes(afterText)) {
    throw new Error(`${label} final Markdown missing multiline code block or following text: ${JSON.stringify({ expectedCodeBlock, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `notion-html-code-br-paste-${viewport.name}`, 8);
  return {
    firstLine,
    secondLine,
    afterText,
    pasteMode,
    rendered: true
  };
}

async function exerciseNotionHtmlDividerPaste(page, fixture, viewport) {
  const stamp = `${viewport.name} ${Date.now()}`;
  const beforeText = `Notion HTML divider before ${stamp}`;
  const afterDividerText = `Notion HTML divider after ${stamp}`;
  const afterText = `After Notion HTML divider paste ${stamp}`;
  const label = "Notion HTML divider paste";
  const expectedBlock = `${beforeText}\n\n---\n\n${afterDividerText}`;
  const html = `
    <div data-notion-block-id="divider-${viewport.name}">
      <p>${beforeText}</p>
      <hr />
      <p>${afterDividerText}</p>
    </div>
  `;
  const plainText = `${beforeText}\n---\n${afterDividerText}`;

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const pasteMode = await pasteHtmlIntoEditor(page, { html, plainText });
  await waitForEditorText(page, beforeText, `${label} before text ${viewport.name}`);
  await waitForEditorText(page, afterDividerText, `${label} after divider text ${viewport.name}`);

  const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedBlock, `${label} autosave ${viewport.name}`);
  if (!sourceMarkdown.includes(expectedBlock)) {
    throw new Error(`${label} did not persist HTML hr as a separate Markdown divider: ${JSON.stringify({ expectedBlock, markdown: sourceMarkdown })}`);
  }

  const divider = page.locator(".cm-md-hr-widget").last();
  await divider.waitFor({ timeout: 5_000 });
  await divider.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, divider, `${label} divider preview ${viewport.name}`, 4);
  const sourceVisible = await page.evaluate(() => Array.from(document.querySelectorAll(".cm-line"))
    .some((line) => (line.textContent ?? "").trim() === "---"));
  if (sourceVisible) {
    throw new Error(`${label} raw divider source remained visible while inactive.`);
  }

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(expectedBlock) || !finalMarkdown.includes(`${afterDividerText}\n\n${afterText}`)) {
    throw new Error(`${label} final Markdown missing divider block or following text: ${JSON.stringify({ expectedBlock, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `notion-html-divider-paste-${viewport.name}`, 8);
  return {
    beforeText,
    afterDividerText,
    afterText,
    pasteMode,
    rendered: true
  };
}

async function exerciseNotionHtmlImagePaste(page, fixture, viewport) {
  const stamp = `${viewport.name} ${Date.now()}`;
  const alt = `Notion HTML image ${stamp}`;
  const caption = `Notion HTML image caption ${stamp}`;
  const afterText = `After Notion HTML image paste ${stamp}`;
  const label = "Notion HTML image paste";
  const expectedMarkdown = `![${alt}](${fixture.directImagePath})`;
  const html = `
    <div data-notion-block-id="image-${viewport.name}">
      <p><img src="${fixture.directImagePath}" alt="${alt}" /></p>
      <p>${caption}</p>
    </div>
  `;
  const plainText = `${alt}\n${caption}`;

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const pasteMode = await pasteHtmlIntoEditor(page, { html, plainText });
  await waitForEditorText(page, caption, `${label} caption ${viewport.name}`);

  const initialMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedMarkdown, `${label} autosave ${viewport.name}`);
  if (!initialMarkdown.includes(expectedMarkdown) || !initialMarkdown.includes(caption)) {
    throw new Error(`${label} did not persist Markdown image and caption: ${JSON.stringify({ expectedMarkdown, caption, markdown: initialMarkdown })}`);
  }

  const imageWidget = page.locator(".cm-md-image-widget").last();
  await imageWidget.waitFor({ timeout: 8_000 });
  await imageWidget.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, imageWidget, `${label} widget ${viewport.name}`, 4);
  const preview = await imageWidget.evaluate((widget, expected) => {
    const image = widget.querySelector("img");
    const edit = widget.querySelector(".cm-md-edit-source");
    return {
      text: widget.textContent ?? "",
      imageAlt: image?.getAttribute("alt") ?? "",
      imageSrc: image?.getAttribute("src") ?? "",
      hasEditSource: Boolean(edit),
      editSourceText: edit?.textContent?.trim() ?? "",
      editSourceOpacity: edit ? getComputedStyle(edit).opacity : "",
      sourceLeaked: (widget.textContent ?? "").includes(expected)
    };
  }, expectedMarkdown);
  if (preview.imageAlt !== alt || !preview.imageSrc.includes(fixture.directImagePath)) {
    throw new Error(`${label} preview did not render the pasted image path: ${JSON.stringify(preview)}`);
  }
  if (preview.sourceLeaked || preview.text.includes(expectedMarkdown)) {
    throw new Error(`${label} preview leaked source markdown: ${JSON.stringify(preview)}`);
  }
  if (preview.hasEditSource) {
    throw new Error(`${label} preview should keep image source hidden: ${JSON.stringify(preview)}`);
  }

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(expectedMarkdown) || !finalMarkdown.includes(caption) || !finalMarkdown.includes(afterText)) {
    throw new Error(`${label} final Markdown missing image, caption, or following text: ${JSON.stringify({ expectedMarkdown, caption, afterText, markdown: finalMarkdown })}`);
  }

  await page.waitForFunction(
    ({ expected, imageAlt, after }) => {
      const sourceVisible = Array.from(document.querySelectorAll(".cm-line"))
        .some((line) => (line.textContent ?? "").includes(expected));
      const imageVisible = Array.from(document.querySelectorAll(".cm-md-image-widget img"))
        .some((image) => image.getAttribute("alt") === imageAlt);
      const afterVisible = document.body.textContent?.includes(after);
      return !sourceVisible && imageVisible && afterVisible;
    },
    { expected: expectedMarkdown, imageAlt: alt, after: afterText },
    { timeout: 5_000 }
  );

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `notion-html-image-paste-${viewport.name}`, 8);
  return {
    alt,
    caption,
    expectedMarkdown,
    afterText,
    pasteMode,
    preview
  };
}

async function exerciseNotionHtmlFigureCaptionPaste(page, fixture, viewport) {
  const stamp = `${viewport.name} ${Date.now()}`;
  const alt = `Notion HTML figure image ${stamp}`;
  const caption = `Notion HTML figure caption ${stamp}`;
  const afterText = `After Notion HTML figure paste ${stamp}`;
  const label = "Notion HTML figure caption paste";
  const expectedMarkdown = `![${alt}](${fixture.directImagePath})`;
  const expectedBlock = `${expectedMarkdown}\n\n${caption}`;
  const html = `
    <figure data-notion-block-id="figure-${viewport.name}">
      <img src="${fixture.directImagePath}" alt="${alt}" />
      <figcaption>${caption}</figcaption>
    </figure>
  `;
  const plainText = `${alt}\n${caption}`;

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const pasteMode = await pasteHtmlIntoEditor(page, { html, plainText });
  await waitForEditorText(page, caption, `${label} caption ${viewport.name}`);

  const initialMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, caption, `${label} autosave ${viewport.name}`);
  const imageIndex = initialMarkdown.indexOf(expectedMarkdown);
  const captionIndex = initialMarkdown.indexOf(caption);
  if (imageIndex < 0 || captionIndex < 0 || imageIndex > captionIndex || !initialMarkdown.includes(expectedBlock)) {
    throw new Error(`${label} did not persist image and caption as separate blocks: ${JSON.stringify({ expectedBlock, markdown: initialMarkdown })}`);
  }

  const imageWidget = page.locator(".cm-md-image-widget").last();
  await imageWidget.waitFor({ timeout: 8_000 });
  await imageWidget.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, imageWidget, `${label} widget ${viewport.name}`, 4);
  const preview = await imageWidget.evaluate((widget, expected) => {
    const image = widget.querySelector("img");
    const edit = widget.querySelector(".cm-md-edit-source");
    return {
      text: widget.textContent ?? "",
      imageAlt: image?.getAttribute("alt") ?? "",
      imageSrc: image?.getAttribute("src") ?? "",
      hasEditSource: Boolean(edit),
      editSourceText: edit?.textContent?.trim() ?? "",
      sourceLeaked: (widget.textContent ?? "").includes(expected)
    };
  }, expectedMarkdown);
  if (preview.imageAlt !== alt || !preview.imageSrc.includes(fixture.directImagePath)) {
    throw new Error(`${label} preview did not render the pasted figure image path: ${JSON.stringify(preview)}`);
  }
  if (preview.sourceLeaked || preview.text.includes(expectedMarkdown)) {
    throw new Error(`${label} preview leaked source markdown: ${JSON.stringify(preview)}`);
  }
  if (preview.hasEditSource) {
    throw new Error(`${label} preview should keep image source hidden: ${JSON.stringify(preview)}`);
  }

  const captionLine = page.locator(".cm-line").filter({ hasText: caption }).last();
  await captionLine.waitFor({ timeout: 5_000 });
  await captionLine.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, captionLine, `${label} caption line ${viewport.name}`, 4);
  const captionState = await captionLine.evaluate((line, source) => ({
    text: line.textContent ?? "",
    includesImageSource: (line.textContent ?? "").includes(source),
    className: line.getAttribute("class") ?? ""
  }), expectedMarkdown);
  if (!captionState.text.includes(caption) || captionState.includesImageSource) {
    throw new Error(`${label} caption did not render as a separate text line: ${JSON.stringify(captionState)}`);
  }

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(expectedBlock) || !finalMarkdown.includes(afterText)) {
    throw new Error(`${label} final Markdown missing figure block or following text: ${JSON.stringify({ expectedBlock, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `notion-html-figure-caption-paste-${viewport.name}`, 8);
  return {
    alt,
    caption,
    expectedMarkdown,
    afterText,
    pasteMode,
    preview
  };
}

async function exerciseNotionHtmlCheckboxListPaste(page, fixture, viewport) {
  const stamp = `${viewport.name} ${Date.now()}`;
  const checkedText = `Notion HTML checked task ${stamp}`;
  const uncheckedText = `Notion HTML unchecked task ${stamp}`;
  const afterText = `After Notion HTML checkbox list paste ${stamp}`;
  const label = "Notion HTML checkbox list paste";
  const expectedChecked = `- [x] ${checkedText}`;
  const expectedUnchecked = `- [ ] ${uncheckedText}`;
  const html = `
    <ul data-notion-block-id="tasks-${viewport.name}">
      <li><input type="checkbox" checked />${checkedText}</li>
      <li><label><input type="checkbox" />${uncheckedText}</label></li>
    </ul>
  `;
  const plainText = `${checkedText}\n${uncheckedText}`;

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const pasteMode = await pasteHtmlIntoEditor(page, { html, plainText });
  await waitForEditorText(page, checkedText, `${label} checked text ${viewport.name}`);
  await waitForEditorText(page, uncheckedText, `${label} unchecked text ${viewport.name}`);

  const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedUnchecked, `${label} autosave ${viewport.name}`);
  if (!sourceMarkdown.includes(expectedChecked) || !sourceMarkdown.includes(expectedUnchecked)) {
    throw new Error(`${label} did not persist checked and unchecked task Markdown: ${JSON.stringify({ expectedChecked, expectedUnchecked, markdown: sourceMarkdown })}`);
  }

  await page.waitForFunction(
    ({ checkedText, uncheckedText }) => {
      const states = Array.from(document.querySelectorAll(".cm-md-task-checkbox")).map((input) => ({
        checked: input instanceof HTMLInputElement ? input.checked : null,
        text: input.closest(".cm-line")?.textContent ?? ""
      }));
      return states.some((state) => state.checked === true && state.text.includes(checkedText)) &&
        states.some((state) => state.checked === false && state.text.includes(uncheckedText));
    },
    { checkedText, uncheckedText },
    { timeout: 5_000 }
  ).catch(async (error) => {
    const states = await page.locator(".cm-md-task-checkbox").evaluateAll((inputs) => inputs.map((input) => ({
      checked: input instanceof HTMLInputElement ? input.checked : null,
      text: input.closest(".cm-line")?.textContent ?? ""
    }))).catch(() => []);
    throw new Error(`${label} rendered checkbox states did not match pasted HTML tasks: ${JSON.stringify(states)}. ${error.message}`);
  });

  const checkbox = page.locator(".cm-md-task-checkbox").last();
  await checkbox.waitFor({ timeout: 5_000 });
  await checkbox.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, checkbox, `${label} checkbox ${viewport.name}`, 4);

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(expectedChecked) || !finalMarkdown.includes(expectedUnchecked) || !finalMarkdown.includes(afterText)) {
    throw new Error(`${label} final Markdown missing pasted tasks or following text: ${JSON.stringify({ expectedChecked, expectedUnchecked, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `notion-html-checkbox-list-paste-${viewport.name}`, 8);
  return {
    checkedText,
    uncheckedText,
    afterText,
    pasteMode,
    checked: true,
    unchecked: true
  };
}

async function exerciseMarkdownTablePaste(page, fixture, viewport) {
  const rowName = `Pasted table row ${viewport.name} ${Date.now()}`;
  const originalValue = `Pasted table value ${viewport.name}`;
  const afterText = `After pasted markdown table ${viewport.name} ${Date.now()}`;
  const tableSource = `| Name | Value |\n| --- | --- |\n| ${rowName} | ${originalValue} |`;
  const label = "markdown table paste";

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  const pasteMode = await pasteTextIntoEditor(page, `${tableSource}\n\n`);
  await waitForEditorText(page, rowName, `${label} source row ${viewport.name}`);
  const initialMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, tableSource, `${label} autosave ${viewport.name}`);
  if (!initialMarkdown.includes(tableSource)) {
    throw new Error(`${label} source did not persist after paste: ${JSON.stringify({ tableSource, markdown: initialMarkdown })}`);
  }

  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);

  await page.waitForFunction(
    ({ rowName, originalValue }) => Array.from(document.querySelectorAll(".cm-md-table-widget table"))
      .some((table) => {
        const text = table.textContent ?? "";
        return text.includes(rowName) && text.includes(originalValue);
      }),
    { rowName, originalValue },
    { timeout: 8_000 }
  );
  const widget = page.locator(".cm-md-table-widget").last();
  await widget.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, widget, `${label} widget ${viewport.name}`, 4);

  const rendered = await widget.evaluate((element, expected) => {
    const table = element.querySelector("table");
    const editableCell = element.querySelector("tbody td[contenteditable='plaintext-only']");
    const text = table?.textContent ?? "";
    return {
      text,
      hasRow: text.includes(expected.rowName),
      hasOriginalValue: text.includes(expected.originalValue),
      editableCellRole: editableCell?.getAttribute("role") ?? "",
      editableCellAriaLabel: editableCell?.getAttribute("aria-label") ?? ""
    };
  }, { rowName, originalValue });
  if (!rendered.text.includes("Name") || !rendered.text.includes("Value") || !rendered.hasRow || !rendered.hasOriginalValue) {
    throw new Error(`${label} widget did not render the pasted Markdown table: ${JSON.stringify(rendered)}`);
  }
  if (rendered.editableCellRole !== "textbox" || rendered.editableCellAriaLabel !== "Edit table cell") {
    throw new Error(`${label} body cell should keep editable table semantics: ${JSON.stringify(rendered)}`);
  }

  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(tableSource) || !finalMarkdown.includes(afterText)) {
    throw new Error(`${label} final Markdown missing pasted table or following text: ${JSON.stringify({ tableSource, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `markdown-table-paste-${viewport.name}`, 8);
  return {
    rowName,
    afterText,
    pasteMode,
    rendered: true
  };
}

async function exerciseDroppedAttachmentInsertion(page, fixture, viewport) {
  const fileName = `Dropped note ${viewport.name}.txt`;
  const attachmentPath = `attachments/documents/dropped-note-${viewport.name}-${Date.now()}.txt`;
  const expectedMarkdown = `[${fileName}](${attachmentPath})`;
  const afterText = `After dropped attachment ${viewport.name} ${Date.now()}`;
  const label = "dropped attachment";
  const capture = await enableShellOpenCapture(page);

  await installDroppedAttachmentImportStub(page, {
    fileName,
    attachmentPath,
    isImage: false
  });
  try {
    await moveToDocumentEnd(page);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    const dropState = await dispatchEditorFileDrop(page, fileName, "Dropped attachment fixture body");
    if (!dropState.dragoverDefaultPrevented || !dropState.dropDefaultPrevented) {
      throw new Error(`${label} drop event was not accepted by the editor: ${JSON.stringify(dropState)}`);
    }
    await waitForEditorText(page, fileName, `${label} link text ${viewport.name}`);
    const markdownAfterDrop = await waitForPageMarkdown(page, fixture.mainPageId, expectedMarkdown, `${label} autosave ${viewport.name}`);
    if (!markdownAfterDrop.includes(expectedMarkdown)) {
      throw new Error(`${label} did not persist inserted markdown: ${JSON.stringify({ expectedMarkdown, markdown: markdownAfterDrop })}`);
    }

    await page.keyboard.type(afterText);
    await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
    const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} final autosave ${viewport.name}`);
    if (!finalMarkdown.includes(expectedMarkdown) || !finalMarkdown.includes(afterText)) {
      throw new Error(`${label} final markdown missing attachment or continuation: ${JSON.stringify({ expectedMarkdown, afterText, markdown: finalMarkdown })}`);
    }

    const importCalls = await page.evaluate(() => window.__lotionDroppedAttachmentImportCalls ?? []);
    if (!Array.isArray(importCalls) || importCalls.length !== 1 || importCalls[0]?.[0] !== fileName) {
      throw new Error(`${label} import boundary was not called with the dropped file: ${JSON.stringify(importCalls)}`);
    }

    const linkEdit = await assertDirectClickOpensLinkAndBlankClickEdits(page, fixture, {
      label: `${label} link ${viewport.name}`,
      visibleText: fileName,
      editToken: ` dropped${viewport.name}`,
      expectTitle: fixture.mainTitle,
      openUrl: attachmentPath
    }, capture);

    await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
    await assertNoDocumentHorizontalOverflow(page, `dropped-attachment-${viewport.name}`, 8);
    return {
      fileName,
      attachmentPath,
      afterText,
      dropState,
      linkEdit
    };
  } finally {
    await clearCapturedOpenRequests(page, capture).catch(() => undefined);
    await restoreDroppedAttachmentImportStub(page).catch(() => undefined);
    await page.evaluate(() => window.lotion.debug?.setShellOpenDryRun?.(false)).catch(() => undefined);
  }
}

async function exerciseDroppedImageAttachmentInsertion(page, fixture, viewport) {
  const fileName = `Dropped image ${viewport.name}.png`;
  const attachmentPath = `attachments/images/dropped-image-${viewport.name}-${Date.now()}.png`;
  const expectedMarkdown = `![${fileName}](${attachmentPath})`;
  const afterText = `After dropped image ${viewport.name} ${Date.now()}`;
  const label = "dropped image attachment";
  await writeFile(join(fixture.root, attachmentPath), Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lU4Y7wAAAABJRU5ErkJggg==",
    "base64"
  ));

  await installDroppedAttachmentImportStub(page, {
    fileName,
    attachmentPath,
    isImage: true
  });
  try {
    await moveToDocumentEnd(page);
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    const dropState = await dispatchEditorFileDrop(page, fileName, "smoke image bytes", "image/png");
    if (!dropState.dragoverDefaultPrevented || !dropState.dropDefaultPrevented) {
      throw new Error(`${label} drop event was not accepted by the editor: ${JSON.stringify(dropState)}`);
    }

    const markdownAfterDrop = await waitForPageMarkdown(page, fixture.mainPageId, expectedMarkdown, `${label} autosave ${viewport.name}`);
    if (!markdownAfterDrop.includes(expectedMarkdown)) {
      throw new Error(`${label} did not persist inserted image markdown: ${JSON.stringify({ expectedMarkdown, markdown: markdownAfterDrop })}`);
    }

    const imageWidget = page.locator(".cm-md-image-widget").last();
    await imageWidget.waitFor({ timeout: 8_000 });
    await imageWidget.scrollIntoViewIfNeeded();
    await nextAnimationFrame(page);
    await page.mouse.move(4, 4);
    await nextAnimationFrame(page);
    await assertIntersectsViewport(page, imageWidget, `${label} widget ${viewport.name}`, 4);
    const preview = await imageWidget.evaluate((widget, expected) => {
      const image = widget.querySelector("img");
      const edit = widget.querySelector(".cm-md-edit-source");
      return {
        text: widget.textContent ?? "",
        imageAlt: image?.getAttribute("alt") ?? "",
        imageSrc: image?.getAttribute("src") ?? "",
        hasEditSource: Boolean(edit),
        editSourceText: edit?.textContent?.trim() ?? "",
        editSourceOpacity: edit ? getComputedStyle(edit).opacity : "",
        sourceLeaked: (widget.textContent ?? "").includes(expected)
      };
    }, expectedMarkdown);
    if (preview.imageAlt !== fileName || !preview.imageSrc.includes(attachmentPath)) {
      throw new Error(`${label} preview did not render the dropped image path: ${JSON.stringify(preview)}`);
    }
    if (preview.sourceLeaked || preview.text.includes(expectedMarkdown)) {
      throw new Error(`${label} preview leaked source markdown: ${JSON.stringify(preview)}`);
    }
    if (preview.hasEditSource) {
      throw new Error(`${label} preview should keep image source hidden: ${JSON.stringify(preview)}`);
    }

    await imageWidget.hover();
    await imageWidget.click();
    await nextAnimationFrame(page);
    const hiddenAfterInteraction = await page.evaluate((expected) => {
      const widget = Array.from(document.querySelectorAll(".cm-md-image-widget")).at(-1);
      return {
        editSourcePresent: Boolean(widget?.querySelector(".cm-md-edit-source")),
        imageVisible: Boolean(widget?.querySelector("img")),
        sourceVisible: Array.from(document.querySelectorAll(".cm-line"))
          .some((line) => (line.textContent ?? "").includes(expected))
      };
    }, expectedMarkdown);
    if (hiddenAfterInteraction.editSourcePresent || hiddenAfterInteraction.sourceVisible || !hiddenAfterInteraction.imageVisible) {
      throw new Error(`${label} image source became visible after interaction: ${JSON.stringify(hiddenAfterInteraction)}`);
    }

    await moveToDocumentEnd(page);
    await page.keyboard.press("Enter");
    await page.keyboard.type(afterText);
    await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
    const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} final autosave ${viewport.name}`);
    if (!finalMarkdown.includes(expectedMarkdown) || !finalMarkdown.includes(afterText)) {
      throw new Error(`${label} final markdown missing image or continuation: ${JSON.stringify({ expectedMarkdown, afterText, markdown: finalMarkdown })}`);
    }
    await page.waitForFunction(
      ({ expected, imageAlt, after }) => {
        const sourceVisible = Array.from(document.querySelectorAll(".cm-line"))
          .some((line) => (line.textContent ?? "").includes(expected));
        const imageVisible = Array.from(document.querySelectorAll(".cm-md-image-widget img"))
          .some((image) => image.getAttribute("alt") === imageAlt);
        const afterVisible = document.body.textContent?.includes(after);
        return !sourceVisible && imageVisible && afterVisible;
      },
      { expected: expectedMarkdown, imageAlt: fileName, after: afterText },
      { timeout: 5_000 }
    );

    const importCalls = await page.evaluate(() => window.__lotionDroppedAttachmentImportCalls ?? []);
    if (!Array.isArray(importCalls) || importCalls.length !== 1 || importCalls[0]?.[0] !== fileName) {
      throw new Error(`${label} import boundary was not called with the dropped image: ${JSON.stringify(importCalls)}`);
    }

    await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
    await assertNoDocumentHorizontalOverflow(page, `dropped-image-attachment-${viewport.name}`, 8);
    return {
      fileName,
      attachmentPath,
      afterText,
      dropState,
      preview
    };
  } finally {
    await restoreDroppedAttachmentImportStub(page).catch(() => undefined);
  }
}

async function exerciseMarkdownHeadingShortcut(page, fixture, viewport) {
  const text = `Markdown shortcut heading ${viewport.name} ${Date.now()}`;
  const expectedLine = `## ${text}`;
  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type("## ");
  await page.keyboard.type(text);
  await waitForEditorExactLine(page, expectedLine, `markdown heading shortcut exact line ${viewport.name}`);
  const headingLine = page.locator(".cm-line.cm-md-line-h2").filter({ hasText: text }).last();
  await headingLine.waitFor({ timeout: 5_000 });
  await headingLine.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, headingLine, `markdown heading shortcut preview ${viewport.name}`, 4);
  const markdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedLine, `markdown heading shortcut autosave ${viewport.name}`);
  if (!markdown.includes(expectedLine)) {
    throw new Error(`Markdown heading shortcut did not persist as h2 source: ${JSON.stringify({ expectedLine, markdown })}`);
  }
  await assertNoDocumentHorizontalOverflow(page, `markdown-heading-shortcut-${viewport.name}`, 8);
  return { text, expectedLine };
}

async function exerciseMarkdownEmphasisShortcuts(page, fixture, viewport) {
  const stamp = `${viewport.name} ${Date.now()}`;
  const boldText = `Bold shortcut ${stamp}`;
  const italicText = `Italic shortcut ${stamp}`;
  const strikeText = `Strike shortcut ${stamp}`;
  const singleStrikeText = `Imported single strike ${stamp}`;
  const nestedBoldText = `nested bold ${stamp}`;
  const lines = [
    `**${boldText}**`,
    `*${italicText}*`,
    `~~${strikeText}~~`,
    `~${singleStrikeText} (~~**${nestedBoldText}**~~)~`
  ];

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  for (const line of lines) {
    await page.keyboard.type(line);
    await page.keyboard.press("Enter");
  }
  await waitForEditorText(page, boldText, `markdown bold shortcut text ${viewport.name}`);
  await waitForEditorText(page, italicText, `markdown italic shortcut text ${viewport.name}`);
  await waitForEditorText(page, strikeText, `markdown strikethrough shortcut text ${viewport.name}`);
  await waitForEditorText(page, singleStrikeText, `markdown imported single-tilde shortcut text ${viewport.name}`);
  await nextAnimationFrame(page);

  await page.waitForFunction(
    ({ boldText, italicText, strikeText, singleStrikeText, nestedBoldText }) => {
      const collect = (needle) => {
        const line = Array.from(document.querySelectorAll(".cm-content .cm-line"))
          .find((candidate) => (candidate.textContent ?? "").includes(needle));
        if (!line) return null;
        return {
          text: line.textContent ?? "",
          strongText: Array.from(line.querySelectorAll(".cm-md-strong")).map((node) => node.textContent ?? ""),
          emphasisText: Array.from(line.querySelectorAll(".cm-md-emphasis")).map((node) => node.textContent ?? ""),
          strikeText: Array.from(line.querySelectorAll(".cm-md-strike")).map((node) => node.textContent ?? "")
        };
      };
      const bold = collect(boldText);
      const italic = collect(italicText);
      const strike = collect(strikeText);
      const singleStrike = collect(singleStrikeText);
      if (!bold || !italic || !strike || !singleStrike) return false;
      return bold.strongText.some((text) => text.includes(boldText)) &&
        !bold.text.includes("**") &&
        italic.emphasisText.some((text) => text.includes(italicText)) &&
        !italic.text.includes("*") &&
        strike.strikeText.some((text) => text.includes(strikeText)) &&
        !strike.text.includes("~~") &&
        singleStrike.strikeText.some((text) => text.includes(singleStrikeText)) &&
        singleStrike.strongText.some((text) => text.includes(nestedBoldText)) &&
        !singleStrike.text.includes("~~") &&
        !singleStrike.text.includes("**");
    },
    { boldText, italicText, strikeText, singleStrikeText, nestedBoldText },
    { timeout: 8_000 }
  ).catch(async (error) => {
    const lines = await page.evaluate(() => Array.from(document.querySelectorAll(".cm-content .cm-line")).map((line) => ({
      text: line.textContent ?? "",
      strongText: Array.from(line.querySelectorAll(".cm-md-strong")).map((node) => node.textContent ?? ""),
      emphasisText: Array.from(line.querySelectorAll(".cm-md-emphasis")).map((node) => node.textContent ?? ""),
      strikeText: Array.from(line.querySelectorAll(".cm-md-strike")).map((node) => node.textContent ?? "")
    })));
    throw new Error(`Markdown emphasis shortcuts did not render in live preview for ${viewport.name}: ${JSON.stringify(lines.slice(-12))}. ${error.message}`);
  });

  const markdown = await waitForPageMarkdown(page, fixture.mainPageId, lines.join("\n"), `markdown emphasis shortcuts autosave ${viewport.name}`);
  for (const line of lines) {
    if (!markdown.includes(line)) {
      throw new Error(`Markdown emphasis shortcut did not persist source line: ${JSON.stringify({ line, markdown })}`);
    }
  }
  await assertNoDocumentHorizontalOverflow(page, `markdown-emphasis-shortcuts-${viewport.name}`, 8);
  return { boldText, italicText, strikeText, singleStrikeText, nestedBoldText };
}

async function exerciseSlashChineseHeadingAlias(page, fixture, viewport, options = {}) {
  const query = options.command ?? "/标题";
  const expectedLabel = options.expectedLabel ?? "Heading 1";
  const marker = options.marker ?? "#";
  const label = options.label ?? "Chinese heading";
  const text = `Slash ${label} ${viewport.name} ${Date.now()}`;
  await page.keyboard.press("Enter");
  await page.keyboard.type("/");
  await page.keyboard.insertText(query.slice(1));
  const menu = page.locator(".slash-menu").first();
  await menu.waitFor({ timeout: 5_000 });
  const activeLabel = await page.locator(".slash-menu-item.active .slash-menu-label").first().textContent();
  if (activeLabel !== expectedLabel) {
    throw new Error(`${label} slash alias should select ${expectedLabel}: ${JSON.stringify(activeLabel)}`);
  }
  const headingItem = page.locator(".slash-menu-item").filter({ hasText: expectedLabel }).first();
  await assertIntersectsViewport(page, headingItem, `slash ${label} menu item ${viewport.name}`, 4);
  await page.keyboard.press("Enter");
  await waitForEditorTextNot(page, query, `slash ${label} command removed`);
  await assertEditorFocused(page, `slash ${label} editor focus ${viewport.name}`);
  await page.keyboard.type(text);
  await waitForEditorText(page, text, `slash ${label} text`);
  const expectedLine = `${marker} ${text}`;
  await waitForEditorExactLine(page, expectedLine, `slash ${label} exact editable line`);
  const markdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedLine, `slash ${label} autosave`);
  if (!markdown.includes(expectedLine)) {
    throw new Error(`${label} slash alias did not persist as ${expectedLabel} markdown: ${JSON.stringify({ text, markdown })}`);
  }
  const safeLabel = label.replaceAll(" ", "-").toLowerCase();
  await assertNoDocumentHorizontalOverflow(page, `slash-${safeLabel}-${viewport.name}`, 8);
  return { command: query, selected: expectedLabel, text, expectedLine };
}

async function exerciseSlashMenuEmptyResult(page, fixture, viewport) {
  const query = `/nomatch${viewport.name}`;
  const afterText = `After slash empty ${viewport.name} ${Date.now()}`;
  await page.keyboard.press("Enter");
  await page.keyboard.type(query);
  const menu = page.locator(".slash-menu").first();
  await menu.waitFor({ timeout: 5_000 });
  const empty = page.locator(".slash-menu-empty").first();
  await empty.waitFor({ timeout: 5_000 });
  await assertIntersectsViewport(page, empty, `slash empty state ${viewport.name}`, 4);
  const emptyText = (await empty.textContent())?.trim();
  if (!["No matching commands.", "没有匹配的命令。"].includes(emptyText ?? "")) {
    throw new Error(`Slash empty state text mismatch: ${JSON.stringify(emptyText)}`);
  }
  const commandRows = await page.locator(".slash-menu-item").count();
  if (commandRows !== 0) {
    throw new Error(`Slash empty state should not show command rows: ${commandRows}`);
  }

  await page.keyboard.press("Escape");
  await menu.waitFor({ state: "detached", timeout: 5_000 });
  await assertEditorFocused(page, `slash empty escape preserved editor focus ${viewport.name}`);
  await waitForEditorText(page, query, "slash empty query remained editable");
  for (let i = 0; i < query.length; i += 1) {
    await page.keyboard.press("Backspace");
  }
  await waitForEditorTextNot(page, query, "slash empty query cleanup removed query");
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, "slash empty continued typing");
  const markdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, "slash empty continuation autosave");
  if (markdown.includes(query)) {
    throw new Error(`Slash empty query leaked into persisted markdown after cleanup: ${JSON.stringify({ query, markdown })}`);
  }
  await assertNoDocumentHorizontalOverflow(page, `slash-empty-${viewport.name}`, 8);
  return {
    query,
    emptyText,
    afterText
  };
}

async function exerciseSlashMenuKeyboard(page, fixture, viewport) {
  await page.keyboard.press("Enter");
  await page.keyboard.type("/h");
  const firstMenu = page.locator(".slash-menu").first();
  await firstMenu.waitFor({ timeout: 5_000 });
  const firstActiveLabel = await page.locator(".slash-menu-item.active .slash-menu-label").first().textContent();
  if (firstActiveLabel?.trim() !== "Heading 1") {
    throw new Error(`Slash menu default active item should be Heading 1 for /h: ${JSON.stringify(firstActiveLabel)}`);
  }

  await page.keyboard.press("Escape");
  await firstMenu.waitFor({ state: "detached", timeout: 5_000 });
  await assertEditorFocused(page, `slash menu escape preserved editor focus ${viewport.name}`);
  await waitForEditorText(page, "/h", "slash menu escape preserved slash query");
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await waitForEditorTextNot(page, "/h", "slash menu escape cleanup removed slash query");

  const text = `Keyboard slash heading ${viewport.name} ${Date.now()}`;
  await page.keyboard.type("/h");
  const secondMenu = page.locator(".slash-menu").first();
  await secondMenu.waitFor({ timeout: 5_000 });
  await page.keyboard.press("ArrowDown");
  await page.waitForFunction(() => {
    const active = document.querySelector(".slash-menu-item.active .slash-menu-label");
    return active?.textContent?.trim() === "Heading 2";
  }, null, { timeout: 5_000 }).catch(async (error) => {
    const labels = await page.evaluate(() => Array.from(document.querySelectorAll(".slash-menu-item")).map((item) => ({
      text: item.textContent?.trim() ?? "",
      active: item.classList.contains("active")
    })));
    throw new Error(`Slash menu ArrowDown did not move active command to Heading 2: ${JSON.stringify(labels)}. ${error.message}`);
  });
  await page.keyboard.press("Enter");
  await secondMenu.waitFor({ state: "detached", timeout: 5_000 });
  await waitForEditorTextNot(page, "/h", "slash keyboard command removed query");
  await assertEditorFocused(page, `slash menu keyboard pick preserved editor focus ${viewport.name}`);

  await page.keyboard.type(text);
  await waitForEditorText(page, text, "slash keyboard heading text");
  const markdown = await waitForPageMarkdown(page, fixture.mainPageId, `## ${text}`, "slash keyboard heading autosave");
  if (!markdown.includes(`## ${text}`)) {
    throw new Error(`Slash keyboard selection did not persist Heading 2 markdown: ${JSON.stringify({ text, markdown })}`);
  }

  const tabText = `Tab slash heading ${viewport.name} ${Date.now()}`;
  await page.keyboard.press("Enter");
  await page.keyboard.type("/h1");
  const tabMenu = page.locator(".slash-menu").first();
  await tabMenu.waitFor({ timeout: 5_000 });
  const tabActiveLabel = await page.locator(".slash-menu-item.active .slash-menu-label").first().textContent();
  if (tabActiveLabel?.trim() !== "Heading 1") {
    throw new Error(`Slash menu default active item should be Heading 1 for /h1 before Tab: ${JSON.stringify(tabActiveLabel)}`);
  }
  await page.keyboard.press("Tab");
  await tabMenu.waitFor({ state: "detached", timeout: 5_000 });
  await waitForEditorTextNot(page, "/h1", "slash tab command removed query");
  await assertEditorFocused(page, `slash menu tab pick preserved editor focus ${viewport.name}`);
  await page.keyboard.type(tabText);
  await waitForEditorText(page, tabText, "slash tab heading text");
  const tabMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, `# ${tabText}`, "slash tab heading autosave");
  if (!tabMarkdown.includes(`# ${tabText}`)) {
    throw new Error(`Slash Tab selection did not persist Heading 1 markdown: ${JSON.stringify({ tabText, markdown: tabMarkdown })}`);
  }
  await assertNoDocumentHorizontalOverflow(page, `slash-keyboard-${viewport.name}`, 8);
  return {
    escapedQuery: "/h",
    selected: "Heading 2",
    text,
    tabSelected: "Heading 1",
    tabText
  };
}

async function exerciseSlashText(page, fixture, viewport) {
  const text = `Slash text paragraph ${viewport.name} ${Date.now()}`;
  await page.keyboard.press("Enter");
  await page.keyboard.type("/text");
  const menu = page.locator(".slash-menu").first();
  await menu.waitFor({ timeout: 5_000 });
  const textItem = page.locator(".slash-menu-item").filter({ hasText: "Text" }).first();
  await textItem.waitFor({ timeout: 5_000 });
  await assertIntersectsViewport(page, textItem, `slash text menu item ${viewport.name}`, 4);
  await textItem.click();
  await waitForEditorTextNot(page, "/text", "slash text command removed");
  await assertEditorFocused(page, `slash text editor focus ${viewport.name}`);

  await page.keyboard.type(text);
  await waitForEditorText(page, text, "slash text paragraph");
  await waitForEditorExactLine(page, text, "slash text exact paragraph line");
  const markdown = await waitForPageMarkdown(page, fixture.mainPageId, text, "slash text autosave");
  const lines = markdown.split(/\r?\n/);
  if (!lines.includes(text)) {
    throw new Error(`Slash text did not persist as a plain paragraph line: ${JSON.stringify({ text, markdown })}`);
  }
  const wrappedForms = [`# ${text}`, `## ${text}`, `### ${text}`, `- ${text}`, `1. ${text}`, `> ${text}`, `| ${text}`];
  for (const wrapped of wrappedForms) {
    if (markdown.includes(wrapped)) {
      throw new Error(`Slash text introduced non-paragraph markdown ${JSON.stringify(wrapped)}: ${JSON.stringify(markdown)}`);
    }
  }
  await assertNoDocumentHorizontalOverflow(page, `slash-text-${viewport.name}`, 8);
  return {
    text,
    plainLine: true
  };
}

async function exerciseSlashChineseTextAlias(page, fixture, viewport, options = {}) {
  const query = options.command ?? "/文本";
  const label = options.label ?? "slash Chinese text";
  const text = `Slash Chinese text paragraph ${viewport.name} ${Date.now()}`;
  await page.keyboard.press("Enter");
  await page.keyboard.insertText(query);
  const menu = page.locator(".slash-menu").first();
  await menu.waitFor({ timeout: 5_000 }).catch(async (error) => {
    const debug = await page.evaluate(() => ({
      activeTag: document.activeElement?.tagName ?? "",
      activeClass: document.activeElement instanceof HTMLElement ? document.activeElement.className : "",
      focusedEditors: document.querySelectorAll(".cm-editor.cm-focused").length,
      menuCount: document.querySelectorAll(".slash-menu").length,
      recentLines: Array.from(document.querySelectorAll(".cm-line")).slice(-10).map((line) => line.textContent ?? ""),
      bodyTail: document.body.textContent?.slice(-600) ?? ""
    })).catch((debugError) => ({ debugError: debugError.message }));
    throw new Error(`${label} alias menu did not open for ${query}: ${JSON.stringify(debug)}. ${error.message}`);
  });
  const activeLabel = await page.locator(".slash-menu-item.active .slash-menu-label").first().textContent();
  if (activeLabel?.trim() !== "Text") {
    throw new Error(`${label} should select Text: ${JSON.stringify(activeLabel)}`);
  }
  const textItem = page.locator(".slash-menu-item").filter({ hasText: "Text" }).first();
  await assertIntersectsViewport(page, textItem, `${label} menu item ${viewport.name}`, 4);
  await page.keyboard.press("Enter");
  await menu.waitFor({ state: "detached", timeout: 5_000 });
  await waitForEditorTextNot(page, query, "slash Chinese text command removed");
  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);

  await page.keyboard.type(text);
  await waitForEditorText(page, text, "slash Chinese text paragraph");
  await waitForEditorExactLine(page, text, "slash Chinese text exact paragraph line");
  const markdown = await waitForPageMarkdown(page, fixture.mainPageId, text, "slash Chinese text autosave");
  const lines = markdown.split(/\r?\n/);
  if (!lines.includes(text)) {
    throw new Error(`Chinese slash text did not persist as a plain paragraph line: ${JSON.stringify({ text, markdown })}`);
  }
  const wrappedForms = [`# ${text}`, `## ${text}`, `### ${text}`, `- ${text}`, `1. ${text}`, `> ${text}`, `| ${text}`];
  for (const wrapped of wrappedForms) {
    if (markdown.includes(wrapped)) {
      throw new Error(`Chinese slash text introduced non-paragraph markdown ${JSON.stringify(wrapped)}: ${JSON.stringify(markdown)}`);
    }
  }
  await assertNoDocumentHorizontalOverflow(page, `slash-chinese-text-${viewport.name}`, 8);
  return {
    query,
    selected: "Text",
    text,
    plainLine: true
  };
}

async function exerciseSlashToc(page, fixture, viewport, headingText) {
  const expectedBlock = "```lotion-toc\n```\n";
  const afterText = `After slash toc ${viewport.name} ${Date.now()}`;
  await page.keyboard.press("Enter");
  await page.keyboard.type("/toc");
  const menu = page.locator(".slash-menu").first();
  await menu.waitFor({ timeout: 5_000 });
  const tocItem = page.locator(".slash-menu-item").filter({ hasText: "Table of contents" }).first();
  await tocItem.waitFor({ timeout: 5_000 });
  await assertIntersectsViewport(page, tocItem, `slash toc menu item ${viewport.name}`, 4);
  await tocItem.click();
  await waitForEditorTextNot(page, "/toc", "slash toc command removed");

  const markdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedBlock, "slash toc autosave");
  if (!markdown.includes(expectedBlock)) {
    throw new Error(`Slash TOC did not persist the lotion-toc block: ${JSON.stringify({ expectedBlock, markdown })}`);
  }

  const { inlineToc, rendered } = await assertLatestInlineTocPanel(page, fixture, viewport, headingText, "slash toc");

  const headingButton = inlineToc.locator(".cm-md-toc-item").filter({ hasText: headingText }).first();
  await headingButton.click();
  await assertEditorFocused(page, `slash toc item returned editor focus ${viewport.name}`);
  await page.waitForFunction(
    ({ expected }) => Array.from(document.querySelectorAll(".cm-activeLine"))
      .some((line) => (line.textContent ?? "").includes(expected)),
    { expected: headingText },
    { timeout: 5_000 }
  ).catch(async (error) => {
    const activeLines = await page.evaluate(() => Array.from(document.querySelectorAll(".cm-activeLine"))
      .map((line) => line.textContent ?? ""));
    throw new Error(`Slash TOC item did not move selection to heading ${JSON.stringify(headingText)}. Active=${JSON.stringify(activeLines)}. ${error.message}`);
  });

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, "slash toc continued typing");
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, "slash toc continuation autosave");
  if (!finalMarkdown.includes(afterText)) {
    throw new Error(`Slash TOC continuation did not persist: ${JSON.stringify({ afterText, markdown: finalMarkdown })}`);
  }
  await assertNoDocumentHorizontalOverflow(page, `slash-toc-${viewport.name}`, 8);
  return {
    entries: rendered.entries,
    afterText,
    navigatedToHeading: headingText
  };
}

async function exerciseSlashChineseTocAlias(page, fixture, viewport, headingText) {
  const query = "/目录";
  const expectedBlock = "```lotion-toc\n```\n";
  const afterText = `After slash Chinese toc ${viewport.name} ${Date.now()}`;
  const beforeMarkdown = await readPageMarkdown(page, fixture.mainPageId);
  const beforeCount = countOccurrences(beforeMarkdown, expectedBlock);

  await page.keyboard.press("Enter");
  await page.keyboard.insertText(query);
  const menu = page.locator(".slash-menu").first();
  await menu.waitFor({ timeout: 5_000 });
  const activeLabel = await page.locator(".slash-menu-item.active .slash-menu-label").first().textContent();
  if (activeLabel?.trim() !== "Table of contents") {
    throw new Error(`Chinese TOC slash alias should select Table of contents: ${JSON.stringify(activeLabel)}`);
  }
  const tocItem = page.locator(".slash-menu-item").filter({ hasText: "Table of contents" }).first();
  await assertIntersectsViewport(page, tocItem, `slash Chinese toc menu item ${viewport.name}`, 4);
  await page.keyboard.press("Enter");
  await menu.waitFor({ state: "detached", timeout: 5_000 });
  await waitForEditorTextNot(page, query, "slash Chinese toc command removed");
  await assertEditorFocused(page, `slash Chinese toc editor focus ${viewport.name}`);

  const markdown = await waitForPageMarkdownOccurrences(
    page,
    fixture.mainPageId,
    expectedBlock,
    beforeCount + 1,
    "slash Chinese toc autosave"
  );
  const afterCount = countOccurrences(markdown, expectedBlock);
  const { inlineToc, rendered } = await assertLatestInlineTocPanel(page, fixture, viewport, headingText, "slash Chinese toc");

  const headingButton = inlineToc.locator(".cm-md-toc-item").filter({ hasText: headingText }).first();
  await headingButton.click();
  await assertEditorFocused(page, `slash Chinese toc item returned editor focus ${viewport.name}`);
  await page.waitForFunction(
    ({ expected }) => Array.from(document.querySelectorAll(".cm-activeLine"))
      .some((line) => (line.textContent ?? "").includes(expected)),
    { expected: headingText },
    { timeout: 5_000 }
  ).catch(async (error) => {
    const activeLines = await page.evaluate(() => Array.from(document.querySelectorAll(".cm-activeLine"))
      .map((line) => line.textContent ?? ""));
    throw new Error(`Slash Chinese TOC item did not move selection to heading ${JSON.stringify(headingText)}. Active=${JSON.stringify(activeLines)}. ${error.message}`);
  });

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, "slash Chinese toc continued typing");
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, "slash Chinese toc continuation autosave");
  if (!finalMarkdown.includes(afterText)) {
    throw new Error(`Slash Chinese TOC continuation did not persist: ${JSON.stringify({ afterText, markdown: finalMarkdown })}`);
  }
  await assertNoDocumentHorizontalOverflow(page, `slash-chinese-toc-${viewport.name}`, 8);
  return {
    query,
    entries: rendered.entries,
    beforeCount,
    afterCount,
    afterText,
    navigatedToHeading: headingText
  };
}

async function assertLatestInlineTocPanel(page, fixture, viewport, headingText, label) {
  const inlineToc = page.locator(".cm-md-inline-toc-panel").last();
  await inlineToc.waitFor({ timeout: 8_000 });
  await inlineToc.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, inlineToc, `${label} inline panel ${viewport.name}`, 4);

  const rendered = await inlineToc.evaluate((panel, expected) => {
    const entries = Array.from(panel.querySelectorAll(".cm-md-toc-item")).map((button) => button.textContent?.trim() ?? "");
    const visibleSourceLines = Array.from(document.querySelectorAll(".cm-content .cm-line"))
      .filter((line) => (line.textContent ?? "").includes("lotion-toc"))
      .map((line) => line.textContent ?? "");
    const nav = panel.querySelector(".cm-md-toc-widget");
    return {
      title: panel.querySelector(".cm-md-toc-title")?.textContent?.trim() ?? "",
      navLabel: nav?.getAttribute("aria-label") ?? "",
      entries,
      hasMainTitle: entries.includes(expected.mainTitle),
      hasHeading: entries.includes(expected.headingText),
      visibleSourceLines
    };
  }, { mainTitle: fixture.mainTitle, headingText });
  if (rendered.title !== "Contents" || rendered.navLabel !== "Table of contents") {
    throw new Error(`${label} panel heading/label mismatch: ${JSON.stringify(rendered)}`);
  }
  if (!rendered.hasMainTitle || !rendered.hasHeading) {
    throw new Error(`${label} entries did not include expected headings: ${JSON.stringify(rendered)}`);
  }
  if (rendered.visibleSourceLines.length) {
    throw new Error(`${label} source remained visible after cursor left fence: ${JSON.stringify(rendered)}`);
  }
  return { inlineToc, rendered };
}

async function exerciseMarkdownLinkClickEditing(page, fixture, viewport) {
  const capture = await enableShellOpenCapture(page);
  const results = {};
  try {
    results.bareUrl = await assertDirectClickOpensLinkAndBlankClickEdits(page, fixture, {
      label: `bare URL ${viewport.name}`,
      visibleText: fixture.bareUrl,
      editToken: `edit${viewport.name}`,
      expectTitle: fixture.mainTitle,
      openUrl: fixture.bareUrl
    }, capture);

    results.inlineExternal = await assertDirectClickOpensLinkAndBlankClickEdits(page, fixture, {
      label: `inline external ${viewport.name}`,
      visibleText: fixture.inlineExternalLabel,
      editToken: ` inline${viewport.name}`,
      expectTitle: fixture.mainTitle,
      openUrl: fixture.inlineExternalUrl
    }, capture);

    results.decodedExternal = await assertDirectClickOpensLinkAndBlankClickEdits(page, fixture, {
      label: `decoded external ${viewport.name}`,
      visibleText: fixture.decodedExternalLabelVisible,
      editToken: ` decoded${viewport.name}`,
      expectTitle: fixture.mainTitle,
      openUrl: fixture.decodedExternalUrl
    }, capture);

    results.attachment = await assertDirectClickOpensLinkAndBlankClickEdits(page, fixture, {
      label: `attachment ${viewport.name}`,
      visibleText: fixture.attachmentLinkLabel,
      editToken: ` file${viewport.name}`,
      expectTitle: fixture.mainTitle,
      openUrl: fixture.attachmentPath
    }, capture);

    results.internal = await assertDirectClickOpensLinkAndBlankClickEdits(page, fixture, {
      label: `internal ${viewport.name}`,
      visibleText: fixture.secondaryTitle,
      editToken: ` internal${viewport.name}`,
      expectTitle: fixture.mainTitle,
      expectNavigationTitle: fixture.secondaryTitle
    }, capture);
    await openPage(page, fixture.mainPageId);
    await waitForTitleValue(page, fixture.mainTitle);
    await assertEditorLayout(page, `markdown-link-editing-${viewport.name}`);

    return {
      captureMode: capture.mode,
      ...results
    };
  } finally {
    await clearCapturedOpenRequests(page, capture).catch(() => undefined);
    await page.evaluate(() => window.lotion.debug?.setShellOpenDryRun?.(false)).catch(() => undefined);
  }
}

async function assertDirectClickOpensLinkAndBlankClickEdits(page, fixture, options, capture) {
  await clearCapturedOpenRequests(page, capture);
  const before = await readCapturedOpenRequests(page, capture);
  await clickVisibleText(page, options.visibleText, { bias: options.visibleText.startsWith("http") ? 0.75 : 0.5 });
  let opened = [];
  let navigatedTitle = "";
  if (options.expectNavigationTitle) {
    await waitForTitleValue(page, options.expectNavigationTitle);
    navigatedTitle = options.expectNavigationTitle;
    opened = await readCapturedOpenRequests(page, capture);
    if (opened.length !== before.length) {
      throw new Error(`${options.label} direct internal click used shell.openLink: before=${JSON.stringify(before)} after=${JSON.stringify(opened)}`);
    }
    await openPage(page, fixture.mainPageId);
    await waitForTitleValue(page, options.expectTitle);
  } else {
    opened = await waitForCapturedOpenRequest(page, capture, options.openUrl);
    await waitForTitleValue(page, options.expectTitle);
  }

  await clearCapturedOpenRequests(page, capture);
  const blankPoint = await blankPointAfterText(page, options.visibleText);
  await page.mouse.click(blankPoint.x, blankPoint.y);
  await assertEditorFocused(page, `${options.label} blank-space click focus`);
  await page.keyboard.type(options.editToken);
  await waitForEditorText(page, options.editToken, `${options.label} edited token`);
  const markdown = await waitForPageMarkdown(page, fixture.mainPageId, options.editToken, `${options.label} edit autosave`);
  if (!markdown.includes(options.editToken)) {
    throw new Error(`${options.label} edit token did not persist: ${JSON.stringify(markdown)}`);
  }
  const postEditOpenRequests = await readCapturedOpenRequests(page, capture);
  if (postEditOpenRequests.length !== before.length) {
    throw new Error(`${options.label} typing after click unexpectedly opened a link: ${JSON.stringify(postEditOpenRequests)}`);
  }

  return {
    directClickOpened: opened,
    editToken: options.editToken,
    navigationTitle: navigatedTitle || undefined
  };
}

async function exerciseSlashLink(page, fixture, viewport, options = {}) {
  const command = options.command ?? "/link";
  const testLabel = options.testLabel ?? "slash link";
  const labelPrefix = options.labelPrefix ?? "Slash link label";
  const label = `${labelPrefix} ${viewport.name}`;
  const expectedUrl = "https://";
  const expectedMarkdown = `[${label}](${expectedUrl})`;
  const capture = await enableShellOpenCapture(page);
  try {
    await clearCapturedOpenRequests(page, capture);
    await page.keyboard.press("Enter");
    if (/^[\x00-\x7F]+$/.test(command)) {
      await page.keyboard.type(command);
    } else {
      await page.keyboard.insertText(command);
    }
    const menu = page.locator(".slash-menu").first();
    await menu.waitFor({ timeout: 5_000 });
    const activeLabel = await page.locator(".slash-menu-item.active .slash-menu-label").first().textContent();
    if (activeLabel?.trim() !== "Link") {
      throw new Error(`${testLabel} should select Link: ${JSON.stringify(activeLabel)}`);
    }
    await page.keyboard.press("Enter");
    await page.keyboard.type(label);
    await waitForEditorText(page, label, `${testLabel} label text`);
    await waitForEditorTextNot(page, command, `${testLabel} command removed`);

    const markdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedMarkdown, `${testLabel} autosave`);
    if (!markdown.includes(expectedMarkdown)) {
      throw new Error(`${testLabel} did not persist expected markdown: ${JSON.stringify({ expectedMarkdown, markdown })}`);
    }

    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    const renderedLink = page.locator(".cm-md-link").filter({ hasText: label }).last();
    await renderedLink.waitFor({ timeout: 5_000 });
    await renderedLink.scrollIntoViewIfNeeded();
    await nextAnimationFrame(page);
    await assertIntersectsViewport(page, renderedLink, `${testLabel} rendered link ${viewport.name}`, 4);

    await clearCapturedOpenRequests(page, capture);
    await renderedLink.click({ modifiers: [platformModifier()] });
    const opened = await waitForCapturedOpenRequest(page, capture, expectedUrl);
    await editorContent(page).click();
    await moveToDocumentEnd(page);
    await assertEditorFocused(page, `${testLabel} returned editor focus ${viewport.name}`);
    await assertNoDocumentHorizontalOverflow(page, `${testLabel.replaceAll(" ", "-")}-${viewport.name}`, 8);
    return {
      command,
      label,
      expectedUrl,
      opened
    };
  } finally {
    await clearCapturedOpenRequests(page, capture).catch(() => undefined);
    await page.evaluate(() => window.lotion.debug?.setShellOpenDryRun?.(false)).catch(() => undefined);
  }
}

async function exerciseSlashImage(page, fixture, viewport, options = {}) {
  const command = options.command ?? "/image";
  const testLabel = options.testLabel ?? "slash image";
  const altPrefix = options.altPrefix ?? "Slash image alt";
  const afterPrefix = options.afterPrefix ?? "After slash image";
  const alt = `${altPrefix} ${viewport.name}`;
  const expectedMarkdown = `![${alt}](attachments/)`;
  const afterText = `${afterPrefix} ${viewport.name} ${Date.now()}`;
  await page.keyboard.press("Enter");
  if (/^[\x00-\x7F]+$/.test(command)) {
    await page.keyboard.type(command);
  } else if (command.startsWith("/")) {
    await page.keyboard.type("/");
    await page.keyboard.insertText(command.slice(1));
  } else {
    await page.keyboard.insertText(command);
  }
  const menu = page.locator(".slash-menu").first();
  await menu.waitFor({ timeout: 5_000 }).catch(async (error) => {
    const debug = await page.evaluate(() => ({
      activeTag: document.activeElement?.tagName ?? "",
      activeClass: document.activeElement instanceof HTMLElement ? document.activeElement.className : "",
      focusedEditors: document.querySelectorAll(".cm-editor.cm-focused").length,
      menuCount: document.querySelectorAll(".slash-menu").length,
      recentLines: Array.from(document.querySelectorAll(".cm-line")).slice(-10).map((line) => line.textContent ?? ""),
      bodyTail: document.body.textContent?.slice(-600) ?? ""
    })).catch((debugError) => ({ debugError: debugError.message }));
    throw new Error(`${label} slash menu did not open for ${command}: ${JSON.stringify(debug)}. ${error.message}`);
  });
  const activeLabel = await page.locator(".slash-menu-item.active .slash-menu-label").first().textContent();
  if (activeLabel?.trim() !== "Image") {
    throw new Error(`${testLabel} should select Image: ${JSON.stringify(activeLabel)}`);
  }
  await page.keyboard.press("Enter");
  await page.keyboard.type(alt);
  await waitForEditorText(page, alt, `${testLabel} alt text`);
  await waitForEditorTextNot(page, command, `${testLabel} command removed`);

  const markdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedMarkdown, `${testLabel} autosave`);
  if (!markdown.includes(expectedMarkdown)) {
    throw new Error(`${testLabel} did not persist expected markdown: ${JSON.stringify({ expectedMarkdown, markdown })}`);
  }

  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  const imageWidget = page.locator(".cm-md-image-widget").filter({ hasText: alt }).last();
  await imageWidget.waitFor({ timeout: 8_000 });
  await imageWidget.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await page.mouse.move(4, 4);
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, imageWidget, `${testLabel} widget ${viewport.name}`, 4);

  const preview = await imageWidget.evaluate((widget, expectedAlt) => {
    const edit = widget.querySelector(".cm-md-edit-source");
    const image = widget.querySelector("img");
    const placeholder = widget.querySelector(".cm-md-image-placeholder");
    return {
      text: widget.textContent ?? "",
      hasImage: Boolean(image),
      imageAlt: image?.getAttribute("alt") ?? "",
      imageSrc: image?.getAttribute("src") ?? "",
      hasPlaceholder: Boolean(placeholder),
      placeholderText: placeholder?.textContent ?? "",
      placeholderLabel: placeholder?.getAttribute("aria-label") ?? "",
      hasEditSource: Boolean(edit),
      editSourceText: edit?.textContent?.trim() ?? "",
      editSourceOpacity: edit ? getComputedStyle(edit).opacity : "",
      sourceLeaked: (widget.textContent ?? "").includes(`![${expectedAlt}]`)
    };
  }, alt);
  if (preview.hasImage || !preview.hasPlaceholder || !preview.placeholderText.includes(alt) || !preview.placeholderLabel.includes(alt)) {
    throw new Error(`${testLabel} preview did not render the missing-image placeholder: ${JSON.stringify(preview)}`);
  }
  if (preview.sourceLeaked || preview.text.includes(expectedMarkdown)) {
    throw new Error(`${testLabel} preview leaked source markdown: ${JSON.stringify(preview)}`);
  }
  if (preview.hasEditSource) {
    throw new Error(`${testLabel} preview should keep image source hidden: ${JSON.stringify(preview)}`);
  }

  await imageWidget.hover();
  await imageWidget.click();
  await nextAnimationFrame(page);
  const hiddenAfterInteraction = await page.evaluate(({ expected, expectedAlt }) => {
    const widget = Array.from(document.querySelectorAll(".cm-md-image-widget"))
      .find((candidate) => (candidate.textContent ?? "").includes(expectedAlt));
    return {
      editSourcePresent: Boolean(widget?.querySelector(".cm-md-edit-source")),
      placeholderVisible: Boolean(widget?.querySelector(".cm-md-image-placeholder")),
      sourceVisible: Array.from(document.querySelectorAll(".cm-line"))
        .some((line) => (line.textContent ?? "").includes(expected))
    };
  }, { expected: expectedMarkdown, expectedAlt: alt });
  if (hiddenAfterInteraction.editSourcePresent || hiddenAfterInteraction.sourceVisible || !hiddenAfterInteraction.placeholderVisible) {
    throw new Error(`${testLabel} image source became visible after interaction: ${JSON.stringify(hiddenAfterInteraction)}`);
  }

  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, "slash image continued typing");
  await waitForPageMarkdown(page, fixture.mainPageId, afterText, "slash image continuation autosave");
  await page.waitForFunction(
    ({ expected, after, expectedAlt }) => {
      const sourceVisible = Array.from(document.querySelectorAll(".cm-line"))
        .some((line) => (line.textContent ?? "").includes(expected));
      const imageVisible = Array.from(document.querySelectorAll(".cm-md-image-widget .cm-md-image-placeholder"))
        .some((placeholder) => (placeholder.textContent ?? "").includes(expectedAlt));
      const afterVisible = document.body.textContent?.includes(after);
      return !sourceVisible && imageVisible && afterVisible;
    },
    { expected: expectedMarkdown, after: afterText, expectedAlt: alt },
    { timeout: 5_000 }
  );
  await assertEditorFocused(page, `${testLabel} returned editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `${testLabel.replaceAll(" ", "-")}-${viewport.name}`, 8);
  return {
    command,
    alt,
    expectedMarkdown,
    afterText,
    preview
  };
}

async function exerciseSlashDivider(page, fixture, viewport, options = {}) {
  const command = options.command ?? "/divider";
  const testLabel = options.testLabel ?? "slash divider";
  const afterPrefix = options.afterPrefix ?? "After slash divider";
  const afterText = `${afterPrefix} ${viewport.name} ${Date.now()}`;
  await page.keyboard.press("Enter");
  if (/^[\x00-\x7F]+$/.test(command)) {
    await page.keyboard.type(command);
  } else if (command.startsWith("/")) {
    await page.keyboard.type("/");
    await page.keyboard.insertText(command.slice(1));
  } else {
    await page.keyboard.insertText(command);
  }
  const menu = page.locator(".slash-menu").first();
  await menu.waitFor({ timeout: 5_000 }).catch(async (error) => {
    const state = await page.evaluate(() => ({
      activeTag: document.activeElement?.tagName ?? "",
      activeClass: document.activeElement instanceof HTMLElement ? document.activeElement.className : "",
      activeText: document.activeElement?.textContent?.slice(0, 160) ?? "",
      focusedEditors: document.querySelectorAll(".cm-editor.cm-focused").length,
      editorTextTail: (document.querySelector(".cm-content")?.textContent ?? "").slice(-600),
      lineTail: Array.from(document.querySelectorAll(".cm-content .cm-line"))
        .slice(-8)
        .map((line) => line.textContent ?? "")
    }));
    throw new Error(`${testLabel} menu did not open for ${command}. ${JSON.stringify(state)}. ${error.message}`);
  });
  const activeLabel = await page.locator(".slash-menu-item.active .slash-menu-label").first().textContent();
  if (activeLabel?.trim() !== "Divider") {
    throw new Error(`${testLabel} should select Divider: ${JSON.stringify(activeLabel)}`);
  }
  await page.keyboard.press("Enter");
  await waitForEditorTextNot(page, command, `${testLabel} command removed`);

  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${testLabel} continued typing`);
  const markdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${testLabel} autosave`);
  if (!markdown.includes(`---\n${afterText}`)) {
    throw new Error(`${testLabel} did not persist before following text: ${JSON.stringify({ afterText, markdown })}`);
  }
  await moveToDocumentEnd(page);

  const divider = page.locator(".cm-md-hr-widget").last();
  await divider.waitFor({ timeout: 5_000 });
  await divider.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, divider, `${testLabel} preview ${viewport.name}`, 4);
  await assertNoDocumentHorizontalOverflow(page, `${testLabel.replaceAll(" ", "-")}-${viewport.name}`, 8);
  return {
    command,
    afterText,
    rendered: true
  };
}

async function exerciseSlashListCommand(page, fixture, viewport, options) {
  const command = options.command.startsWith("/") ? options.command : `/${options.command}`;
  const listText = `Slash ${options.label} item ${viewport.name} ${Date.now()}`;
  const continuationText = `After slash ${options.label} list ${viewport.name} ${Date.now()}`;
  await page.keyboard.press("Enter");
  if (/^[\x00-\x7F]+$/.test(command)) {
    await page.keyboard.type(command);
  } else if (command.startsWith("/")) {
    await page.keyboard.type("/");
    await page.keyboard.insertText(command.slice(1));
  } else {
    await page.keyboard.insertText(command);
  }
  const menu = page.locator(".slash-menu").first();
  await menu.waitFor({ timeout: 5_000 });
  const expectedLabel = options.expectedLabel ?? (options.marker === "1." ? "Numbered list" : "Bulleted list");
  await page.waitForFunction(
    (expected) => document.querySelector(".slash-menu-item.active .slash-menu-label")?.textContent?.trim() === expected,
    expectedLabel,
    { timeout: 8_000 }
  ).catch(async (error) => {
    const state = await page.evaluate(() => ({
      activeLabel: document.querySelector(".slash-menu-item.active .slash-menu-label")?.textContent?.trim() ?? "",
      menuLabels: Array.from(document.querySelectorAll(".slash-menu-item .slash-menu-label"))
        .map((item) => item.textContent?.trim() ?? ""),
      lineTail: Array.from(document.querySelectorAll(".cm-content .cm-line"))
        .slice(-6)
        .map((line) => line.textContent ?? "")
    }));
    throw new Error(`Slash ${options.label} should select ${expectedLabel}: ${JSON.stringify(state)}. ${error.message}`);
  });
  await page.keyboard.press("Enter");
  await page.keyboard.type(listText);
  await waitForEditorText(page, listText, `slash ${options.label} list text`);
  await waitForEditorTextNot(page, command, `slash ${options.label} command removed`);

  const listLine = page.locator(".cm-content .cm-line").filter({ hasText: listText }).last();
  await listLine.waitFor({ timeout: 5_000 });
  await listLine.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, listLine, `slash ${options.label} list line ${viewport.name}`, 4);

  const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, listText, `slash ${options.label} list autosave`);
  const expectedLine = `${options.marker} ${listText}`;
  if (!sourceMarkdown.includes(expectedLine)) {
    throw new Error(`Slash ${options.label} did not persist as list markdown: ${JSON.stringify({ expectedLine, markdown: sourceMarkdown })}`);
  }

  await assertEditorFocused(page, `slash ${options.label} list editor focus ${viewport.name}`);
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type(continuationText);
  await waitForEditorText(page, continuationText, `slash ${options.label} list continued typing`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, continuationText, `slash ${options.label} continuation autosave`);
  if (!finalMarkdown.includes(continuationText)) {
    throw new Error(`Slash ${options.label} continuation did not persist: ${JSON.stringify({ continuationText, markdown: finalMarkdown })}`);
  }

  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await assertEditorFocused(page, `slash ${options.label} list final editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `slash-${options.label}-list-${viewport.name}`, 8);
  return {
    command,
    text: listText,
    continuationText,
    expectedLine
  };
}

async function exerciseSlashTable(page, fixture, viewport, options = {}) {
  const command = options.command ?? "/table";
  const testLabel = options.testLabel ?? "slash table";
  const cellPrefix = options.cellPrefix ?? "Slash table cell";
  const afterPrefix = options.afterPrefix ?? "After slash table";
  const tableHeader = "| Column 1 | Column 2 |";
  const committedValue = `${cellPrefix} ${viewport.name}`;
  const afterText = `${afterPrefix} ${viewport.name} ${Date.now()}`;
  const beforeMarkdown = await readPageMarkdown(page, fixture.mainPageId);
  const beforeTableCount = countOccurrences(beforeMarkdown, tableHeader);
  await page.keyboard.press("Enter");
  if (/^[\x00-\x7F]+$/.test(command)) {
    await page.keyboard.type(command);
  } else if (command.startsWith("/")) {
    await page.keyboard.type("/");
    await page.keyboard.insertText(command.slice(1));
  } else {
    await page.keyboard.insertText(command);
  }
  const menu = page.locator(".slash-menu").first();
  await menu.waitFor({ timeout: 5_000 }).catch(async (error) => {
    const debug = await page.evaluate(() => ({
      activeTag: document.activeElement?.tagName ?? "",
      activeClass: document.activeElement instanceof HTMLElement ? document.activeElement.className : "",
      focusedEditors: document.querySelectorAll(".cm-editor.cm-focused").length,
      menuCount: document.querySelectorAll(".slash-menu").length,
      recentLines: Array.from(document.querySelectorAll(".cm-line")).slice(-10).map((line) => line.textContent ?? ""),
      bodyTail: document.body.textContent?.slice(-600) ?? ""
    })).catch((debugError) => ({ debugError: debugError.message }));
    throw new Error(`${testLabel} slash menu did not open for ${command}: ${JSON.stringify(debug)}. ${error.message}`);
  });
  const activeLabel = await page.locator(".slash-menu-item.active .slash-menu-label").first().textContent();
  if (activeLabel?.trim() !== "Table") {
    throw new Error(`${testLabel} should select Table: ${JSON.stringify(activeLabel)}`);
  }
  await page.keyboard.press("Enter");
  await waitForEditorTextNot(page, command, `${testLabel} command removed`);

  const markdown = await waitForPageMarkdownOccurrences(page, fixture.mainPageId, tableHeader, beforeTableCount + 1, `${testLabel} autosave`);
  if (!markdown.includes("| Column 1 | Column 2 |\n| --- | --- |\n|  |  |")) {
    throw new Error(`${testLabel} did not persist a valid markdown table: ${JSON.stringify(markdown)}`);
  }

  const widget = page.locator(".cm-md-table-widget").last();
  await widget.waitFor({ timeout: 8_000 });
  await widget.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, widget, `${testLabel} widget ${viewport.name}`, 4);

  const rendered = await widget.evaluate((element) => {
    const table = element.querySelector("table");
    const editableCell = element.querySelector("tbody td[contenteditable='plaintext-only']");
    return {
      text: table?.textContent ?? "",
      editableCellText: editableCell?.textContent ?? "",
      editableCellRole: editableCell?.getAttribute("role") ?? "",
      editableCellAriaLabel: editableCell?.getAttribute("aria-label") ?? ""
    };
  });
  if (!rendered.text.includes("Column 1") || !rendered.text.includes("Column 2")) {
    throw new Error(`${testLabel} widget did not render headers: ${JSON.stringify(rendered)}`);
  }
  if (rendered.editableCellRole !== "textbox" || rendered.editableCellAriaLabel !== "Edit table cell") {
    throw new Error(`${testLabel} body cell should be directly editable: ${JSON.stringify(rendered)}`);
  }

  const cell = widget.locator("tbody td[contenteditable='plaintext-only']").first();
  await cell.click();
  await cell.fill(committedValue);
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    ({ expected }) => {
      const tableText = Array.from(document.querySelectorAll(".cm-md-table-widget table"))
        .map((table) => table.textContent ?? "")
        .join("\n");
      return tableText.includes(expected);
    },
    { expected: committedValue },
    { timeout: 5_000 }
  );
  const updatedMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, committedValue, `${testLabel} direct edit autosave`);
  if (!updatedMarkdown.includes(`| ${committedValue} |`)) {
    throw new Error(`${testLabel} cell edit did not persist in markdown table: ${JSON.stringify({ committedValue, markdown: updatedMarkdown })}`);
  }

  await page.locator(".cm-content .cm-line").last().click();
  await moveToDocumentEnd(page);
  await assertEditorFocused(page, `${testLabel} returned editor focus ${viewport.name}`);
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${testLabel} continued typing`);
  await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${testLabel} continuation autosave`);
  await page.keyboard.press("Enter");
  await assertNoDocumentHorizontalOverflow(page, `${testLabel.replaceAll(" ", "-")}-${viewport.name}`, 8);
  return {
    command,
    committedValue,
    afterText,
    rendered: true
  };
}

async function exerciseSlashTodoTask(page, fixture, viewport, options = {}) {
  const command = options.command ?? "/todo";
  const label = options.label ?? "slash todo";
  const textPrefix = options.textPrefix ?? "Slash todo task";
  const todoText = `${textPrefix} ${viewport.name} ${Date.now()}`;
  await page.keyboard.press("Enter");
  if (/^[\x00-\x7F]+$/.test(command)) {
    await page.keyboard.type(command);
  } else {
    await page.keyboard.insertText(command);
  }
  const menu = page.locator(".slash-menu").first();
  await menu.waitFor({ timeout: 5_000 }).catch(async (error) => {
    const debug = await page.evaluate(() => ({
      activeTag: document.activeElement?.tagName ?? "",
      activeClass: document.activeElement instanceof HTMLElement ? document.activeElement.className : "",
      focusedEditors: document.querySelectorAll(".cm-editor.cm-focused").length,
      menuCount: document.querySelectorAll(".slash-menu").length,
      recentLines: Array.from(document.querySelectorAll(".cm-line")).slice(-10).map((line) => line.textContent ?? ""),
      bodyTail: document.body.textContent?.slice(-600) ?? ""
    })).catch((debugError) => ({ debugError: debugError.message }));
    throw new Error(`${label} slash menu did not open for ${command}: ${JSON.stringify(debug)}. ${error.message}`);
  });
  const activeLabel = await page.locator(".slash-menu-item.active .slash-menu-label").first().textContent();
  if (activeLabel?.trim() !== "To-do") {
    throw new Error(`${label} should select To-do: ${JSON.stringify(activeLabel)}`);
  }
  await page.keyboard.press("Enter");
  await page.keyboard.type(todoText);
  await waitForEditorText(page, todoText, `${label} task text`);
  await waitForEditorTextNot(page, command, `${label} command removed`);

  const checkbox = page.locator(".cm-md-task-checkbox").last();
  await checkbox.waitFor({ timeout: 5_000 });
  await assertIntersectsViewport(page, checkbox, `${label} checkbox ${viewport.name}`, 4);
  const beforeChecked = await checkbox.isChecked();
  if (beforeChecked) {
    throw new Error(`${label} checkbox should start unchecked: ${todoText}`);
  }

  const uncheckedMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, todoText, `${label} unchecked autosave`);
  if (!uncheckedMarkdown.includes(`- [ ] ${todoText}`)) {
    throw new Error(`${label} did not persist unchecked markdown: ${JSON.stringify({ todoText, markdown: uncheckedMarkdown })}`);
  }

  await checkbox.click();
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll(".cm-md-task-checkbox"))
      .some((input) => input instanceof HTMLInputElement && input.checked),
    null,
    { timeout: 5_000 }
  ).catch(async (error) => {
    const checkedStates = await page.locator(".cm-md-task-checkbox").evaluateAll((inputs) => inputs.map((input) => ({
      checked: input instanceof HTMLInputElement ? input.checked : null,
      text: input.closest(".cm-line")?.textContent ?? ""
    }))).catch(() => []);
    throw new Error(`${label} checkbox did not become checked: ${JSON.stringify(checkedStates)}. ${error.message}`);
  });

  const checkedMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, `- [x] ${todoText}`, `${label} checked autosave`);
  await assertEditorFocused(page, `${label} returned editor focus ${viewport.name}`);
  await moveToDocumentEnd(page);
  await waitForPageMarkdown(page, fixture.mainPageId, `- [x] ${todoText}`, `${label} checked markdown after focus restore`);
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await assertEditorFocused(page, `${label} exited task list ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `${label.replaceAll(" ", "-")}-${viewport.name}`, 8);
  return {
    command,
    text: todoText,
    checked: checkedMarkdown.includes(`- [x] ${todoText}`)
  };
}

async function exerciseMarkdownTaskCheckboxShortcut(page, fixture, viewport) {
  const todoText = `Markdown task checkbox ${viewport.name} ${Date.now()}`;
  const label = "markdown task checkbox shortcut";
  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type(`- [ ] ${todoText}`);
  await waitForEditorText(page, todoText, `${label} text ${viewport.name}`);

  const checkbox = page.locator(".cm-md-task-checkbox").last();
  await checkbox.waitFor({ timeout: 5_000 });
  await assertIntersectsViewport(page, checkbox, `${label} checkbox ${viewport.name}`, 4);
  const beforeChecked = await checkbox.isChecked();
  if (beforeChecked) {
    throw new Error(`${label} should start unchecked: ${todoText}`);
  }

  const uncheckedMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, `- [ ] ${todoText}`, `${label} unchecked autosave`);
  if (!uncheckedMarkdown.includes(`- [ ] ${todoText}`)) {
    throw new Error(`${label} did not persist unchecked markdown: ${JSON.stringify({ todoText, markdown: uncheckedMarkdown })}`);
  }

  await checkbox.click();
  await page.waitForFunction(
    ({ expected }) => Array.from(document.querySelectorAll(".cm-md-task-checkbox"))
      .some((input) => input instanceof HTMLInputElement &&
        input.checked &&
        (input.closest(".cm-line")?.textContent ?? "").includes(expected)),
    { expected: todoText },
    { timeout: 5_000 }
  ).catch(async (error) => {
    const checkedStates = await page.locator(".cm-md-task-checkbox").evaluateAll((inputs) => inputs.map((input) => ({
      checked: input instanceof HTMLInputElement ? input.checked : null,
      text: input.closest(".cm-line")?.textContent ?? ""
    }))).catch(() => []);
    throw new Error(`${label} checkbox did not become checked: ${JSON.stringify(checkedStates)}. ${error.message}`);
  });

  const checkedMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, `- [x] ${todoText}`, `${label} checked autosave`);
  await assertEditorFocused(page, `${label} returned editor focus ${viewport.name}`);
  await moveToDocumentEnd(page);
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await assertEditorFocused(page, `${label} exited task list ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `markdown-task-checkbox-shortcut-${viewport.name}`, 8);
  return {
    text: todoText,
    checked: checkedMarkdown.includes(`- [x] ${todoText}`)
  };
}

async function exerciseMarkdownQuoteShortcut(page, fixture, viewport) {
  const quoteText = `Markdown quote shortcut ${viewport.name} ${Date.now()}`;
  const label = "markdown quote shortcut";
  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type(`> ${quoteText}`);
  await waitForEditorText(page, quoteText, `${label} text ${viewport.name}`);

  const quoteLine = page.locator(".cm-line.cm-md-line-blockquote").filter({ hasText: quoteText }).last();
  await quoteLine.waitFor({ timeout: 5_000 });
  await quoteLine.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, quoteLine, `${label} preview ${viewport.name}`, 4);
  const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, `> ${quoteText}`, `${label} autosave ${viewport.name}`);
  if (!sourceMarkdown.includes(`> ${quoteText}`)) {
    throw new Error(`${label} did not persist as blockquote markdown: ${JSON.stringify({ quoteText, markdown: sourceMarkdown })}`);
  }

  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await assertEditorFocused(page, `${label} exited blockquote ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `markdown-quote-shortcut-${viewport.name}`, 8);
  return {
    text: quoteText,
    persisted: sourceMarkdown.includes(`> ${quoteText}`)
  };
}

async function exerciseMarkdownDividerShortcut(page, fixture, viewport) {
  const afterText = `After markdown divider shortcut ${viewport.name} ${Date.now()}`;
  const label = "markdown divider shortcut";
  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type("---");
  await page.keyboard.press("Enter");

  const divider = page.locator(".cm-md-hr-widget").last();
  await divider.waitFor({ timeout: 5_000 });
  await divider.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, divider, `${label} preview ${viewport.name}`, 4);

  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} autosave ${viewport.name}`);
  if (!sourceMarkdown.includes(`---\n${afterText}`)) {
    throw new Error(`${label} did not persist divider before following text: ${JSON.stringify({ afterText, markdown: sourceMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `markdown-divider-shortcut-${viewport.name}`, 8);
  return {
    afterText,
    persisted: sourceMarkdown.includes(`---\n${afterText}`)
  };
}

async function exerciseMarkdownBulletListShortcut(page, fixture, viewport) {
  const itemText = `Markdown bullet shortcut ${viewport.name} ${Date.now()}`;
  const continuationText = `Markdown bullet continuation ${viewport.name} ${Date.now()}`;
  const label = "markdown bullet list shortcut";
  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type(`- ${itemText}`);
  await waitForEditorText(page, itemText, `${label} first item ${viewport.name}`);
  await page.keyboard.press("Enter");

  const bulletLine = page.locator(".cm-content .cm-line").filter({ hasText: itemText }).last();
  await bulletLine.waitFor({ timeout: 5_000 });
  await bulletLine.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, bulletLine, `${label} first line ${viewport.name}`, 4);
  const bulletWidget = bulletLine.locator(".cm-md-list-bullet");
  await bulletWidget.waitFor({ timeout: 5_000 });
  await assertIntersectsViewport(page, bulletWidget, `${label} bullet widget ${viewport.name}`, 2);

  await page.keyboard.type(continuationText);
  await waitForEditorText(page, continuationText, `${label} continuation ${viewport.name}`);
  const expectedBlock = `- ${itemText}\n- ${continuationText}`;
  const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedBlock, `${label} autosave ${viewport.name}`);
  if (!sourceMarkdown.includes(expectedBlock)) {
    throw new Error(`${label} did not persist as Markdown bullets: ${JSON.stringify({ expectedBlock, markdown: sourceMarkdown })}`);
  }

  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await assertEditorFocused(page, `${label} exited list ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `markdown-bullet-list-shortcut-${viewport.name}`, 8);
  return {
    itemText,
    continuationText,
    persisted: sourceMarkdown.includes(expectedBlock)
  };
}

async function exerciseMarkdownNumberedListShortcut(page, fixture, viewport) {
  const itemText = `Markdown numbered shortcut ${viewport.name} ${Date.now()}`;
  const continuationText = `Markdown numbered continuation ${viewport.name} ${Date.now()}`;
  const label = "markdown numbered list shortcut";
  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type(`1. ${itemText}`);
  await waitForEditorText(page, itemText, `${label} first item ${viewport.name}`);
  await page.keyboard.press("Enter");

  const firstLine = page.locator(".cm-content .cm-line").filter({ hasText: itemText }).last();
  await firstLine.waitFor({ timeout: 5_000 });
  await firstLine.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, firstLine, `${label} first line ${viewport.name}`, 4);

  await page.keyboard.type(continuationText);
  await waitForEditorText(page, continuationText, `${label} continuation ${viewport.name}`);
  const expectedBlock = `1. ${itemText}\n2. ${continuationText}`;
  const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedBlock, `${label} autosave ${viewport.name}`);
  if (!sourceMarkdown.includes(expectedBlock)) {
    throw new Error(`${label} did not persist as ordered Markdown list: ${JSON.stringify({ expectedBlock, markdown: sourceMarkdown })}`);
  }

  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await assertEditorFocused(page, `${label} exited list ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `markdown-numbered-list-shortcut-${viewport.name}`, 8);
  return {
    itemText,
    continuationText,
    persisted: sourceMarkdown.includes(expectedBlock)
  };
}

async function exerciseMarkdownCodeFenceShortcut(page, fixture, viewport) {
  const codeText = `const directFence${viewport.name.replace(/\W/g, "")} = "${Date.now()}";`;
  const afterText = `After markdown code fence shortcut ${viewport.name} ${Date.now()}`;
  const label = "markdown code fence shortcut";
  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type(`\`\`\`js\n${codeText}\n\`\`\``);
  await waitForEditorText(page, codeText, `${label} code text ${viewport.name}`);

  const codeLine = page.locator(".cm-line.cm-md-line-code").filter({ hasText: codeText }).last();
  await codeLine.waitFor({ timeout: 5_000 });
  await codeLine.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, codeLine, `${label} code line ${viewport.name}`, 4);
  const fenceLines = page.locator(".cm-line.cm-md-line-code-fence");
  const fenceCount = await fenceLines.count();
  if (fenceCount < 2) {
    const debugLines = await page.locator(".cm-content .cm-line").evaluateAll((lines) =>
      lines.slice(-12).map((line) => ({
        text: line.textContent ?? "",
        className: line.className
      }))
    );
    throw new Error(`${label} did not style both fence lines: ${JSON.stringify(debugLines)}`);
  }

  await page.keyboard.press("Enter");
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  const expectedBlock = `\`\`\`js\n${codeText}\n\`\`\`\n${afterText}`;
  const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedBlock, `${label} autosave ${viewport.name}`);
  if (!sourceMarkdown.includes(expectedBlock)) {
    throw new Error(`${label} did not persist code fence before following text: ${JSON.stringify({ expectedBlock, markdown: sourceMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `markdown-code-fence-shortcut-${viewport.name}`, 8);
  return {
    codeText,
    afterText,
    persisted: sourceMarkdown.includes(expectedBlock)
  };
}

async function exerciseMarkdownImageSyntax(page, fixture, viewport) {
  const alt = `Direct markdown image ${viewport.name} ${Date.now()}`;
  const expectedMarkdown = `![${alt}](${fixture.directImagePath})`;
  const afterText = `After markdown image syntax ${viewport.name} ${Date.now()}`;
  const label = "markdown image syntax";
  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type(expectedMarkdown);
  await waitForPageMarkdown(page, fixture.mainPageId, expectedMarkdown, `${label} source autosave ${viewport.name}`);

  const imageWidget = page.locator(".cm-md-image-widget").last();
  await imageWidget.waitFor({ timeout: 8_000 });
  await imageWidget.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, imageWidget, `${label} widget ${viewport.name}`, 4);
  const preview = await imageWidget.evaluate((widget, expected) => {
    const image = widget.querySelector("img");
    const edit = widget.querySelector(".cm-md-edit-source");
    return {
      text: widget.textContent ?? "",
      imageAlt: image?.getAttribute("alt") ?? "",
      imageSrc: image?.getAttribute("src") ?? "",
      hasEditSource: Boolean(edit),
      sourceLeaked: (widget.textContent ?? "").includes(expected)
    };
  }, expectedMarkdown);
  if (preview.imageAlt !== alt || !preview.imageSrc.includes(fixture.directImagePath)) {
    throw new Error(`${label} rendered image mismatch: ${JSON.stringify(preview)}`);
  }
  if (preview.hasEditSource || preview.sourceLeaked || preview.text.includes(expectedMarkdown)) {
    throw new Error(`${label} leaked source or exposed edit-source affordance: ${JSON.stringify(preview)}`);
  }

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  await page.waitForFunction(
    ({ expected, imageAlt, after }) => {
      const sourceVisible = Array.from(document.querySelectorAll(".cm-line"))
        .some((line) => (line.textContent ?? "").includes(expected));
      const imageVisible = Array.from(document.querySelectorAll(".cm-md-image-widget img"))
        .some((image) => image.getAttribute("alt") === imageAlt);
      const afterVisible = document.body.textContent?.includes(after);
      return !sourceVisible && imageVisible && afterVisible;
    },
    { expected: expectedMarkdown, imageAlt: alt, after: afterText },
    { timeout: 5_000 }
  );
  const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, `${expectedMarkdown}\n${afterText}`, `${label} autosave ${viewport.name}`);
  if (!sourceMarkdown.includes(`${expectedMarkdown}\n${afterText}`)) {
    throw new Error(`${label} did not persist image before following text: ${JSON.stringify({ expectedMarkdown, afterText, markdown: sourceMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `markdown-image-syntax-${viewport.name}`, 8);
  return {
    alt,
    expectedMarkdown,
    afterText,
    preview
  };
}

async function exerciseMarkdownTableSyntax(page, fixture, viewport) {
  const rowName = `Direct table row ${viewport.name} ${Date.now()}`;
  const originalValue = `Direct table value ${viewport.name}`;
  const committedValue = `Direct table edited ${viewport.name}`;
  const afterText = `After markdown table syntax ${viewport.name} ${Date.now()}`;
  const postEditText = `After markdown table edit ${viewport.name} ${Date.now()}`;
  const tableSource = `| Name | Value |\n| --- | --- |\n| ${rowName} | ${originalValue} |`;
  const label = "markdown table syntax";

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText(`${tableSource}\n\n`);
  await waitForEditorText(page, rowName, `${label} source row ${viewport.name}`);
  const initialMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, tableSource, `${label} source autosave ${viewport.name}`);
  if (!initialMarkdown.includes(tableSource)) {
    throw new Error(`${label} source did not persist before preview: ${JSON.stringify({ tableSource, markdown: initialMarkdown })}`);
  }

  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);

  const widget = page.locator(".cm-md-table-widget").last();
  await widget.waitFor({ timeout: 8_000 });
  await widget.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, widget, `${label} widget ${viewport.name}`, 4);

  const rendered = await widget.evaluate((element, expected) => {
    const table = element.querySelector("table");
    const editableCell = element.querySelector("tbody td[contenteditable='plaintext-only']");
    return {
      text: table?.textContent ?? "",
      hasRow: Boolean(table?.textContent?.includes(expected.rowName)),
      hasOriginalValue: Boolean(table?.textContent?.includes(expected.originalValue)),
      editableCellText: editableCell?.textContent ?? "",
      editableCellRole: editableCell?.getAttribute("role") ?? "",
      editableCellAriaLabel: editableCell?.getAttribute("aria-label") ?? ""
    };
  }, { rowName, originalValue });
  if (!rendered.text.includes("Name") || !rendered.text.includes("Value") || !rendered.hasRow || !rendered.hasOriginalValue) {
    throw new Error(`${label} widget did not render the direct Markdown table: ${JSON.stringify(rendered)}`);
  }
  if (rendered.editableCellRole !== "textbox" || rendered.editableCellAriaLabel !== "Edit table cell") {
    throw new Error(`${label} body cell should be directly editable: ${JSON.stringify(rendered)}`);
  }

  const cell = widget.locator("tbody td[contenteditable='plaintext-only']").first();
  await cell.click();
  await cell.fill(committedValue);
  await page.keyboard.press("Enter");
  await page.waitForFunction(
    ({ expected }) => Array.from(document.querySelectorAll(".cm-md-table-widget table"))
      .some((table) => (table.textContent ?? "").includes(expected)),
    { expected: committedValue },
    { timeout: 5_000 }
  );
  const editedMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, committedValue, `${label} cell edit autosave ${viewport.name}`);
  if (!editedMarkdown.includes(`| ${committedValue} | ${originalValue} |`)) {
    throw new Error(`${label} cell edit did not persist in Markdown: ${JSON.stringify({ committedValue, originalValue, markdown: editedMarkdown })}`);
  }

  await page.locator(".cm-content .cm-line").filter({ hasText: afterText }).last().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type(postEditText);
  await waitForEditorText(page, postEditText, `${label} post-edit continued typing ${viewport.name}`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, postEditText, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(postEditText) || !finalMarkdown.includes(`| ${committedValue} | ${originalValue} |`)) {
    throw new Error(`${label} final Markdown missing table edit or following text: ${JSON.stringify({ committedValue, originalValue, postEditText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `markdown-table-syntax-${viewport.name}`, 8);
  return {
    rowName,
    committedValue,
    afterText,
    postEditText,
    rendered: true
  };
}

async function exerciseMarkdownInlineLinkSyntax(page, fixture, viewport) {
  const label = `Direct markdown link ${viewport.name} ${Date.now()}`;
  const targetUrl = `https://example.com/direct-markdown-link/${viewport.name}?token=${Date.now()}`;
  const expectedMarkdown = `[${label}](${targetUrl})`;
  const editToken = ` edited-${viewport.name}`;
  const afterText = `After markdown inline link ${viewport.name} ${Date.now()}`;
  const testLabel = "markdown inline link syntax";
  const capture = await enableShellOpenCapture(page);
  try {
    await moveToDocumentEnd(page);
    await page.keyboard.press("Enter");
    await page.keyboard.insertText(expectedMarkdown);
    await waitForEditorText(page, label, `${testLabel} label text ${viewport.name}`);
    const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, expectedMarkdown, `${testLabel} autosave ${viewport.name}`);
    if (!sourceMarkdown.includes(expectedMarkdown)) {
      throw new Error(`${testLabel} did not persist expected source: ${JSON.stringify({ expectedMarkdown, markdown: sourceMarkdown })}`);
    }

    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    const renderedLink = page.locator(".cm-md-link").filter({ hasText: label }).last();
    await renderedLink.waitFor({ timeout: 5_000 });
    await renderedLink.scrollIntoViewIfNeeded();
    await nextAnimationFrame(page);
    await assertIntersectsViewport(page, renderedLink, `${testLabel} rendered link ${viewport.name}`, 4);
    const rendered = await renderedLink.evaluate((element, expected) => {
      const lineText = element.closest(".cm-line")?.textContent ?? "";
      return {
        text: element.textContent ?? "",
        dataUrl: element.getAttribute("data-md-url") ?? "",
        lineText,
        leakedMarkdownTarget: lineText.includes("](") || lineText.includes(expected.targetUrl)
      };
    }, { targetUrl });
    if (rendered.text.trim() !== label || rendered.dataUrl !== targetUrl || rendered.leakedMarkdownTarget) {
      throw new Error(`${testLabel} rendered preview mismatch: ${JSON.stringify({ label, targetUrl, rendered })}`);
    }

    const clickResult = await assertDirectClickOpensLinkAndBlankClickEdits(page, fixture, {
      label: `${testLabel} ${viewport.name}`,
      visibleText: label,
      editToken,
      expectTitle: fixture.mainTitle,
      openUrl: targetUrl
    }, capture);

    await editorContent(page).click();
    await moveToDocumentEnd(page);
    await page.keyboard.type(afterText);
    await waitForEditorText(page, afterText, `${testLabel} continued typing ${viewport.name}`);
    const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${testLabel} final autosave ${viewport.name}`);
    if (!finalMarkdown.includes(editToken) || !finalMarkdown.includes(targetUrl) || !finalMarkdown.includes(afterText)) {
      throw new Error(`${testLabel} final Markdown missing edited label, URL, or continuation: ${JSON.stringify({ editToken, targetUrl, afterText, markdown: finalMarkdown })}`);
    }

    await assertEditorFocused(page, `${testLabel} editor focus ${viewport.name}`);
    await assertNoDocumentHorizontalOverflow(page, `markdown-inline-link-syntax-${viewport.name}`, 8);
    return {
      label,
      targetUrl,
      editToken,
      afterText,
      opened: clickResult.directClickOpened
    };
  } finally {
    await clearCapturedOpenRequests(page, capture).catch(() => undefined);
    await page.evaluate(() => window.lotion.debug?.setShellOpenDryRun?.(false)).catch(() => undefined);
  }
}

async function exerciseLotionCalloutFence(page, fixture, viewport) {
  const calloutText = `Direct callout fence body ${viewport.name} ${Date.now()}`;
  const afterText = `After direct callout fence ${viewport.name} ${Date.now()}`;
  const sourceBlock = `\`\`\`lotion-callout\nicon: 💡\n---\n${calloutText}\n\`\`\``;
  const label = "lotion callout fence";

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.insertText(`${sourceBlock}\n\n`);
  await waitForEditorText(page, calloutText, `${label} source body ${viewport.name}`);
  const initialMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, sourceBlock, `${label} source autosave ${viewport.name}`);
  if (!initialMarkdown.includes(sourceBlock)) {
    throw new Error(`${label} source did not persist: ${JSON.stringify({ sourceBlock, markdown: initialMarkdown })}`);
  }

  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);

  const callout = page.locator(".cm-md-callout-widget").last();
  await callout.waitFor({ timeout: 8_000 });
  await callout.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, callout, `${label} preview ${viewport.name}`, 4);

  const rendered = await page.evaluate((expectedBody) => {
    const widget = Array.from(document.querySelectorAll(".cm-md-callout-widget")).at(-1);
    const body = widget?.querySelector(".cm-md-callout-body");
    const icon = widget?.querySelector(".cm-md-callout-icon");
    const visibleSourceLines = Array.from(document.querySelectorAll(".cm-content .cm-line"))
      .filter((line) => (line.textContent ?? "").includes("lotion-callout"))
      .map((line) => line.textContent ?? "");
    return {
      text: body?.textContent ?? "",
      icon: icon?.textContent ?? "",
      className: widget?.getAttribute("class") ?? "",
      hasExpectedBody: Boolean(body?.textContent?.includes(expectedBody)),
      visibleSourceLines
    };
  }, calloutText);
  if (!rendered.hasExpectedBody || rendered.icon.trim() !== "💡") {
    throw new Error(`${label} preview did not render expected body/icon: ${JSON.stringify(rendered)}`);
  }
  if (rendered.visibleSourceLines.length) {
    throw new Error(`${label} source remained visible after cursor left fence: ${JSON.stringify(rendered)}`);
  }

  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, `${sourceBlock}\n\n${afterText}`, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(`${sourceBlock}\n\n${afterText}`)) {
    throw new Error(`${label} continuation did not persist below callout fence: ${JSON.stringify({ sourceBlock, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `lotion-callout-fence-${viewport.name}`, 8);
  return {
    calloutText,
    afterText,
    rendered: true
  };
}

async function exerciseLotionEquationFence(page, fixture, viewport) {
  const token = `${viewport.name}_${Date.now()}`;
  const equationText = `E_{${token}} = mc^2`;
  const afterText = `After direct equation fence ${viewport.name} ${Date.now()}`;
  const sourceBlock = `\`\`\`lotion-equation\n${equationText}\n\`\`\``;
  const label = "lotion equation fence";

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.insertText(`${sourceBlock}\n\n`);
  await waitForEditorText(page, equationText, `${label} source body ${viewport.name}`);
  const initialMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, sourceBlock, `${label} source autosave ${viewport.name}`);
  if (!initialMarkdown.includes(sourceBlock)) {
    throw new Error(`${label} source did not persist: ${JSON.stringify({ sourceBlock, markdown: initialMarkdown })}`);
  }

  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);

  const equation = page.locator(".cm-md-equation-widget").last();
  await equation.waitFor({ timeout: 8_000 });
  await equation.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, equation, `${label} preview ${viewport.name}`, 4);

  const rendered = await page.evaluate((expectedEquation) => {
    const widget = Array.from(document.querySelectorAll(".cm-md-equation-widget")).at(-1);
    const source = widget?.querySelector(".cm-md-equation-source");
    const marker = widget?.querySelector(".cm-md-equation-marker");
    const visibleSourceLines = Array.from(document.querySelectorAll(".cm-content .cm-line"))
      .filter((line) => (line.textContent ?? "").includes("```lotion-equation"))
      .map((line) => line.textContent ?? "");
    return {
      text: source?.textContent ?? "",
      marker: marker?.textContent ?? "",
      className: widget?.getAttribute("class") ?? "",
      hasExpectedEquation: Boolean(source?.textContent?.includes(expectedEquation)),
      visibleSourceLines
    };
  }, equationText);
  if (!rendered.hasExpectedEquation || rendered.marker.trim() !== "ƒ") {
    throw new Error(`${label} preview did not render expected equation/marker: ${JSON.stringify(rendered)}`);
  }
  if (rendered.visibleSourceLines.length) {
    throw new Error(`${label} source remained visible after cursor left fence: ${JSON.stringify(rendered)}`);
  }

  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, `${sourceBlock}\n\n${afterText}`, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(`${sourceBlock}\n\n${afterText}`)) {
    throw new Error(`${label} continuation did not persist below equation fence: ${JSON.stringify({ sourceBlock, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `lotion-equation-fence-${viewport.name}`, 8);
  return {
    equationText,
    afterText,
    rendered: true
  };
}

async function exerciseLotionIframeFence(page, fixture, viewport) {
  const token = `${viewport.name}-${Date.now()}`;
  const url = `about:blank#lotion-iframe-${token}`;
  const title = `Direct iframe preview ${viewport.name}`;
  const height = viewport.name === "compact" ? 160 : 180;
  const afterText = `After direct iframe fence ${viewport.name} ${Date.now()}`;
  const sourceBlock = [
    "```lotion-iframe",
    `url: ${url}`,
    `height: ${height}`,
    `title: ${title}`,
    "```"
  ].join("\n");
  const label = "lotion iframe fence";

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.insertText(`${sourceBlock}\n\n`);
  await waitForEditorText(page, title, `${label} source title ${viewport.name}`);
  const initialMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, sourceBlock, `${label} source autosave ${viewport.name}`);
  if (!initialMarkdown.includes(sourceBlock)) {
    throw new Error(`${label} source did not persist: ${JSON.stringify({ sourceBlock, markdown: initialMarkdown })}`);
  }

  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);

  const iframeWidget = page.locator(".cm-md-iframe-widget").last();
  await iframeWidget.waitFor({ timeout: 8_000 });
  await iframeWidget.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, iframeWidget, `${label} preview ${viewport.name}`, 4);

  const rendered = await page.evaluate((expected) => {
    const widget = Array.from(document.querySelectorAll(".cm-md-iframe-widget")).at(-1);
    const iframe = widget?.querySelector("iframe");
    const link = widget?.querySelector(".cm-md-iframe-widget-url");
    const titleEl = widget?.querySelector(".cm-md-iframe-widget-title");
    const visibleSourceLines = Array.from(document.querySelectorAll(".cm-content .cm-line"))
      .filter((line) => (line.textContent ?? "").includes("```lotion-iframe"))
      .map((line) => line.textContent ?? "");
    return {
      title: titleEl?.textContent ?? "",
      linkText: link?.textContent ?? "",
      linkHref: link?.getAttribute("href") ?? "",
      iframeSrc: iframe?.getAttribute("src") ?? "",
      iframeTitle: iframe?.getAttribute("title") ?? "",
      iframeHeight: iframe?.style.height ?? "",
      hasEditSource: Boolean(widget?.querySelector(".cm-md-edit-source")),
      hasExpectedTitle: titleEl?.textContent === expected.title,
      hasExpectedUrl: link?.getAttribute("href") === expected.url && iframe?.getAttribute("src") === expected.url,
      hasExpectedHeight: iframe?.style.height === `${expected.height}px`,
      visibleSourceLines
    };
  }, { title, url, height });
  if (!rendered.hasExpectedTitle || !rendered.hasExpectedUrl || !rendered.hasExpectedHeight || !rendered.hasEditSource) {
    throw new Error(`${label} preview did not render expected iframe attributes: ${JSON.stringify(rendered)}`);
  }
  if (rendered.visibleSourceLines.length) {
    throw new Error(`${label} source remained visible after cursor left fence: ${JSON.stringify(rendered)}`);
  }

  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, `${sourceBlock}\n\n${afterText}`, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(`${sourceBlock}\n\n${afterText}`)) {
    throw new Error(`${label} continuation did not persist below iframe fence: ${JSON.stringify({ sourceBlock, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `lotion-iframe-fence-${viewport.name}`, 8);
  return {
    title,
    url,
    height,
    afterText,
    rendered: true
  };
}

async function exerciseLotionToggleFence(page, fixture, viewport) {
  const token = `${viewport.name}-${Date.now()}`;
  const toggleImagePath = `attachments/toggle-${token}.png`;
  await writeFile(join(fixture.root, toggleImagePath), Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lU4Y7wAAAABJRU5ErkJggg==",
    "base64"
  ));
  const summary = `Direct toggle summary ${token}`;
  const bodyText = `Direct toggle body ${token}`;
  const nestedCode = [
    "```json",
    JSON.stringify({ token, nested: true }, null, 2),
    "```"
  ].join("\n");
  const nestedToggle = [
    "````lotion-toggle",
    `summary: Nested toggle ${token}`,
    "open: false",
    "---",
    `Nested toggle body ${token}`,
    "",
    "```js",
    "console.log('nested toggle code');",
    "```",
    "````"
  ].join("\n");
  const bodyMarkdown = [
    bodyText,
    `## Toggle heading ${token}`,
    `> Toggle quote ${token}`,
    `- Toggle bullet ${token}`,
    `1. Toggle numbered ${token}`,
    `- [ ] Toggle task unchecked ${token}`,
    `- [x] Toggle task checked ${token}`,
    [
      "| Type | Value |",
      "| --- | ---: |",
      `| Toggle table ${token} | 42 |`
    ].join("\n"),
    "---",
    `![Toggle image ${token}](${toggleImagePath})`,
    `[Toggle link ${token}](https://example.com/toggle/${token})`,
    nestedCode,
    nestedToggle,
    `After nested toggle code ${token}`
  ].join("\n\n");
  const editedSummary = `Edited toggle summary ${token}`;
  const afterText = `After direct toggle fence ${viewport.name} ${Date.now()}`;
  const sourceBlock = [
    "```lotion-toggle",
    `summary: ${summary}`,
    "open: true",
    "---",
    bodyMarkdown,
    "```"
  ].join("\n");
  const label = "lotion toggle fence";

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.insertText(`${sourceBlock}\n\n`);
  const initialMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, sourceBlock, `${label} source autosave ${viewport.name}`);
  if (!initialMarkdown.includes(sourceBlock)) {
    throw new Error(`${label} source did not persist: ${JSON.stringify({ sourceBlock, markdown: initialMarkdown })}`);
  }

  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);

  const toggleWidget = page.locator(".cm-md-toggle-widget-outer").last();
  await toggleWidget.waitFor({ timeout: 8_000 });
  await toggleWidget.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, toggleWidget, `${label} preview ${viewport.name}`, 4);

  const rendered = await page.evaluate((expected) => {
    const widget = Array.from(document.querySelectorAll(".cm-md-toggle-widget-outer")).at(-1);
    const summaryText = widget?.querySelector(".cm-md-toggle-summary-text");
    const body = widget?.querySelector(".cm-md-toggle-body");
    const disclosure = widget?.querySelector(".cm-md-toggle-disclosure");
    const visibleSourceLines = Array.from(document.querySelectorAll(".cm-content .cm-line"))
      .filter((line) => (line.textContent ?? "").includes("```lotion-toggle"))
      .map((line) => line.textContent ?? "");
    return {
      summary: summaryText?.textContent?.trim() ?? "",
      body: body?.textContent ?? "",
      bodyHtml: body instanceof HTMLElement ? body.innerHTML : "",
      expanded: disclosure?.getAttribute("aria-expanded") ?? "",
      bodyHidden: Boolean(body?.hidden),
      hasEditSource: Boolean(widget?.querySelector(".cm-md-edit-source")),
      hasExpectedSummary: summaryText?.textContent?.trim() === expected.summary,
      hasExpectedBody: Boolean(body?.textContent?.includes(expected.bodyText)),
      hasNestedCode: body instanceof HTMLElement && body.innerHTML.includes("<pre"),
      hasHeading: body instanceof HTMLElement && Boolean(body.querySelector("h2")),
      hasQuote: body instanceof HTMLElement && Boolean(body.querySelector("blockquote")),
      hasTable: body instanceof HTMLElement && Boolean(body.querySelector("table")),
      hasImage: body instanceof HTMLElement && Boolean(body.querySelector("img")),
      hasLink: body instanceof HTMLElement && Boolean(body.querySelector(`a[href="${expected.linkHref}"]`)),
      hasNestedToggleFence: body instanceof HTMLElement && body.innerHTML.includes("language-lotion-toggle"),
      visibleSourceLines
    };
  }, { summary, bodyText, linkHref: `https://example.com/toggle/${token}` });
  if (
    !rendered.hasExpectedSummary ||
    !rendered.hasExpectedBody ||
    !rendered.hasNestedCode ||
    !rendered.hasHeading ||
    !rendered.hasQuote ||
    !rendered.hasTable ||
    !rendered.hasImage ||
    !rendered.hasLink ||
    !rendered.hasNestedToggleFence ||
    rendered.expanded !== "true" ||
    rendered.bodyHidden ||
    rendered.hasEditSource
  ) {
    throw new Error(`${label} preview did not render expected toggle state: ${JSON.stringify(rendered)}`);
  }
  if (rendered.visibleSourceLines.length) {
    throw new Error(`${label} source remained visible after cursor left fence: ${JSON.stringify(rendered)}`);
  }

  const disclosure = toggleWidget.locator(".cm-md-toggle-disclosure").first();
  await disclosure.click();
  await page.waitForFunction(() => {
    const widget = Array.from(document.querySelectorAll(".cm-md-toggle-widget-outer")).at(-1);
    const disclosureButton = widget?.querySelector(".cm-md-toggle-disclosure");
    const body = widget?.querySelector(".cm-md-toggle-body");
    return disclosureButton?.getAttribute("aria-expanded") === "false" && Boolean(body?.hidden);
  }, null, { timeout: 5_000 });
  const collapsedBlock = [
    "`````lotion-toggle",
    `summary: ${summary}`,
    "open: false",
    "---",
    bodyMarkdown,
    "`````"
  ].join("\n");
  const collapsedMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, `${collapsedBlock}\n\n${afterText}`, `${label} collapsed autosave ${viewport.name}`);
  if (!collapsedMarkdown.includes(`${collapsedBlock}\n\n${afterText}`)) {
    throw new Error(`${label} collapsed writeback did not preserve body or continuation: ${JSON.stringify({ collapsedBlock, afterText, markdown: collapsedMarkdown })}`);
  }
  await disclosure.click();
  await page.waitForFunction(() => {
    const widget = Array.from(document.querySelectorAll(".cm-md-toggle-widget-outer")).at(-1);
    const disclosureButton = widget?.querySelector(".cm-md-toggle-disclosure");
    const body = widget?.querySelector(".cm-md-toggle-body");
    return disclosureButton?.getAttribute("aria-expanded") === "true" && !body?.hidden;
  }, null, { timeout: 5_000 });

  const summaryInput = toggleWidget.locator(".cm-md-toggle-summary-text").first();
  await summaryInput.fill(editedSummary);
  await summaryInput.press("Enter");
  await waitForPageMarkdown(page, fixture.mainPageId, `summary: ${editedSummary}`, `${label} edited summary autosave ${viewport.name}`);

  const edited = await page.evaluate((expected) => {
    const widget = Array.from(document.querySelectorAll(".cm-md-toggle-widget-outer")).at(-1);
    const summaryText = widget?.querySelector(".cm-md-toggle-summary-text");
    const body = widget?.querySelector(".cm-md-toggle-body");
    return {
      summary: summaryText?.textContent?.trim() ?? "",
      body: body?.textContent ?? "",
      hasEditedSummary: summaryText?.textContent?.trim() === expected.editedSummary,
      hasRenderedBody: Boolean(body?.textContent?.includes(expected.bodyText))
    };
  }, { editedSummary, bodyText });
  if (!edited.hasEditedSummary || !edited.hasRenderedBody) {
    throw new Error(`${label} widget did not reflect edited summary/rendered body: ${JSON.stringify(edited)}`);
  }

  const finalBlock = [
    "`````lotion-toggle",
    `summary: ${editedSummary}`,
    "open: true",
    "---",
    bodyMarkdown,
    "`````"
  ].join("\n");
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, `${finalBlock}\n\n${afterText}`, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(`${finalBlock}\n\n${afterText}`)) {
    throw new Error(`${label} continuation did not persist below toggle fence: ${JSON.stringify({ finalBlock, afterText, markdown: finalMarkdown })}`);
  }

  await focusEditorAtDocumentEnd(page, `${label} returned editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `lotion-toggle-fence-${viewport.name}`, 8);
  return {
    summary: editedSummary,
    body: bodyText,
    afterText,
    rendered: true
  };
}

async function exerciseLotionViewFence(page, fixture, viewport) {
  const afterText = `After direct lotion view fence ${viewport.name} ${Date.now()}`;
  const sourceBlock = [
    "```lotion-view",
    `database: ${fixture.databaseId}`,
    "view: view_default",
    "```"
  ].join("\n");
  const label = "lotion view fence";

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.insertText(`${sourceBlock}\n\n`);
  const initialMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, sourceBlock, `${label} source autosave ${viewport.name}`);
  if (!initialMarkdown.includes(sourceBlock)) {
    throw new Error(`${label} source did not persist: ${JSON.stringify({ sourceBlock, markdown: initialMarkdown })}`);
  }

  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);

  const widget = page.locator(".cm-md-lotion-view-widget").last();
  await widget.waitFor({ timeout: 8_000 });
  await widget.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, widget, `${label} widget ${viewport.name}`, 4);

  const rendered = await page.evaluate((expectedDatabaseName) => {
    const widget = Array.from(document.querySelectorAll(".cm-md-lotion-view-widget")).at(-1);
    const visibleSourceLines = Array.from(document.querySelectorAll(".cm-content .cm-line"))
      .filter((line) => (line.textContent ?? "").includes("```lotion-view"))
      .map((line) => line.textContent ?? "");
    return {
      text: widget?.textContent ?? "",
      hasDatabaseName: Boolean((widget?.textContent ?? "").includes(expectedDatabaseName)),
      hasEditSource: Boolean(widget?.querySelector(".cm-md-edit-source")),
      visibleSourceLines
    };
  }, fixture.databaseName);
  if (!rendered.hasDatabaseName || !rendered.hasEditSource) {
    throw new Error(`${label} widget did not render expected database preview: ${JSON.stringify(rendered)}`);
  }
  if (rendered.visibleSourceLines.length) {
    throw new Error(`${label} source remained visible after cursor left fence: ${JSON.stringify(rendered)}`);
  }

  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, `${sourceBlock}\n\n${afterText}`, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(`${sourceBlock}\n\n${afterText}`)) {
    throw new Error(`${label} continuation did not persist below view fence: ${JSON.stringify({ sourceBlock, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `lotion-view-fence-${viewport.name}`, 8);
  return {
    databaseId: fixture.databaseId,
    databaseName: fixture.databaseName,
    afterText,
    rendered: true
  };
}

async function exerciseSlashToggleBlock(page, fixture, viewport, options = {}) {
  const token = `${viewport.name}-${Date.now()}`;
  const summaryPrefix = options.summaryPrefix ?? "Slash toggle summary";
  const afterPrefix = options.afterPrefix ?? "After slash toggle block";
  const summary = `${summaryPrefix} ${token}`;
  const afterText = `${afterPrefix} ${viewport.name} ${Date.now()}`;
  const command = options.command ?? "/toggle";
  const label = options.label ?? "slash toggle block";

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  if (/^[\x00-\x7F]+$/.test(command)) {
    await page.keyboard.type(command);
  } else if (command.startsWith("/")) {
    await page.keyboard.type("/");
    await page.keyboard.insertText(command.slice(1));
  } else {
    await page.keyboard.insertText(command);
  }
  const menu = page.locator(".slash-menu").first();
  await menu.waitFor({ timeout: 5_000 }).catch(async (error) => {
    const debug = await page.evaluate(() => ({
      activeTag: document.activeElement?.tagName ?? "",
      activeClass: document.activeElement instanceof HTMLElement ? document.activeElement.className : "",
      focusedEditors: document.querySelectorAll(".cm-editor.cm-focused").length,
      menuCount: document.querySelectorAll(".slash-menu").length,
      recentLines: Array.from(document.querySelectorAll(".cm-line")).slice(-10).map((line) => line.textContent ?? ""),
      bodyTail: document.body.textContent?.slice(-600) ?? ""
    })).catch((debugError) => ({ debugError: debugError.message }));
    throw new Error(`${label} slash menu did not open for ${command}: ${JSON.stringify(debug)}. ${error.message}`);
  });
  const activeLabel = await page.locator(".slash-menu-item.active .slash-menu-label").first().textContent();
  if (activeLabel?.trim() !== "Toggle") {
    throw new Error(`${label} should select Toggle: ${JSON.stringify(activeLabel)}`);
  }

  await page.keyboard.press("Enter");
  await waitForEditorTextNot(page, command, `${label} command removed`);
  await page.keyboard.type(summary);
  await waitForEditorText(page, summary, `${label} summary source text`);
  const insertedMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, `summary: ${summary}`, `${label} summary autosave ${viewport.name}`);
  if (!insertedMarkdown.includes("```lotion-toggle\n") || !insertedMarkdown.includes("open: true\n---\n\n```")) {
    throw new Error(`${label} did not insert a valid toggle fence: ${JSON.stringify({ summary, markdown: insertedMarkdown })}`);
  }

  await moveToDocumentEnd(page);
  const widget = page.locator(".cm-md-toggle-widget-outer").last();
  await widget.waitFor({ timeout: 8_000 });
  await widget.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, widget, `${label} preview ${viewport.name}`, 4);

  const initial = await page.evaluate((expectedSummary) => {
    const widget = Array.from(document.querySelectorAll(".cm-md-toggle-widget-outer")).at(-1);
    const summaryText = widget?.querySelector(".cm-md-toggle-summary-text");
    const disclosure = widget?.querySelector(".cm-md-toggle-disclosure");
    const visibleSourceLines = Array.from(document.querySelectorAll(".cm-content .cm-line"))
      .filter((line) => (line.textContent ?? "").includes("```lotion-toggle"))
      .map((line) => line.textContent ?? "");
    return {
      summary: summaryText?.textContent?.trim() ?? "",
      expanded: disclosure?.getAttribute("aria-expanded") ?? "",
      hasEditSource: Boolean(widget?.querySelector(".cm-md-edit-source")),
      visibleSourceLines,
      hasExpectedSummary: summaryText?.textContent?.trim() === expectedSummary
    };
  }, summary);
  if (!initial.hasExpectedSummary || initial.expanded !== "true" || initial.hasEditSource) {
    throw new Error(`${label} widget did not render the inserted summary/open state: ${JSON.stringify(initial)}`);
  }
  if (initial.visibleSourceLines.length) {
    throw new Error(`${label} source remained visible after cursor left fence: ${JSON.stringify(initial)}`);
  }

  const disclosure = widget.locator(".cm-md-toggle-disclosure").first();
  await disclosure.click();
  await page.waitForFunction(() => {
    const widget = Array.from(document.querySelectorAll(".cm-md-toggle-widget-outer")).at(-1);
    const disclosureButton = widget?.querySelector(".cm-md-toggle-disclosure");
    const body = widget?.querySelector(".cm-md-toggle-body");
    return disclosureButton?.getAttribute("aria-expanded") === "false" && Boolean(body?.hidden);
  }, null, { timeout: 5_000 });
  await disclosure.click();
  await page.waitForFunction(() => {
    const widget = Array.from(document.querySelectorAll(".cm-md-toggle-widget-outer")).at(-1);
    const disclosureButton = widget?.querySelector(".cm-md-toggle-disclosure");
    const body = widget?.querySelector(".cm-md-toggle-body");
    return disclosureButton?.getAttribute("aria-expanded") === "true" && !body?.hidden;
  }, null, { timeout: 5_000 });

  await focusEditorAtDocumentEnd(page, `${label} returned editor focus ${viewport.name}`);
  await page.keyboard.press("Enter");
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${label} continuation autosave ${viewport.name}`);
  if (!finalMarkdown.includes(`summary: ${summary}\nopen: true\n---\n\n\`\`\`\n\n${afterText}`)) {
    throw new Error(`${label} continuation did not persist below the toggle fence: ${JSON.stringify({ summary, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `slash-toggle-block-${viewport.name}`, 8);
  return {
    command,
    summary,
    body: "",
    afterText,
    rendered: true
  };
}

async function exerciseSlashEquationBlock(page, fixture, viewport, options = {}) {
  const token = `${viewport.name}_${Date.now()}`;
  const equationText = `S_{${token}} = a^2 + b^2`;
  const command = options.command ?? "/equation";
  const label = options.label ?? "slash equation block";
  const afterPrefix = options.afterPrefix ?? "After slash equation block";
  const afterText = `${afterPrefix} ${viewport.name} ${Date.now()}`;
  const sourceBlock = `\`\`\`lotion-equation\n${equationText}\n\`\`\``;

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  if (/^[\x00-\x7F]+$/.test(command)) {
    await page.keyboard.type(command);
  } else if (command.startsWith("/")) {
    await page.keyboard.type("/");
    await page.keyboard.insertText(command.slice(1));
  } else {
    await page.keyboard.insertText(command);
  }
  const menu = page.locator(".slash-menu").first();
  await menu.waitFor({ timeout: 5_000 }).catch(async (error) => {
    const debug = await page.evaluate(() => ({
      activeTag: document.activeElement?.tagName ?? "",
      activeClass: document.activeElement instanceof HTMLElement ? document.activeElement.className : "",
      focusedEditors: document.querySelectorAll(".cm-editor.cm-focused").length,
      menuCount: document.querySelectorAll(".slash-menu").length,
      recentLines: Array.from(document.querySelectorAll(".cm-line")).slice(-10).map((line) => line.textContent ?? ""),
      bodyTail: document.body.textContent?.slice(-600) ?? ""
    })).catch((debugError) => ({ debugError: debugError.message }));
    throw new Error(`${label} slash menu did not open for ${command}: ${JSON.stringify(debug)}. ${error.message}`);
  });
  const activeLabel = await page.locator(".slash-menu-item.active .slash-menu-label").first().textContent();
  if (activeLabel?.trim() !== "Equation") {
    throw new Error(`${label} should select Equation: ${JSON.stringify(activeLabel)}`);
  }

  await page.keyboard.press("Enter");
  await waitForEditorTextNot(page, command, `${label} command removed`);
  await page.keyboard.insertText(equationText);
  await waitForEditorText(page, equationText, `${label} source body ${viewport.name}`);
  const initialMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, sourceBlock, `${label} source autosave ${viewport.name}`);
  if (!initialMarkdown.includes(sourceBlock)) {
    throw new Error(`${label} source did not persist: ${JSON.stringify({ sourceBlock, markdown: initialMarkdown })}`);
  }

  await moveToDocumentEnd(page);
  const equation = page.locator(".cm-md-equation-widget").last();
  await equation.waitFor({ timeout: 8_000 });
  await equation.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, equation, `${label} preview ${viewport.name}`, 4);

  const rendered = await page.evaluate((expectedEquation) => {
    const widget = Array.from(document.querySelectorAll(".cm-md-equation-widget")).at(-1);
    const source = widget?.querySelector(".cm-md-equation-source");
    const marker = widget?.querySelector(".cm-md-equation-marker");
    const visibleSourceLines = Array.from(document.querySelectorAll(".cm-content .cm-line"))
      .filter((line) => (line.textContent ?? "").includes("```lotion-equation"))
      .map((line) => line.textContent ?? "");
    return {
      text: source?.textContent ?? "",
      marker: marker?.textContent ?? "",
      className: widget?.getAttribute("class") ?? "",
      hasExpectedEquation: Boolean(source?.textContent?.includes(expectedEquation)),
      visibleSourceLines
    };
  }, equationText);
  if (!rendered.hasExpectedEquation || rendered.marker.trim() !== "ƒ") {
    throw new Error(`${label} preview did not render expected equation/marker: ${JSON.stringify(rendered)}`);
  }
  if (rendered.visibleSourceLines.length) {
    throw new Error(`${label} source remained visible after cursor left fence: ${JSON.stringify(rendered)}`);
  }

  await focusEditorAtDocumentEnd(page, `${label} returned editor focus ${viewport.name}`);
  await page.keyboard.press("Enter");
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, `${sourceBlock}\n\n${afterText}`, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(`${sourceBlock}\n\n${afterText}`)) {
    throw new Error(`${label} continuation did not persist below equation fence: ${JSON.stringify({ sourceBlock, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `slash-equation-block-${viewport.name}`, 8);
  return {
    command,
    equationText,
    afterText,
    rendered: true
  };
}

async function exerciseSlashEmbedBlock(page, fixture, viewport, options = {}) {
  const token = `${viewport.name}-${Date.now()}`;
  const url = `about:blank#slash-embed-${token}`;
  const title = "Embed";
  const height = 320;
  const command = options.command ?? "/embed";
  const label = options.label ?? "slash embed iframe block";
  const afterPrefix = options.afterPrefix ?? "After slash embed block";
  const afterText = `${afterPrefix} ${viewport.name} ${Date.now()}`;
  const sourceBlock = [
    "```lotion-iframe",
    `url: ${url}`,
    `height: ${height}`,
    `title: ${title}`,
    "```"
  ].join("\n");

  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  if (/^[\x00-\x7F]+$/.test(command)) {
    await page.keyboard.type(command);
  } else if (command.startsWith("/")) {
    await page.keyboard.type("/");
    await page.keyboard.insertText(command.slice(1));
  } else {
    await page.keyboard.insertText(command);
  }
  const menu = page.locator(".slash-menu").first();
  await menu.waitFor({ timeout: 5_000 }).catch(async (error) => {
    const debug = await page.evaluate(() => ({
      activeTag: document.activeElement?.tagName ?? "",
      activeClass: document.activeElement instanceof HTMLElement ? document.activeElement.className : "",
      focusedEditors: document.querySelectorAll(".cm-editor.cm-focused").length,
      menuCount: document.querySelectorAll(".slash-menu").length,
      recentLines: Array.from(document.querySelectorAll(".cm-line")).slice(-10).map((line) => line.textContent ?? ""),
      bodyTail: document.body.textContent?.slice(-600) ?? ""
    })).catch((debugError) => ({ debugError: debugError.message }));
    throw new Error(`${label} slash menu did not open for ${command}: ${JSON.stringify(debug)}. ${error.message}`);
  });
  const activeLabel = await page.locator(".slash-menu-item.active .slash-menu-label").first().textContent();
  if (activeLabel?.trim() !== "Embed") {
    throw new Error(`${label} should select Embed: ${JSON.stringify(activeLabel)}`);
  }

  await page.keyboard.press("Enter");
  await waitForEditorTextNot(page, command, `${label} command removed`);
  await page.keyboard.insertText(url);
  await waitForEditorText(page, url, `${label} source URL ${viewport.name}`);
  const initialMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, sourceBlock, `${label} source autosave ${viewport.name}`);
  if (!initialMarkdown.includes(sourceBlock)) {
    throw new Error(`${label} source did not persist: ${JSON.stringify({ sourceBlock, markdown: initialMarkdown })}`);
  }

  await moveToDocumentEnd(page);
  const iframeWidget = page.locator(".cm-md-iframe-widget").last();
  await iframeWidget.waitFor({ timeout: 8_000 });
  await iframeWidget.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, iframeWidget, `${label} preview ${viewport.name}`, 4);

  const rendered = await page.evaluate((expected) => {
    const widget = Array.from(document.querySelectorAll(".cm-md-iframe-widget")).at(-1);
    const iframe = widget?.querySelector("iframe");
    const link = widget?.querySelector(".cm-md-iframe-widget-url");
    const titleEl = widget?.querySelector(".cm-md-iframe-widget-title");
    const visibleSourceLines = Array.from(document.querySelectorAll(".cm-content .cm-line"))
      .filter((line) => (line.textContent ?? "").includes("```lotion-iframe"))
      .map((line) => line.textContent ?? "");
    return {
      title: titleEl?.textContent ?? "",
      linkText: link?.textContent ?? "",
      linkHref: link?.getAttribute("href") ?? "",
      iframeSrc: iframe?.getAttribute("src") ?? "",
      iframeTitle: iframe?.getAttribute("title") ?? "",
      iframeHeight: iframe?.style.height ?? "",
      hasEditSource: Boolean(widget?.querySelector(".cm-md-edit-source")),
      hasExpectedTitle: titleEl?.textContent === expected.title,
      hasExpectedUrl: link?.getAttribute("href") === expected.url && iframe?.getAttribute("src") === expected.url,
      hasExpectedHeight: iframe?.style.height === `${expected.height}px`,
      visibleSourceLines
    };
  }, { title, url, height });
  if (!rendered.hasExpectedTitle || !rendered.hasExpectedUrl || !rendered.hasExpectedHeight || !rendered.hasEditSource) {
    throw new Error(`${label} preview did not render expected iframe attributes: ${JSON.stringify(rendered)}`);
  }
  if (rendered.visibleSourceLines.length) {
    throw new Error(`${label} source remained visible after cursor left fence: ${JSON.stringify(rendered)}`);
  }

  await focusEditorAtDocumentEnd(page, `${label} returned editor focus ${viewport.name}`);
  await page.keyboard.press("Enter");
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${label} continued typing ${viewport.name}`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, `${sourceBlock}\n\n${afterText}`, `${label} final autosave ${viewport.name}`);
  if (!finalMarkdown.includes(`${sourceBlock}\n\n${afterText}`)) {
    throw new Error(`${label} continuation did not persist below iframe fence: ${JSON.stringify({ sourceBlock, afterText, markdown: finalMarkdown })}`);
  }

  await assertEditorFocused(page, `${label} editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `slash-embed-iframe-block-${viewport.name}`, 8);
  return {
    command,
    title,
    url,
    height,
    afterText,
    rendered: true
  };
}

async function exerciseSlashCallout(page, fixture, viewport, options = {}) {
  const command = options.command ?? "/callout";
  const testLabel = options.testLabel ?? "slash callout";
  const bodyPrefix = options.bodyPrefix ?? "Slash callout body";
  const afterPrefix = options.afterPrefix ?? "After slash callout";
  const calloutText = `${bodyPrefix} ${viewport.name} ${Date.now()}`;
  const afterText = `${afterPrefix} ${viewport.name} ${Date.now()}`;
  await page.keyboard.press("Enter");
  if (/^[\x00-\x7F]+$/.test(command)) {
    await page.keyboard.type(command);
  } else if (command.startsWith("/")) {
    await page.keyboard.type("/");
    await page.keyboard.insertText(command.slice(1));
  } else {
    await page.keyboard.insertText(command);
  }
  const menu = page.locator(".slash-menu").first();
  await menu.waitFor({ timeout: 5_000 }).catch(async (error) => {
    const debug = await page.evaluate(() => ({
      activeTag: document.activeElement?.tagName ?? "",
      activeClass: document.activeElement instanceof HTMLElement ? document.activeElement.className : "",
      focusedEditors: document.querySelectorAll(".cm-editor.cm-focused").length,
      menuCount: document.querySelectorAll(".slash-menu").length,
      recentLines: Array.from(document.querySelectorAll(".cm-line")).slice(-10).map((line) => line.textContent ?? ""),
      bodyTail: document.body.textContent?.slice(-600) ?? ""
    })).catch((debugError) => ({ debugError: debugError.message }));
    throw new Error(`${testLabel} slash menu did not open for ${command}: ${JSON.stringify(debug)}. ${error.message}`);
  });
  const activeLabel = await page.locator(".slash-menu-item.active .slash-menu-label").first().textContent();
  if (activeLabel?.trim() !== "Callout") {
    throw new Error(`${testLabel} should select Callout: ${JSON.stringify(activeLabel)}`);
  }
  await page.keyboard.press("Enter");
  await page.keyboard.type(calloutText);
  await waitForEditorText(page, calloutText, `${testLabel} body text`);
  await waitForEditorTextNot(page, command, `${testLabel} command removed`);

  const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, calloutText, `${testLabel} autosave`);
  if (!sourceMarkdown.includes("```lotion-callout\nicon: 💡\n---\n") || !sourceMarkdown.includes(calloutText)) {
    throw new Error(`${testLabel} did not persist as lotion-callout markdown: ${JSON.stringify({ calloutText, markdown: sourceMarkdown })}`);
  }

  await moveToDocumentEnd(page);
  const callout = page.locator(".cm-md-callout-widget").last();
  await callout.waitFor({ timeout: 5_000 });
  await callout.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, callout, `${testLabel} preview ${viewport.name}`, 4);
  const rendered = await page.evaluate(() => {
    const widget = Array.from(document.querySelectorAll(".cm-md-callout-widget")).at(-1);
    const body = widget?.querySelector(".cm-md-callout-body");
    const icon = widget?.querySelector(".cm-md-callout-icon");
    const visibleSourceLines = Array.from(document.querySelectorAll(".cm-content .cm-line"))
      .filter((line) => (line.textContent ?? "").includes("lotion-callout"))
      .map((line) => line.textContent ?? "");
    return {
      text: body?.textContent ?? "",
      icon: icon?.textContent ?? "",
      className: widget?.getAttribute("class") ?? "",
      visibleSourceLines
    };
  });
  if (!rendered.text.includes(calloutText) || rendered.icon.trim() !== "💡") {
    throw new Error(`${testLabel} preview did not render expected body/icon: ${JSON.stringify(rendered)}`);
  }
  if (rendered.visibleSourceLines.length) {
    throw new Error(`${testLabel} source remained visible after cursor left fence: ${JSON.stringify(rendered)}`);
  }

  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${testLabel} continued typing`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${testLabel} continuation autosave`);
  if (!finalMarkdown.includes(`${calloutText}\n\`\`\`\n${afterText}`)) {
    throw new Error(`${testLabel} continuation was not placed after the callout fence: ${JSON.stringify({ calloutText, afterText, markdown: finalMarkdown })}`);
  }
  await assertNoDocumentHorizontalOverflow(page, `${testLabel.replaceAll(" ", "-")}-${viewport.name}`, 8);
  return {
    command,
    text: calloutText,
    afterText,
    rendered: true
  };
}

async function exerciseSlashCodeBlock(page, fixture, viewport, options = {}) {
  const command = options.command ?? "/code";
  const testLabel = options.testLabel ?? "slash code";
  const codeNamePrefix = options.codeNamePrefix ?? "slashCode";
  const afterPrefix = options.afterPrefix ?? "After slash code block";
  const codeText = `const ${codeNamePrefix}${viewport.name} = true;`;
  const afterText = `${afterPrefix} ${viewport.name} ${Date.now()}`;
  await page.keyboard.press("Enter");
  if (/^[\x00-\x7F]+$/.test(command)) {
    await page.keyboard.type(command);
  } else if (command.startsWith("/")) {
    await page.keyboard.type("/");
    await page.keyboard.insertText(command.slice(1));
  } else {
    await page.keyboard.insertText(command);
  }
  const menu = page.locator(".slash-menu").first();
  await menu.waitFor({ timeout: 5_000 }).catch(async (error) => {
    const debug = await page.evaluate(() => ({
      activeTag: document.activeElement?.tagName ?? "",
      activeClass: document.activeElement instanceof HTMLElement ? document.activeElement.className : "",
      focusedEditors: document.querySelectorAll(".cm-editor.cm-focused").length,
      menuCount: document.querySelectorAll(".slash-menu").length,
      recentLines: Array.from(document.querySelectorAll(".cm-line")).slice(-10).map((line) => line.textContent ?? ""),
      bodyTail: document.body.textContent?.slice(-600) ?? ""
    })).catch((debugError) => ({ debugError: debugError.message }));
    throw new Error(`${testLabel} slash menu did not open for ${command}: ${JSON.stringify(debug)}. ${error.message}`);
  });
  const activeLabel = await page.locator(".slash-menu-item.active .slash-menu-label").first().textContent();
  if (activeLabel?.trim() !== "Code block") {
    throw new Error(`${testLabel} should select Code block: ${JSON.stringify(activeLabel)}`);
  }
  await page.keyboard.press("Enter");
  await page.keyboard.type(codeText);
  await waitForEditorText(page, codeText, `${testLabel} body text`);
  await waitForEditorTextNot(page, command, `${testLabel} command removed`);

  const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, codeText, `${testLabel} autosave`);
  if (!sourceMarkdown.includes(`\`\`\`\n${codeText}\n\`\`\`\n`)) {
    throw new Error(`${testLabel} did not persist with a trailing newline after the fence: ${JSON.stringify({ codeText, markdown: sourceMarkdown })}`);
  }

  await moveToDocumentEnd(page);
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${testLabel} continued typing`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${testLabel} continuation autosave`);
  if (!finalMarkdown.includes(`${codeText}\n\`\`\`\n${afterText}`)) {
    throw new Error(`${testLabel} continuation was not placed after the code fence: ${JSON.stringify({ codeText, afterText, markdown: finalMarkdown })}`);
  }
  await assertNoDocumentHorizontalOverflow(page, `${testLabel.replaceAll(" ", "-")}-${viewport.name}`, 8);
  return {
    command,
    codeText,
    afterText
  };
}

async function exerciseSlashQuote(page, fixture, viewport, options = {}) {
  const command = options.command ?? "/quote";
  const testLabel = options.testLabel ?? "slash quote";
  const quotePrefix = options.quotePrefix ?? "Slash quote text";
  const afterPrefix = options.afterPrefix ?? "After slash quote";
  const quoteText = `${quotePrefix} ${viewport.name} ${Date.now()}`;
  const afterText = `${afterPrefix} ${viewport.name} ${Date.now()}`;
  await moveToDocumentEnd(page);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Backspace");
  if (/^[\x00-\x7F]+$/.test(command)) {
    await page.keyboard.type(command);
  } else if (command.startsWith("/")) {
    await page.keyboard.type("/");
    await page.keyboard.insertText(command.slice(1));
  } else {
    await page.keyboard.insertText(command);
  }
  const menu = page.locator(".slash-menu").first();
  await menu.waitFor({ timeout: 5_000 }).catch(async (error) => {
    const debug = await page.evaluate(() => ({
      activeTag: document.activeElement?.tagName ?? "",
      activeClass: document.activeElement instanceof HTMLElement ? document.activeElement.className : "",
      focusedEditors: document.querySelectorAll(".cm-editor.cm-focused").length,
      menuCount: document.querySelectorAll(".slash-menu").length,
      recentLines: Array.from(document.querySelectorAll(".cm-line")).slice(-10).map((line) => line.textContent ?? ""),
      bodyTail: document.body.textContent?.slice(-600) ?? ""
    })).catch((debugError) => ({ debugError: debugError.message }));
    throw new Error(`${testLabel} slash menu did not open for ${command}: ${JSON.stringify(debug)}. ${error.message}`);
  });
  const activeLabel = await page.locator(".slash-menu-item.active .slash-menu-label").first().textContent();
  if (activeLabel?.trim() !== "Quote") {
    throw new Error(`${testLabel} should select Quote: ${JSON.stringify(activeLabel)}`);
  }
  await page.keyboard.press("Enter");
  await page.keyboard.type(quoteText);
  await waitForEditorText(page, quoteText, `${testLabel} text`);
  await waitForEditorTextNot(page, command, `${testLabel} command removed`);

  const quoteLine = page.locator(".cm-line.cm-md-line-blockquote").filter({ hasText: quoteText }).last();
  await quoteLine.waitFor({ timeout: 5_000 });
  await quoteLine.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, quoteLine, `${testLabel} preview ${viewport.name}`, 4);

  const sourceMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, quoteText, `${testLabel} autosave`);
  if (!sourceMarkdown.includes(`> ${quoteText}`)) {
    throw new Error(`${testLabel} did not persist as blockquote markdown: ${JSON.stringify({ quoteText, markdown: sourceMarkdown })}`);
  }

  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${testLabel} continued typing`);
  await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${testLabel} continuation autosave`);
  await assertEditorFocused(page, `${testLabel} continued editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `${testLabel.replaceAll(" ", "-")}-${viewport.name}`, 8);
  return {
    command,
    quoteText,
    afterText,
    rendered: true
  };
}

async function exerciseSlashPageLink(page, fixture, viewport, options = {}) {
  const command = options.command ?? "/secondary";
  const testLabel = options.testLabel ?? "slash page link";
  const expectedLink = `[${fixture.secondaryTitle}](${fixture.secondaryPath})`;
  const beforeMarkdown = await readPageMarkdown(page, fixture.mainPageId);
  const beforeLinkCount = countOccurrences(beforeMarkdown, expectedLink);

  await focusEditorAtDocumentEnd(page, `${testLabel} before command ${viewport.name}`);
  await page.keyboard.press("Enter");
  if (/^[\x00-\x7F]+$/.test(command)) {
    await page.keyboard.type(command);
  } else if (command.startsWith("/")) {
    await page.keyboard.type("/");
    await page.keyboard.insertText(command.slice(1));
  } else {
    await page.keyboard.insertText(command);
  }
  const menu = page.locator(".slash-menu").first();
  await menu.waitFor({ timeout: 5_000 }).catch(async (error) => {
    const debug = await page.evaluate(() => ({
      activeTag: document.activeElement?.tagName ?? "",
      activeClass: document.activeElement instanceof HTMLElement ? document.activeElement.className : "",
      focusedEditors: document.querySelectorAll(".cm-editor.cm-focused").length,
      menuCount: document.querySelectorAll(".slash-menu").length,
      recentLines: Array.from(document.querySelectorAll(".cm-line")).slice(-10).map((line) => line.textContent ?? ""),
      bodyTail: document.body.textContent?.slice(-600) ?? ""
    })).catch((debugError) => ({ debugError: debugError.message }));
    throw new Error(`${testLabel} slash menu did not open for ${command}: ${JSON.stringify(debug)}. ${error.message}`);
  });
  const pageItem = page.locator(".slash-menu-item").filter({ hasText: fixture.secondaryTitle }).first();
  await pageItem.waitFor({ timeout: 5_000 });
  await assertIntersectsViewport(page, pageItem, `${testLabel} command item ${viewport.name}`, 4);
  await pageItem.click();
  await waitForEditorText(page, fixture.secondaryTitle, `${testLabel} label`);
  await waitForNoRawSlashCommandLine(page, command, `${testLabel} command removed`);

  const markdown = await waitForPageMarkdownOccurrences(
    page,
    fixture.mainPageId,
    expectedLink,
    beforeLinkCount + 1,
    `${testLabel} autosave`
  );
  if (!markdown.includes(expectedLink)) {
    throw new Error(`${testLabel} did not persist the expected internal page link: ${JSON.stringify({ expectedLink, markdown })}`);
  }

  const renderedLink = page.locator(".cm-md-link").filter({ hasText: fixture.secondaryTitle }).last();
  await renderedLink.waitFor({ timeout: 5_000 });
  await assertIntersectsViewport(page, renderedLink, `${testLabel} rendered link ${viewport.name}`, 4);
  await renderedLink.click({ modifiers: [platformModifier()] });
  await waitForTitleValue(page, fixture.secondaryTitle);

  await openPage(page, fixture.mainPageId);
  await waitForTitleValue(page, fixture.mainTitle);
  await focusEditorAtDocumentEnd(page, `${testLabel} returned editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `${testLabel.replaceAll(" ", "-")}-${viewport.name}`, 8);
  return {
    command,
    title: fixture.secondaryTitle,
    target: fixture.secondaryPath,
    navigated: true
  };
}

async function exerciseSlashDatabaseView(page, fixture, viewport, options = {}) {
  const command = options.command ?? "/rows";
  const testLabel = options.testLabel ?? "slash database view";
  const afterPrefix = options.afterPrefix ?? "After slash database view";
  const targetMarker = `database: ${fixture.databaseId}`;
  const afterText = `${afterPrefix} ${viewport.name} ${Date.now()}`;
  const beforeMarkdown = await readPageMarkdown(page, fixture.mainPageId);
  const beforeViewCount = countOccurrences(beforeMarkdown, targetMarker);
  await page.keyboard.press("Enter");
  if (/^[\x00-\x7F]+$/.test(command)) {
    await page.keyboard.type(command);
  } else if (command.startsWith("/")) {
    await page.keyboard.type("/");
    await page.keyboard.insertText(command.slice(1));
  } else {
    await page.keyboard.insertText(command);
  }
  const menu = page.locator(".slash-menu").first();
  await menu.waitFor({ timeout: 5_000 }).catch(async (error) => {
    const debug = await page.evaluate(() => ({
      activeTag: document.activeElement?.tagName ?? "",
      activeClass: document.activeElement instanceof HTMLElement ? document.activeElement.className : "",
      focusedEditors: document.querySelectorAll(".cm-editor.cm-focused").length,
      menuCount: document.querySelectorAll(".slash-menu").length,
      recentLines: Array.from(document.querySelectorAll(".cm-line")).slice(-10).map((line) => line.textContent ?? ""),
      bodyTail: document.body.textContent?.slice(-600) ?? ""
    })).catch((debugError) => ({ debugError: debugError.message }));
    throw new Error(`${testLabel} slash menu did not open for ${command}: ${JSON.stringify(debug)}. ${error.message}`);
  });
  const databaseItem = page.locator(".slash-menu-item").filter({ hasText: fixture.databaseName }).first();
  await databaseItem.waitFor({ timeout: 5_000 });
  await assertIntersectsViewport(page, databaseItem, `${testLabel} command item ${viewport.name}`, 4);
  await databaseItem.click();
  await waitForEditorTextNot(page, command, `${testLabel} command removed`);

  const markdown = await waitForPageMarkdownOccurrences(page, fixture.mainPageId, targetMarker, beforeViewCount + 1, `${testLabel} autosave`);
  const expectedBlock = "```lotion-view\n" +
    `database: ${fixture.databaseId}\n` +
    "view: view_default\n" +
    "```\n";
  if (!markdown.includes(expectedBlock)) {
    throw new Error(`${testLabel} did not persist the expected lotion-view block: ${JSON.stringify({ expectedBlock, markdown })}`);
  }

  await moveToDocumentEnd(page);
  const widget = page.locator(".cm-md-lotion-view-widget").last();
  await widget.waitFor({ timeout: 8_000 });
  await widget.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  await assertIntersectsViewport(page, widget, `${testLabel} widget ${viewport.name}`, 4);
  const rendered = await page.evaluate((expectedDatabaseName) => {
    const widget = Array.from(document.querySelectorAll(".cm-md-lotion-view-widget")).at(-1);
    const visibleSourceLines = Array.from(document.querySelectorAll(".cm-content .cm-line"))
      .filter((line) => (line.textContent ?? "").includes("lotion-view"))
      .map((line) => line.textContent ?? "");
    return {
      text: widget?.textContent ?? "",
      hasDatabaseName: (widget?.textContent ?? "").includes(expectedDatabaseName),
      visibleSourceLines
    };
  }, fixture.databaseName);
  if (!rendered.hasDatabaseName) {
    throw new Error(`${testLabel} widget did not render the expected database name: ${JSON.stringify(rendered)}`);
  }
  if (rendered.visibleSourceLines.length) {
    throw new Error(`${testLabel} source remained visible after cursor left fence: ${JSON.stringify(rendered)}`);
  }

  await page.keyboard.type(afterText);
  await waitForEditorText(page, afterText, `${testLabel} continued typing`);
  const finalMarkdown = await waitForPageMarkdown(page, fixture.mainPageId, afterText, `${testLabel} continuation autosave`);
  if (!finalMarkdown.includes(`view: view_default\n\`\`\`\n${afterText}`)) {
    throw new Error(`${testLabel} continuation was not placed after the lotion-view fence: ${JSON.stringify({ afterText, markdown: finalMarkdown })}`);
  }
  await assertEditorFocused(page, `${testLabel} returned editor focus ${viewport.name}`);
  await assertNoDocumentHorizontalOverflow(page, `${testLabel.replaceAll(" ", "-")}-${viewport.name}`, 8);
  return {
    command,
    databaseId: fixture.databaseId,
    databaseName: fixture.databaseName,
    afterText,
    rendered: true
  };
}

async function exerciseEmptyRowPageFirstTyping(page, fixture, viewport) {
  await openRowPage(page, fixture.databaseId, fixture.emptyRowId);
  await page.getByText(fixture.emptyRowTitle).first().waitFor({ timeout: 8_000 });
  const prompt = page.locator(".empty-page-prompt").first();
  await prompt.waitFor({ timeout: 8_000 });
  await assertWithinViewport(page, prompt, `empty prompt ${viewport.name}`, 8);
  await prompt.focus();
  const activeEmptyOption = await page.locator(".empty-template-option.active").first().textContent({ timeout: 4_000 });
  if (!activeEmptyOption?.includes("Empty")) {
    throw new Error(`Expected empty prompt to default to Empty, got ${JSON.stringify(activeEmptyOption)}`);
  }
  await page.keyboard.press("Enter");
  const editor = editorContent(page);
  await editor.waitFor({ timeout: 8_000 });
  const smallText = await exercisePageSmallTextSetting(page, {
    label: `empty row page ${viewport.name}`,
    target: { type: "row_page", databaseId: fixture.databaseId, rowId: fixture.emptyRowId }
  });
  await editor.click();
  const firstTyping = `Empty row first typing ${viewport.name} ${Date.now()}`;
  await page.keyboard.type(firstTyping);
  await waitForEditorText(page, firstTyping, "empty row first typing");
  const markdown = await waitForRowPageMarkdown(page, fixture.databaseId, fixture.emptyRowId, firstTyping, "empty row autosave");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.lotion?.workspace), null, { timeout: 8_000 });
  await openRowPage(page, fixture.databaseId, fixture.emptyRowId);
  await waitForEditorText(page, firstTyping, "empty row reload persistence");
  await waitForSmallTextClass(page, true, `empty row page reload ${viewport.name}`);
  return {
    firstTyping,
    smallText,
    markdownLength: markdown.length
  };
}

async function exercisePageSmallTextSetting(page, { label, target }) {
  const beforeFont = await editorFontPx(page);
  const menuToggle = page.locator(".page-options-toggle").first();
  await menuToggle.click();
  const item = page.locator(".page-action-menu [role='menuitemcheckbox']").filter({ hasText: /Small text|小字体/ }).first();
  await item.waitFor({ timeout: 5_000 });
  const beforeChecked = await item.getAttribute("aria-checked");
  if (beforeChecked !== "false") {
    throw new Error(`${label} small-text switch should start unchecked, saw ${beforeChecked}`);
  }
  await item.click();
  await waitForSmallTextClass(page, true, label);
  const afterFont = await editorFontPx(page);
  if (!(afterFont < beforeFont)) {
    throw new Error(`${label} small-text font should shrink editor text: ${JSON.stringify({ beforeFont, afterFont })}`);
  }
  await page.locator(".title-input").first().click();
  await waitForSmallTextPersisted(page, target, label);
  await assertEditorLayout(page, `small-text-${label}`);
  return { beforeFont, afterFont };
}

async function waitForSmallTextPersisted(page, target, label) {
  const startedAt = Date.now();
  let lastState = null;
  while (Date.now() - startedAt < 8_000) {
    lastState = await page.evaluate(async (target) => {
      const doc = target.type === "page"
        ? await window.lotion.pages.get(target.pageId)
        : await window.lotion.rowPages.open(target.databaseId, target.rowId);
      return {
        smallText: Boolean(doc?.meta?.smallText),
        title: doc?.meta?.title ?? null,
        id: doc?.meta?.id ?? null,
        updated_time: doc?.meta?.updated_time ?? null
      };
    }, target);
    if (lastState.smallText) return lastState;
    await page.waitForTimeout(100);
  }
  throw new Error(`${label} small-text setting did not persist: ${JSON.stringify(lastState)}`);
}

async function exercisePageTagSearchChip(page, { tag, label }) {
  await pinPageDetails(page, label);
  const chip = page.locator(".page-property-tag-search").filter({ hasText: tag }).first();
  await chip.waitFor({ timeout: 8_000 });
  await assertIntersectsViewport(page, chip, `${label} chip`, 6);
  await chip.click();
  const clickState = await assertGlobalSearchForTag(page, tag, `${label} click`);
  await page.keyboard.press("Escape");
  await page.locator(".global-search").waitFor({ state: "detached", timeout: 8_000 });

  await focusVisibleTagSearchChip(page, tag, label);
  await page.keyboard.press("Enter");
  const keyboardState = await assertGlobalSearchForTag(page, tag, `${label} keyboard Enter`, 3_000).catch(async (enterError) => {
    await focusVisibleTagSearchChip(page, tag, label);
    await page.keyboard.press(" ");
    return await assertGlobalSearchForTag(page, tag, `${label} keyboard Space`, 5_000).catch(async (spaceError) => {
      const state = await page.evaluate(() => {
        const active = document.activeElement;
        return {
          activeTag: active?.tagName ?? "",
          activeClass: active instanceof HTMLElement ? active.className : "",
          activeText: active?.textContent?.slice(0, 120) ?? "",
          hasGlobalSearch: Boolean(document.querySelector(".global-search")),
          chipCount: document.querySelectorAll(".page-property-tag-search").length
        };
      });
      throw new Error(`${label} chip keyboard activation failed: ${JSON.stringify(state)}. Enter: ${enterError.message}. Space: ${spaceError.message}`);
    });
  });
  await page.keyboard.press("Escape");
  await page.locator(".global-search").waitFor({ state: "detached", timeout: 8_000 });
  return { clickState, keyboardState };
}

async function focusVisibleTagSearchChip(page, tag, label) {
  await pinPageDetails(page, `${label} keyboard focus`);
  const visibleChipState = await page.evaluate((expectedTag) => {
    const chips = Array.from(document.querySelectorAll("button.page-property-tag-search"));
    const visible = chips.find((chip) => {
      const rect = chip.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (chip.textContent ?? "").includes(expectedTag);
    });
    visible?.scrollIntoView({ block: "center", inline: "nearest" });
    return {
      found: Boolean(visible),
      chipCount: chips.length,
      visibleChipCount: chips.filter((chip) => {
        const rect = chip.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }).length
    };
  }, tag);
  if (!visibleChipState.found) {
    throw new Error(`${label} chip was not visible before keyboard focus: ${JSON.stringify(visibleChipState)}`);
  }

  await page.locator(".page-secondary-toggle").first().focus();
  for (let index = 0; index < 16; index += 1) {
    const activeState = await page.evaluate((expectedTag) => {
      const active = document.activeElement;
      return {
        activeTag: active?.tagName ?? "",
        activeClass: active instanceof HTMLElement ? active.className : "",
        activeText: active?.textContent?.slice(0, 120) ?? "",
        activeIsChip: Boolean(active instanceof HTMLElement &&
          active.classList.contains("page-property-tag-search") &&
          (active.textContent ?? "").includes(expectedTag))
      };
    }, tag);
    if (activeState.activeIsChip) return;
    await page.keyboard.press("Tab");
  }

  const finalState = await page.evaluate(() => {
    const active = document.activeElement;
    return {
      activeTag: active?.tagName ?? "",
      activeClass: active instanceof HTMLElement ? active.className : "",
      activeText: active?.textContent?.slice(0, 120) ?? "",
      chipCount: document.querySelectorAll(".page-property-tag-search").length
    };
  });
  throw new Error(`${label} chip did not receive keyboard focus by Tab navigation: ${JSON.stringify(finalState)}`);
}

async function pinPageDetails(page, label) {
  const panel = page.getByTestId("page-secondary-panel").first();
  await panel.waitFor({ timeout: 8_000 });
  const expanded = await panel.getAttribute("aria-expanded");
  if (expanded !== "true") {
    await page.locator(".page-secondary-toggle").first().click();
  }
  await page.waitForFunction(() => {
    const panel = document.querySelector("[data-testid='page-secondary-panel']");
    const content = document.querySelector(".page-secondary-content");
    if (!(panel instanceof HTMLElement) || !(content instanceof HTMLElement)) return false;
    const rect = content.getBoundingClientRect();
    return panel.getAttribute("aria-expanded") === "true" &&
      panel.classList.contains("pinned") &&
      rect.height > 12 &&
      window.getComputedStyle(content).visibility !== "hidden";
  }, null, { timeout: 5_000 }).catch(async (error) => {
    const state = await page.evaluate(() => {
      const panel = document.querySelector("[data-testid='page-secondary-panel']");
      const content = document.querySelector(".page-secondary-content");
      const rect = content?.getBoundingClientRect();
      return {
        panelClass: panel instanceof HTMLElement ? panel.className : "",
        expanded: panel?.getAttribute("aria-expanded") ?? "",
        contentVisibility: content ? getComputedStyle(content).visibility : "",
        contentHeight: rect ? Number(rect.height.toFixed(1)) : null
      };
    });
    throw new Error(`${label} page details did not pin open: ${JSON.stringify(state)}. ${error.message}`);
  });
  await assertWithinViewport(page, panel, `${label} page details`, 6);
}

async function assertGlobalSearchForTag(page, tag, label, timeout = 8_000) {
  const panel = page.locator(".global-search").first();
  await panel.waitFor({ timeout });
  await page.locator(".global-search-hit").first().waitFor({ timeout });
  const state = await page.evaluate((expectedTag) => {
    const panel = document.querySelector(".global-search");
    const input = document.querySelector(".global-search-input");
    const firstHit = document.querySelector(".global-search-hit");
    const panelRect = panel?.getBoundingClientRect();
    const firstHitRect = firstHit?.getBoundingClientRect();
    return {
      inputValue: input instanceof HTMLInputElement ? input.value : "",
      inputFocused: document.activeElement === input,
      firstHitText: firstHit?.textContent?.trim() ?? "",
      panelRect: panelRect ? {
        left: panelRect.left,
        right: panelRect.right,
        top: panelRect.top,
        bottom: panelRect.bottom,
        width: panelRect.width,
        height: panelRect.height
      } : null,
      firstHitRect: firstHitRect ? {
        left: firstHitRect.left,
        right: firstHitRect.right,
        top: firstHitRect.top,
        bottom: firstHitRect.bottom,
        width: firstHitRect.width,
        height: firstHitRect.height
      } : null,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scrollWidth: document.documentElement.scrollWidth,
      hasExpectedTag: (firstHit?.textContent ?? "").includes(expectedTag)
    };
  }, tag);
  if (state.inputValue !== tag || !state.inputFocused || !state.firstHitText || !state.hasExpectedTag) {
    throw new Error(`${label} did not open focused search results for tag ${JSON.stringify(tag)}: ${JSON.stringify(state)}`);
  }
  if (!state.panelRect || state.panelRect.left < 0 || state.panelRect.right > state.viewport.width || state.panelRect.bottom > state.viewport.height) {
    throw new Error(`${label} global search panel overflowed viewport: ${JSON.stringify(state)}`);
  }
  if (!state.firstHitRect || state.firstHitRect.left < state.panelRect.left || state.firstHitRect.right > state.panelRect.right) {
    throw new Error(`${label} global search result overflowed the panel: ${JSON.stringify(state)}`);
  }
  if (state.scrollWidth > state.viewport.width + 2) {
    throw new Error(`${label} introduced document horizontal overflow: ${JSON.stringify(state)}`);
  }
  await assertNoDocumentHorizontalOverflow(page, `${label} tag search`);
  return {
    inputValue: state.inputValue,
    firstHitText: state.firstHitText,
    panelWidth: Math.round(state.panelRect.width)
  };
}

async function waitForSmallTextClass(page, expected, label) {
  await page.waitForFunction(
    ({ expected }) => document.querySelector(".page-editor")?.classList.contains("small-text") === expected,
    { expected },
    { timeout: 5_000 }
  ).catch((error) => {
    throw new Error(`${label} small-text class did not become ${expected}: ${error.message}`);
  });
}

async function editorFontPx(page) {
  return page.locator(".codemirror-editor .cm-editor").first().evaluate((element) => {
    const value = Number.parseFloat(getComputedStyle(element).fontSize);
    if (!Number.isFinite(value)) throw new Error("Editor font size is not numeric.");
    return value;
  });
}

async function exerciseLargeDocumentEditing(page, fixture, viewport) {
  await openPage(page, fixture.largePageId);
  await waitForTitleValue(page, fixture.largeTitle);
  await assertEditorLayout(page, `large-${viewport.name}`);
  const scroller = page.locator(".cm-scroller").first();
  const beforeScroll = await scroller.evaluate((element) => {
    element.scrollTop = Math.floor((element.scrollHeight - element.clientHeight) * 0.55);
    element.dispatchEvent(new Event("scroll", { bubbles: true }));
    return {
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight
    };
  });
  await nextAnimationFrame(page);
  await page.locator(".cm-line").filter({ hasText: "Large editor paragraph 220" }).first().click({
    position: { x: 80, y: 12 },
    timeout: 5_000
  });
  await assertEditorFocused(page, "large document focus");
  const largeToken = `Large document edit ${viewport.name} ${Date.now()}`;
  await page.keyboard.type(`\n${largeToken}`);
  await waitForEditorText(page, largeToken, "large document inserted text");
  const afterScroll = await scroller.evaluate((element) => ({
    scrollTop: element.scrollTop,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight
  }));
  if (beforeScroll.scrollHeight > beforeScroll.clientHeight && afterScroll.scrollTop < beforeScroll.scrollTop * 0.35) {
    throw new Error(`Large document edit jumped near top: ${JSON.stringify({ beforeScroll, afterScroll })}`);
  }
  await waitForPageMarkdown(page, fixture.largePageId, largeToken, "large document autosave");
  return {
    largeToken,
    beforeScroll,
    afterScroll
  };
}

async function captureEditorRegressionSnapshot(page, fixture, viewport, artifactRoot, { normal, empty, large }) {
  await openPage(page, fixture.largePageId);
  await waitForTitleValue(page, fixture.largeTitle);
  await waitForEditorText(page, large.largeToken, `editor regression snapshot large token ${viewport.name}`);
  await assertEditorLayout(page, `editor-regression-snapshot-${viewport.name}`);
  const editor = page.locator('[data-testid="markdown-editor"]').first();
  const snapshot = await captureElementSnapshot({
    artifactRoot,
    locator: editor,
    metadata: {
      phase: "editor-regression",
      pageId: fixture.largePageId,
      firstToken: normal.firstToken,
      emptyFirstTyping: empty.firstTyping,
      largeToken: large.largeToken,
      typedMs: normal.typedMs
    },
    name: `editor-regression-${viewport.name}`,
    page,
    viewport
  });
  await assertElementSnapshotBaseline(snapshot, {
    label: `editor regression ${viewport.name}`,
    metadata: { phase: "editor-regression" },
    rect: {
      width: [360, viewport.width],
      height: [160, viewport.height]
    },
    requiredMetadataKeys: ["pageId", "firstToken", "emptyFirstTyping", "largeToken", "typedMs"],
    viewportName: viewport.name
  });
  return {
    phase: "editor-regression",
    ...snapshot
  };
}

async function assertEditorLayout(page, label) {
  const editor = page.locator('[data-testid="markdown-editor"]').first();
  const content = editorContent(page);
  const title = page.locator(".title-input").first();
  const actionBar = page.locator(".page-action-bar").first();
  await editor.waitFor({ timeout: 8_000 });
  await content.waitFor({ timeout: 8_000 });
  await assertIntersectsViewport(page, editor, `${label} editor`);
  await assertIntersectsViewport(page, content, `${label} editor content`);
  await assertWithinViewport(page, title, `${label} title`, 8);
  if (await actionBar.count()) {
    await assertWithinViewport(page, actionBar, `${label} action bar`, 8);
    const titleRect = await readRect(title);
    const actionRect = await readRect(actionBar);
    assertRectsDoNotOverlap(titleRect, actionRect, `${label} title/action bar`);
  }
  await assertNoDocumentHorizontalOverflow(page, label, 8);
}

async function assertEditorFocused(page, label) {
  const editor = page.locator('[data-testid="markdown-editor"]').first();
  await editor.waitFor({ timeout: 8_000 });
  await page.waitForFunction(
    () => {
      const editorRoot = document.querySelector('[data-testid="markdown-editor"]');
      return Boolean(editorRoot?.contains(document.activeElement) || editorRoot?.querySelector(".cm-focused"));
    },
    null,
    { timeout: 5_000 }
  ).catch(async (error) => {
    const active = await page.evaluate(() => ({
      activeTag: document.activeElement?.tagName ?? "",
      activeClass: document.activeElement instanceof HTMLElement ? document.activeElement.className : "",
      activeText: document.activeElement?.textContent?.slice(0, 120) ?? "",
      focusedEditors: document.querySelectorAll(".cm-editor.cm-focused").length
    }));
    throw new Error(`Expected focused CodeMirror editor: ${label}. ${JSON.stringify(active)}. ${error.message}`);
  });
  return assertFocusWithin(editor, label);
}

async function waitForEditorText(page, text, label) {
  await page.waitForFunction(
    ({ expected }) => (document.querySelector(".cm-content")?.textContent ?? "").includes(expected),
    { expected: text },
    { timeout: 8_000 }
  ).catch(async (error) => {
    const current = await page.locator(".cm-content").first().textContent().catch(() => "");
    throw new Error(`${label} missing ${JSON.stringify(text)}. Current editor text: ${JSON.stringify(current)}. ${error.message}`);
  });
}

async function waitForEditorTextNot(page, text, label) {
  await page.waitForFunction(
    ({ rejected }) => !(document.querySelector(".cm-content")?.textContent ?? "").includes(rejected),
    { rejected: text },
    { timeout: 8_000 }
  ).catch(async (error) => {
    const current = await page.locator(".cm-content").first().textContent().catch(() => "");
    throw new Error(`${label} still contained ${JSON.stringify(text)}. Current editor text: ${JSON.stringify(current)}. ${error.message}`);
  });
}

async function waitForNoRawSlashCommandLine(page, command, label) {
  await page.waitForFunction(
    ({ expected }) => Array.from(document.querySelectorAll(".cm-content .cm-line"))
      .every((line) => (line.textContent ?? "").trim() !== expected),
    { expected: command },
    { timeout: 8_000 }
  ).catch(async (error) => {
    const lines = await editorLineTexts(page);
    throw new Error(`${label} still had raw slash command line ${JSON.stringify(command)}. Current lines: ${JSON.stringify(lines)}. ${error.message}`);
  });
}

async function waitForEditorExactLine(page, text, label) {
  await page.waitForFunction(
    ({ expected }) => Array.from(document.querySelectorAll(".cm-content .cm-line"))
      .some((line) => (line.textContent ?? "") === expected),
    { expected: text },
    { timeout: 8_000 }
  ).catch(async (error) => {
    const lines = await editorLineTexts(page);
    throw new Error(`${label} missing exact line ${JSON.stringify(text)}. Current lines: ${JSON.stringify(lines)}. ${error.message}`);
  });
}

async function waitForEditorExactLineNot(page, text, label) {
  await page.waitForFunction(
    ({ rejected }) => !Array.from(document.querySelectorAll(".cm-content .cm-line"))
      .some((line) => (line.textContent ?? "") === rejected),
    { rejected: text },
    { timeout: 8_000 }
  ).catch(async (error) => {
    const lines = await editorLineTexts(page);
    throw new Error(`${label} still had exact line ${JSON.stringify(text)}. Current lines: ${JSON.stringify(lines)}. ${error.message}`);
  });
}

async function editorLineTexts(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll(".cm-content .cm-line"))
    .map((line) => line.textContent ?? ""));
}

function editorContent(page) {
  return page.locator('[data-testid="markdown-editor"] .cm-content').first();
}

async function focusEditorAtDocumentEnd(page, label) {
  const content = editorContent(page);
  await content.waitFor({ state: "visible", timeout: 8_000 });
  await content.evaluate((element) => {
    element.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await assertEditorFocused(page, label);
  await moveToDocumentEnd(page);
  await assertEditorFocused(page, label);
}

async function waitForTitleValue(page, title) {
  await page.waitForFunction(
    ({ expectedTitle }) => document.querySelector(".title-input")?.value === expectedTitle,
    { expectedTitle: title },
    { timeout: 8_000 }
  ).catch(async (error) => {
    const currentTitle = await page.locator(".title-input").first().inputValue().catch(() => "");
    throw new Error(`Expected title value ${JSON.stringify(title)}, got ${JSON.stringify(currentTitle)}. ${error.message}`);
  });
}

async function moveToDocumentEnd(page) {
  await page.keyboard.press(process.platform === "darwin" ? "Meta+End" : "Control+End").catch(() => undefined);
  await page.keyboard.press("End").catch(() => undefined);
}

async function readPageMarkdown(page, pageId) {
  return await page.evaluate(async (targetPageId) => {
    const doc = await window.lotion.pages.get(targetPageId);
    return doc.markdown;
  }, pageId);
}

async function waitForPageMarkdownOccurrences(page, pageId, text, minCount, label = "page markdown occurrences") {
  const deadline = Date.now() + 12_000;
  let lastMarkdown = "";
  while (Date.now() < deadline) {
    const markdown = await readPageMarkdown(page, pageId);
    if (countOccurrences(markdown, text) >= minCount) return markdown;
    lastMarkdown = markdown;
    await page.waitForTimeout(100);
  }
  throw new Error(`${label} did not contain ${minCount} occurrences of ${JSON.stringify(text)}. Last markdown: ${JSON.stringify(lastMarkdown)}`);
}

function countOccurrences(text, needle) {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while (true) {
    index = text.indexOf(needle, index);
    if (index === -1) return count;
    count += 1;
    index += needle.length;
  }
}

async function pressModifierShortcut(page, key) {
  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  await page.keyboard.press(`${modifier}+${key}`);
}

function platformModifier() {
  return process.platform === "darwin" ? "Meta" : "Control";
}

async function pressRedo(page) {
  const modifier = platformModifier();
  await page.keyboard.press(process.platform === "darwin" ? `${modifier}+Shift+Z` : `${modifier}+Y`);
}

async function pasteTextIntoEditor(page, text) {
  try {
    await page.evaluate(async (value) => {
      await navigator.clipboard.writeText(value);
    }, text);
    await pressModifierShortcut(page, "v");
    return "clipboard";
  } catch {
    await page.keyboard.insertText(text);
    return "insertTextFallback";
  }
}

async function pasteHtmlIntoEditor(page, payload) {
  try {
    await page.evaluate(async ({ html, plainText }) => {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        throw new Error("HTML clipboard write is unavailable");
      }
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plainText], { type: "text/plain" })
        })
      ]);
    }, payload);
    await pressModifierShortcut(page, "v");
    return "clipboardHtml";
  } catch {
    const state = await page.evaluate(({ html, plainText }) => {
      const content = document.querySelector(".cm-content");
      if (!content) throw new Error("Editor content is not available for synthetic HTML paste");
      const dataTransfer = new DataTransfer();
      dataTransfer.setData("text/html", html);
      dataTransfer.setData("text/plain", plainText);
      const event = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer
      });
      content.dispatchEvent(event);
      return {
        defaultPrevented: event.defaultPrevented,
        textContent: content.textContent ?? ""
      };
    }, payload);
    if (!state.defaultPrevented) {
      throw new Error(`Synthetic HTML paste was not handled by the editor: ${JSON.stringify(state)}`);
    }
    return "syntheticHtml";
  }
}

async function installDroppedAttachmentImportStub(page, attachment) {
  await page.evaluate((payload) => {
    Object.defineProperty(window, "__lotionRestoreDroppedAttachmentImport", {
      configurable: true,
      value: () => {
        delete window.__lotionTestImportDroppedFiles;
      }
    });
    Object.defineProperty(window, "__lotionDroppedAttachmentImportCalls", {
      configurable: true,
      value: []
    });
    window.__lotionTestImportDroppedFiles = async (files) => {
      const names = Array.from(files ?? []).map((file) => file.name);
      window.__lotionDroppedAttachmentImportCalls.push(names);
      return [{
        path: payload.attachmentPath,
        originalName: payload.fileName,
        isImage: payload.isImage,
        sha: "smoke-dropped-attachment",
        category: payload.isImage ? "images" : "documents"
      }];
    };
  }, attachment);
}

async function restoreDroppedAttachmentImportStub(page) {
  await page.evaluate(() => {
    window.__lotionRestoreDroppedAttachmentImport?.();
    delete window.__lotionRestoreDroppedAttachmentImport;
    delete window.__lotionDroppedAttachmentImportCalls;
  });
}

async function dispatchEditorFileDrop(page, fileName, text, type = "text/plain") {
  const editor = page.locator(".cm-editor").first();
  await editor.scrollIntoViewIfNeeded();
  await nextAnimationFrame(page);
  return await page.evaluate(({ fileName, text, type }) => {
    const editor = document.querySelector(".cm-editor");
    const content = document.querySelector(".cm-content");
    if (!editor || !content) throw new Error("Editor DOM is not available for file drop");
    const rect = content.getBoundingClientRect();
    const file = new File([text], fileName, { type });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    const eventInit = {
      bubbles: true,
      cancelable: true,
      clientX: Math.max(rect.left + 24, rect.left + 1),
      clientY: Math.max(rect.top + Math.min(rect.height - 8, 120), rect.top + 1),
      dataTransfer
    };
    const dragover = new DragEvent("dragover", eventInit);
    content.dispatchEvent(dragover);
    const drop = new DragEvent("drop", eventInit);
    content.dispatchEvent(drop);
    return {
      dragoverDefaultPrevented: dragover.defaultPrevented,
      dropDefaultPrevented: drop.defaultPrevented,
      fileCount: dataTransfer.files.length,
      targetClass: editor.className
    };
  }, { fileName, text, type });
}

async function enableShellOpenCapture(page) {
  const dryRun = await page.evaluate(async () => {
    const debug = window.lotion.debug;
    if (!debug?.setShellOpenDryRun || !debug?.clearShellOpenRequests || !debug?.getShellOpenRequests) {
      return { enabled: false };
    }
    await debug.setShellOpenDryRun(true);
    await debug.clearShellOpenRequests();
    return { enabled: true };
  });
  if (dryRun.enabled) return { mode: "debug-dry-run" };

  const patch = await page.evaluate(() => {
    const opened = [];
    Object.defineProperty(window, "__lotionOpenedUrls", {
      configurable: true,
      value: opened
    });
    const original = window.lotion.shell.openLink;
    try {
      window.lotion.shell.openLink = async (url) => {
        opened.push(url);
        return "";
      };
      if (window.lotion.shell.openLink === original) {
        Object.defineProperty(window.lotion.shell, "openLink", {
          configurable: true,
          value: async (url) => {
            opened.push(url);
            return "";
          }
        });
      }
      return { patched: window.lotion.shell.openLink !== original };
    } catch (error) {
      return {
        patched: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
  if (!patch.patched) {
    throw new Error(`Could not capture shell.openLink for markdown link smoke: ${JSON.stringify(patch)}`);
  }
  return { mode: "patched-shell-open" };
}

async function clearCapturedOpenRequests(page, capture) {
  await page.evaluate(async (mode) => {
    if (mode === "debug-dry-run") await window.lotion.debug?.clearShellOpenRequests?.();
    if (Array.isArray(window.__lotionOpenedUrls)) window.__lotionOpenedUrls.length = 0;
  }, capture.mode);
}

async function readCapturedOpenRequests(page, capture) {
  return page.evaluate(async (mode) => {
    if (mode === "debug-dry-run") return await window.lotion.debug?.getShellOpenRequests?.() ?? [];
    return Array.isArray(window.__lotionOpenedUrls) ? [...window.__lotionOpenedUrls] : [];
  }, capture.mode);
}

async function waitForCapturedOpenRequest(page, capture, expectedUrl) {
  await page.waitForFunction(
    async ({ mode, expected }) => {
      if (mode === "debug-dry-run") {
        return (await window.lotion.debug.getShellOpenRequests()).includes(expected);
      }
      const opened = window.__lotionOpenedUrls;
      return Array.isArray(opened) && opened.includes(expected);
    },
    { mode: capture.mode, expected: expectedUrl },
    { timeout: 5_000 }
  );
  return readCapturedOpenRequests(page, capture);
}

async function clickVisibleText(page, text, options = {}) {
  const point = await textPoint(page, text, { bias: options.bias ?? 0.5 });
  if (!options.modifier) {
    await page.mouse.click(point.x, point.y);
    return;
  }
  const modifier = process.platform === "darwin" ? "Meta" : "Control";
  await page.evaluate(({ clickPoint, activeModifier }) => {
    const target = document.elementFromPoint(clickPoint.x, clickPoint.y);
    if (!target) throw new Error(`Could not find click target at ${clickPoint.x},${clickPoint.y}`);
    target.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: clickPoint.x,
      clientY: clickPoint.y,
      metaKey: activeModifier === "Meta",
      ctrlKey: activeModifier === "Control"
    }));
  }, { clickPoint: point, activeModifier: modifier });
}

async function textPoint(page, text, options = {}) {
  return page.evaluate(({ needle, bias }) => {
    const editor = document.querySelector('[data-testid="markdown-editor"] .cm-content');
    if (!editor) throw new Error("Could not locate markdown editor content");
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const content = node.textContent ?? "";
      const index = content.indexOf(needle);
      if (index < 0) continue;
      const range = document.createRange();
      const offset = index + Math.max(0, Math.min(needle.length - 1, Math.floor(needle.length * bias)));
      range.setStart(node, offset);
      range.setEnd(node, Math.min(offset + 1, content.length));
      const rect = range.getBoundingClientRect();
      if (rect.width || rect.height) {
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
      }
    }
    throw new Error(`Could not locate visible text: ${needle}`);
  }, { needle: text, bias: options.bias ?? 0.5 });
}

async function blankPointAfterText(page, text) {
  return page.evaluate((needle) => {
    const editor = document.querySelector('[data-testid="markdown-editor"] .cm-content');
    if (!editor) throw new Error("Could not locate markdown editor content");
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const content = node.textContent ?? "";
      const index = content.indexOf(needle);
      if (index < 0) continue;
      const range = document.createRange();
      range.setStart(node, index);
      range.setEnd(node, index + needle.length);
      const textRect = range.getBoundingClientRect();
      const line = node.parentElement?.closest(".cm-line");
      const lineRect = line?.getBoundingClientRect();
      if (!lineRect || !textRect.width || !textRect.height) continue;
      const x = Math.min(lineRect.right - 16, Math.max(textRect.right + 48, lineRect.left + 280));
      if (x <= textRect.right + 8) {
        throw new Error(`No blank editable area after ${needle}: ${JSON.stringify({ textRect, lineRect })}`);
      }
      return {
        x,
        y: textRect.top + textRect.height / 2
      };
    }
    throw new Error(`Could not locate visible text for blank-space click: ${needle}`);
  }, text);
}

async function selectEditorTextByDrag(page, text) {
  const editor = editorContent(page);
  await editor.waitFor({ timeout: 8_000 });
  const range = await page.evaluate((expected) => {
    const lines = Array.from(document.querySelectorAll(".cm-content .cm-line"));
    const line = lines.find((candidate) => (candidate.textContent ?? "").includes(expected));
    if (!line) return null;
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let text = "";
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      textNodes.push({ node, start: text.length, end: text.length + (node.textContent ?? "").length });
      text += node.textContent ?? "";
    }
    const start = text.indexOf(expected);
    if (start < 0) return null;
    const end = start + expected.length;
    const startNode = textNodes.find((entry) => start >= entry.start && start <= entry.end);
    const endNode = textNodes.find((entry) => end >= entry.start && end <= entry.end);
    if (!startNode || !endNode) return null;
    const selectionRange = document.createRange();
    selectionRange.setStart(startNode.node, start - startNode.start);
    selectionRange.setEnd(endNode.node, end - endNode.start);
    const rect = selectionRange.getBoundingClientRect();
    return {
      from: { x: rect.left + 1, y: rect.top + rect.height / 2 },
      to: { x: rect.right - 1, y: rect.top + rect.height / 2 }
    };
  }, text);
  if (!range) throw new Error(`Could not locate editor text range for ${JSON.stringify(text)}`);

  await page.mouse.move(range.from.x, range.from.y);
  await page.mouse.down();
  await page.mouse.move(range.to.x, range.to.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForFunction(
    ({ expected }) => (window.getSelection()?.toString() ?? "").includes(expected),
    { expected: text },
    { timeout: 5_000 }
  ).catch(async (error) => {
    const selected = await page.evaluate(() => window.getSelection()?.toString() ?? "");
    throw new Error(`Mouse drag did not select ${JSON.stringify(text)}. Selected=${JSON.stringify(selected)}. ${error.message}`);
  });
  await editor.click({ position: { x: 1, y: 1 }, trial: true }).catch(() => undefined);
}

async function selectEditorTextWithSearch(page, text) {
  const editor = editorContent(page);
  await editor.waitFor({ timeout: 8_000 });
  await editor.click();
  await page.keyboard.press(`${platformModifier()}+f`);
  const searchInput = page.locator('.cm-search input[name="search"]').first();
  await searchInput.waitFor({ timeout: 5_000 });
  await searchInput.fill(text);
  await page.locator('.cm-search button[name="next"]').first().click();
  await page.waitForFunction(
    ({ expected }) => window.__lotionEditorSelectionText === expected &&
      Boolean(document.querySelector(".cm-editor.cm-md-has-selection")),
    { expected: text },
    { timeout: 5_000 }
  ).catch(async (error) => {
    const diagnostic = await page.evaluate(() => ({
      selectedText: window.__lotionEditorSelectionText ?? "",
      nativeSelection: window.getSelection()?.toString() ?? "",
      editorHasSelection: Boolean(document.querySelector(".cm-editor.cm-md-has-selection"))
    }));
    throw new Error(`CodeMirror search did not select ${JSON.stringify(text)}: ${JSON.stringify(diagnostic)}. ${error.message}`);
  });
}

async function createEditorRegressionFixture(viewportName) {
  const root = await mkdtemp(join(tmpdir(), `lotion-editor-regression-${viewportName}-`));
  const now = "2026-01-01T00:00:00.000Z";
  const mainPageId = `pg_editor_main_${viewportName}`;
  const secondaryPageId = `pg_editor_secondary_${viewportName}`;
  const largePageId = `pg_editor_large_${viewportName}`;
  const mainTitle = `Editor Regression Main ${viewportName}`;
  const mainPageTag = `editor-tag-${viewportName}`;
  const secondaryTitle = `Editor Regression Secondary ${viewportName}`;
  const largeTitle = `Editor Regression Large ${viewportName}`;
  const databaseId = `db_editor_rows_${viewportName}`;
  const databaseName = `Editor Regression Rows ${viewportName}`;
  const emptyRowId = `row_editor_empty_${viewportName}`;
  const emptyRowTitle = `Editor Empty Row ${viewportName}`;
  const pagesFolder = databaseFolderName(PAGES_DATABASE_ID, "pages");
  const pagesDir = join(root, "databases", "system", pagesFolder);
  const databaseFolder = databaseFolderName(databaseId, databaseName);
  const databaseDir = join(root, "databases", "user", databaseFolder);
  const mainPath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(mainPageId, mainTitle));
  const secondaryPath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(secondaryPageId, secondaryTitle));
  const largePath = workspacePath("system", pagesFolder, "pages", pageMarkdownFileName(largePageId, largeTitle));
  const rowPageFile = pageMarkdownFileName(emptyRowId, emptyRowTitle);
  const rowPagePath = workspacePath("user", databaseFolder, "pages", rowPageFile);
  const attachmentPath = "attachments/documents/editor-link-note.txt";
  const bareUrl = `https://example.com/editor-link/${viewportName}`;
  const inlineExternalLabel = `External link label ${viewportName}`;
  const inlineExternalUrl = `https://example.com/editor-inline/${viewportName}`;
  const decodedExternalLabelVisible = `https://example.com/editor decoded ${viewportName}`;
  const decodedExternalLabelMarkdown = `https://example.com/editor%20decoded%20${viewportName}`;
  const decodedExternalUrl = `https://example.com/editor-decoded-target/${viewportName}`;
  const internalLinkLabel = `Secondary internal link ${viewportName}`;
  const attachmentLinkLabel = `Attachment link label ${viewportName}`;
  const directImagePath = "attachments/images/editor-direct-image.svg";

  await mkdir(join(pagesDir, "pages"), { recursive: true });
  await mkdir(join(pagesDir, "views"), { recursive: true });
  await mkdir(join(databaseDir, "pages"), { recursive: true });
  await mkdir(join(databaseDir, "views"), { recursive: true });
  await mkdir(join(root, "attachments", "documents"), { recursive: true });
  await mkdir(join(root, "attachments", "images"), { recursive: true });
  await writeJson(join(root, "lotion.json"), {
    version: 1,
    spaceId: `sp_editor_regression_${viewportName}`,
    name: `Editor Regression ${viewportName}`,
    pages: [mainPageId, secondaryPageId, largePageId],
    databases: [databaseId],
    systemDatabases: [PAGES_DATABASE_ID]
  });
  await writeJson(join(pagesDir, "schema.json"), pagesSchema(now));
  await writeJson(join(pagesDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(PAGES_DATABASE_ID, ["title", "path", "icon"]));
  await writeCsv(join(pagesDir, "data.csv"), pagesFieldIds(), [
    pageRecord({
      id: mainPageId,
      title: mainTitle,
      now,
      icon: "emoji:TE",
      path: ["Smoke", mainTitle],
      bodyPath: mainPath,
      tags: [mainPageTag, "writing"]
    }),
    pageRecord({
      id: secondaryPageId,
      title: secondaryTitle,
      now,
      icon: "emoji:S",
      path: ["Smoke", secondaryTitle],
      bodyPath: secondaryPath
    }),
    pageRecord({
      id: largePageId,
      title: largeTitle,
      now,
      icon: "emoji:L",
      path: ["Smoke", largeTitle],
      bodyPath: largePath
    })
  ]);
  await writeFile(join(root, mainPath), `# ${mainTitle}

Alpha seed line.
Second seed line for selection.

Bare URL fixture: ${bareUrl}
Markdown link fixture: [${inlineExternalLabel}](${inlineExternalUrl})
Decoded URL label fixture: [${decodedExternalLabelMarkdown}](${decodedExternalUrl})
Internal link fixture: [${internalLinkLabel}](${secondaryPath})
Attachment link fixture: [${attachmentLinkLabel}](${attachmentPath})
`, "utf8");
  await writeFile(join(root, secondaryPath), `# ${secondaryTitle}\n\nSwitch target page.\n`, "utf8");
  await writeFile(join(root, largePath), largeMarkdown(largeTitle), "utf8");
  await writeFile(join(root, attachmentPath), "fixture attachment for markdown link editing smoke\n", "utf8");
  await writeFile(join(root, directImagePath), editorDirectImageSvg(viewportName), "utf8");

  await writeJson(join(databaseDir, "schema.json"), {
    id: databaseId,
    name: databaseName,
    created_time: now,
    updated_time: now,
    defaultViewId: DEFAULT_VIEW_ID,
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "created_time", name: "Created time", type: "created_time", system: true },
      { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
      { id: "title", name: "Name", type: "text" },
      { id: "row_icon", name: "Icon", type: "text" },
      { id: "page_file", name: "Page file", type: "text", system: true, hidden: true }
    ]
  });
  await writeJson(join(databaseDir, "views", `${DEFAULT_VIEW_ID}.json`), defaultView(databaseId, ["title"]));
  await writeCsv(join(databaseDir, "data.csv"), ["id", "created_time", "updated_time", "title", "row_icon", "page_file"], [{
    id: emptyRowId,
    created_time: now,
    updated_time: now,
    title: emptyRowTitle,
    row_icon: "",
    page_file: rowPageFile
  }]);
  await writeFile(join(root, rowPagePath), "", "utf8");

  return {
    root,
    mainPageId,
    secondaryPageId,
    secondaryPath,
    largePageId,
    mainTitle,
    mainPageTag,
    secondaryTitle,
    largeTitle,
    databaseId,
    databaseName,
    emptyRowId,
    emptyRowTitle,
    bareUrl,
    inlineExternalLabel,
    inlineExternalUrl,
    decodedExternalLabelVisible,
    decodedExternalUrl,
    internalLinkLabel,
    attachmentLinkLabel,
    attachmentPath,
    directImagePath
  };
}

function editorDirectImageSvg(viewportName) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80" viewBox="0 0 160 80">
  <rect width="160" height="80" rx="10" fill="#f4eee2"/>
  <circle cx="38" cy="40" r="18" fill="#3f7f52"/>
  <text x="70" y="45" font-family="Arial, sans-serif" font-size="14" fill="#28231f">${viewportName}</text>
</svg>
`;
}

function largeMarkdown(title) {
  const lines = [`# ${title}`, ""];
  for (let index = 0; index < 420; index += 1) {
    lines.push(`Large editor paragraph ${index}: enough stable text to exercise scroll retention, decoration sync, and insertion latency.`);
  }
  return `${lines.join("\n")}\n`;
}

function pagesFieldIds() {
  return [
    "id",
    "created_time",
    "updated_time",
    "title",
    "kind",
    "body_path",
    "icon",
    "cover",
    "cover_offset",
    "path",
    "parent_id",
    "tags",
    "date",
    "url",
    "full_width",
    "small_text",
    "database_id",
    "row_id",
    "page_file"
  ];
}

function pageRecord({ id, title, now, icon, path, bodyPath, tags = [] }) {
  return {
    id,
    created_time: now,
    updated_time: now,
    title,
    kind: "page",
    body_path: bodyPath,
    icon,
    cover: "",
    cover_offset: "",
    path: serializePathValue(path),
    parent_id: "",
    tags: tags.join(";"),
    date: "",
    url: "",
    full_width: "",
    small_text: "",
    database_id: PAGES_DATABASE_ID,
    row_id: id,
    page_file: ""
  };
}

function pagesSchema(now) {
  return {
    id: PAGES_DATABASE_ID,
    name: "pages",
    created_time: now,
    updated_time: now,
    defaultViewId: DEFAULT_VIEW_ID,
    fields: [
      { id: "id", name: "ID", type: "id", system: true },
      { id: "created_time", name: "Created time", type: "created_time", system: true },
      { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
      { id: "title", name: "Name", type: "text" },
      { id: "kind", name: "Kind", type: "text", system: true },
      { id: "body_path", name: "Body path", type: "text", system: true, hidden: true },
      { id: "icon", name: "Icon", type: "text" },
      { id: "cover", name: "Cover", type: "text" },
      { id: "cover_offset", name: "Cover offset", type: "number" },
      { id: "path", name: "Path", type: "text" },
      { id: "parent_id", name: "Parent entity", type: "entity_ref" },
      { id: "tags", name: "Tags", type: "multi_select" },
      { id: "date", name: "Date", type: "text" },
      { id: "url", name: "URL", type: "url" },
      { id: "full_width", name: "Full width", type: "checkbox" },
      { id: "small_text", name: "Small text", type: "checkbox" },
      { id: "database_id", name: "Database ID", type: "text", system: true, hidden: true },
      { id: "row_id", name: "Row ID", type: "text", system: true, hidden: true },
      { id: "page_file", name: "Page file", type: "text", system: true, hidden: true }
    ]
  };
}

function defaultView(databaseId, fields) {
  return {
    id: DEFAULT_VIEW_ID,
    databaseId,
    name: "All",
    type: "table",
    visibleFieldIds: fields,
    fieldOrder: fields,
    wrapFieldIds: fields,
    sorts: [],
    filters: []
  };
}
