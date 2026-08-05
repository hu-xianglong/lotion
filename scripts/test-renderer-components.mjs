import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as esbuild from "esbuild";

const root = process.cwd();
const configuredBundleDir = process.env.LOTION_RENDERER_COMPONENT_BUNDLE_DIR?.trim();
const tempDir = configuredBundleDir
  ? resolve(configuredBundleDir)
  : await mkdtemp(join(tmpdir(), "lotion-renderer-components-"));
if (configuredBundleDir) await mkdir(tempDir, { recursive: true });
const bundlePath = join(tempDir, "renderer-component-entry.cjs");
const require = createRequire(import.meta.url);

try {
  await esbuild.build({
    stdin: {
      contents: rendererComponentEntry(),
      sourcefile: "renderer-component-entry.tsx",
      resolveDir: root,
      loader: "tsx"
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: bundlePath,
    logLevel: "silent",
    jsx: "automatic",
    sourcemap: "inline",
    sourcesContent: true
  });

  const {
    renderAdvancedSearchProgressCard,
    renderAdvancedSearchPanelInitial,
    renderAppShellCollapsed,
    renderAppShellExpanded,
    renderGitHubBackupPanelFailure,
    renderGitHubBackupPanelHistoryEmpty,
    renderGitHubBackupPanelInitial,
    renderGitSyncPanelConfigured,
    renderGitSyncPanelDefaultSettings,
    renderGitSyncPanelStatusScenarios,
    renderLLMChatVisualContract,
    renderKanbanProviderVisual,
    renderEditableFieldSettingsDialog,
    renderInheritedDateFieldSettingsDialog,
    fieldFormatOverridesContract,
    fieldSettingsActionContract,
    renderFormulaFieldSettingsDialog,
    renderDatabaseProperties,
    renderDatabaseTableGridEmbedded,
    renderDatabaseTableGridHiddenRows,
    renderDatabaseTableGridStandalone,
    renderCreateViewDialog,
    renderPropertyManagerDialog,
    renderDatabaseViewTabsBar,
    renderBackupButton,
    renderEmbeddedDatabaseHeader,
    renderEmbeddedViewRendererCached,
    renderEmbeddedViewRendererLoading,
    renderEntityIcons,
    renderFieldTypeIcons,
    renderFormulaCell,
    renderFilterPopoverContent,
    renderFilterPopoverContentEmpty,
    renderGalleryBody,
    renderGalleryBodyEmpty,
    renderGlobalSearchPanelContentEmpty,
    renderGlobalSearchPanelContentEnglish,
    renderGlobalSearchPanelContentLoading,
    renderGlobalSearchPanelContentRecent,
    renderGlobalSearchPanelContentResults,
    renderSearchAiSurface,
    searchAiSubtitleContract,
    renderCalendarBody,
    renderCoverArea,
    renderDesignSystemLab,
    renderListBody,
    renderManagementDatabasesView,
    renderManagementFavoritesView,
    renderManagementPagesView,
    renderManagementPluginDetailOverview,
    renderManagementPluginDetailSettings,
    renderManagementPluginsView,
    renderManagementRecentView,
    renderManagementGeneralSettingsCenter,
    renderManagementSettingsCenter,
    renderManagementTagView,
    renderMenuPrimitives,
    renderMissingEmbeddedViewDiagnosticCopy,
    cleanHeadingTextContract,
    lotionToggleFenceContract,
    optionMutationContract,
    rowPropertyInteractionContract,
    renderNotionAuditPanelInitial,
    notionAuditRunContract,
    renderNotionAuditPassingResult,
    renderNotionAuditResult,
    renderNotionImportDialogPick,
    renderNotionImportPanelPick,
    renderNotionImportSettingsWithReport,
    renderDatabaseTemplatePicker,
    renderDefaultFieldProviders,
    renderOptionPills,
    renderSelectFieldSettingsDialog,
    renderStandaloneDatabaseHeader,
    renderSortPopoverContent,
    renderSortPopoverContentDisabled,
    renderSortPopoverContentEmpty,
    sortMutationContract,
    renderSystemFieldSettingsDialog,
    renderTabStrip,
    renderTitleCell,
    renderUrlCell,
    renderViewSettingsDialog,
    viewSettingsActionContract,
    renderViewTypeIcons,
    renderWorkspaceSelector,
    renderMarkdownPropertyLinks,
    renderWorkspaceLinkButton,
    renderMixedMarkdownProperty,
    workspaceLinkRoutingContract,
    renderPagePropertiesWithOriginalHtml,
    renderPageLayoutComposition,
    renderPageEditorBodyShell,
    renderPageEditorSecondaryChrome,
    renderPageEditorEmptyPrompt,
    renderPageHistoryPanel,
    renderPageBacklinksPanel,
    renderRowPageProperties,
    renderRowPagePropertiesWithManagement,
    renderRowTemplateDialog,
    rowTemplateActionContract,
    renderSearchBox,
    renderSidebarPageContextMenu,
    renderSidebarShell,
    renderShortcutSettings,
    renderStartupLoadingScreen,
    renderStartupPerformancePanel,
    renderSlashMenuContent,
    renderSlashMenuContentZh,
    renderSlashMenuContentEmpty,
    renderSlashMenuContentEmptyZh,
    renderWidgetMarkdownFormatting,
    browserPluginSettingsContract,
    rendererWorkspaceMoveContract,
    bulkRowActionContract,
    cellEditQueueContract,
    coverOffsetMutationContract,
    pageLayoutMutationContract,
    pagePropertyMutationContract,
    pageTitleBlurContract,
    pageTitleMutationContract,
    createViewSubmissionContract,
    columnMenuActionContract,
    databaseSettingsActionContract,
    deletedRowsActionContract,
    editableKeyboardTargetContract,
    filterMutationContract,
    groupSettingsSubmissionContract,
    propertyManagerMutationContract,
    rowMenuActionContract,
    rowCreationContract,
    rowPagePropertyEditContract,
    viewOrderMutationContract,
    viewMenuActionContract,
    viewPersistenceContract
  } = require(bundlePath);
  testAdvancedSearchProgressCard(renderAdvancedSearchProgressCard());
  testAdvancedSearchPanelInitial(renderAdvancedSearchPanelInitial());
  testGitHubBackupPanelInitial(renderGitHubBackupPanelInitial());
  testGitHubBackupPanelFailure(renderGitHubBackupPanelFailure());
  testGitHubBackupPanelHistoryEmpty(renderGitHubBackupPanelHistoryEmpty());
  testGitSyncPanelConfigured(renderGitSyncPanelConfigured());
  testGitSyncPanelDefaultSettings(renderGitSyncPanelDefaultSettings());
  testGitSyncPanelStatusScenarios(renderGitSyncPanelStatusScenarios());
  testLLMChatVisualContract(renderLLMChatVisualContract());
  testKanbanProviderVisual(await renderKanbanProviderVisual());
  testAppShellExpanded(renderAppShellExpanded());
  testAppShellCollapsed(renderAppShellCollapsed());
  testRowPageProperties(renderRowPageProperties());
  testRowPagePropertySettingsAffordance(renderRowPagePropertiesWithManagement());
  testPagePropertiesWithOriginalHtml(renderPagePropertiesWithOriginalHtml());
  testPageLayoutComposition(renderPageLayoutComposition());
  testPageEditorEmptyPrompt(renderPageEditorEmptyPrompt());
  testPageEditorBodyShell(renderPageEditorBodyShell());
  testPageEditorSecondaryChrome(renderPageEditorSecondaryChrome());
  testPageHistoryPanel(renderPageHistoryPanel());
  testPageBacklinksPanel(renderPageBacklinksPanel());
  testMarkdownPropertyLinks(renderMarkdownPropertyLinks());
  testWorkspaceLinkButton(renderWorkspaceLinkButton());
  testMixedMarkdownProperty(renderMixedMarkdownProperty());
  testWorkspaceLinkRoutingContract(workspaceLinkRoutingContract());
  testEditableKeyboardTargetContract(editableKeyboardTargetContract());
  testBulkRowActionContract(await bulkRowActionContract());
  testCellEditQueueContract(await cellEditQueueContract());
  testCoverOffsetMutationContract(await coverOffsetMutationContract());
  testPageLayoutMutationContract(await pageLayoutMutationContract());
  testPagePropertyMutationContract(await pagePropertyMutationContract());
  testPageTitleBlurContract(await pageTitleBlurContract());
  testPageTitleMutationContract(await pageTitleMutationContract());
  testRowCreationContract(await rowCreationContract());
  testRowPagePropertyEditContract(await rowPagePropertyEditContract());
  testViewPersistenceContract(viewPersistenceContract());
  testEditableFieldSettingsDialog(renderEditableFieldSettingsDialog());
  testInheritedDateFieldSettingsDialog(renderInheritedDateFieldSettingsDialog());
  testFieldFormatOverridesContract(fieldFormatOverridesContract());
  testFieldSettingsActionContract(await fieldSettingsActionContract());
  testFormulaFieldSettingsDialog(renderFormulaFieldSettingsDialog());
  testSystemFieldSettingsDialog(renderSystemFieldSettingsDialog());
  testSelectFieldSettingsDialog(renderSelectFieldSettingsDialog());
  testUrlCell(renderUrlCell());
  testTitleCell(renderTitleCell());
  testFormulaCell(renderFormulaCell());
  testFilterPopoverContent(renderFilterPopoverContent());
  testFilterPopoverContentEmpty(renderFilterPopoverContentEmpty());
  testSortPopoverContent(renderSortPopoverContent());
  testSortPopoverContentEmpty(renderSortPopoverContentEmpty());
  testSortPopoverContentDisabled(renderSortPopoverContentDisabled());
  testSortMutationContract(await sortMutationContract());
  testGlobalSearchPanelContentRecent(renderGlobalSearchPanelContentRecent());
  testGlobalSearchPanelContentResults(renderGlobalSearchPanelContentResults());
  testGlobalSearchPanelContentLoading(renderGlobalSearchPanelContentLoading());
  testGlobalSearchPanelContentEmpty(renderGlobalSearchPanelContentEmpty());
  testGlobalSearchPanelContentEnglish(renderGlobalSearchPanelContentEnglish());
  testSearchAiSurface(renderSearchAiSurface());
  testSearchAiSubtitleContract(searchAiSubtitleContract());
  testViewSettingsDialog(renderViewSettingsDialog());
  testViewSettingsActionContract(await viewSettingsActionContract());
  testRowTemplateDialog(renderRowTemplateDialog());
  testRowTemplateActionContract(await rowTemplateActionContract());
  testSlashMenuContent(renderSlashMenuContent());
  testSlashMenuContentZh(renderSlashMenuContentZh());
  testSlashMenuContentEmpty(renderSlashMenuContentEmpty());
  testSlashMenuContentEmptyZh(renderSlashMenuContentEmptyZh());
  testWidgetMarkdownFormatting(renderWidgetMarkdownFormatting());
  testBrowserPluginSettingsContract(await browserPluginSettingsContract());
  testRendererWorkspaceMoveContract(await rendererWorkspaceMoveContract());
  testTabStrip(renderTabStrip());
  testBackupButton(renderBackupButton());
  testSearchBox(renderSearchBox());
  testSidebarShell(renderSidebarShell());
  testSidebarPageContextMenu(renderSidebarPageContextMenu());
  testShortcutSettings(renderShortcutSettings());
  testStartupLoadingScreen(renderStartupLoadingScreen());
  testStartupPerformancePanel(renderStartupPerformancePanel());
  testStandaloneDatabaseHeader(renderStandaloneDatabaseHeader());
  testEmbeddedDatabaseHeader(renderEmbeddedDatabaseHeader());
  testEmbeddedViewRendererCached(renderEmbeddedViewRendererCached());
  testEmbeddedViewRendererLoading(renderEmbeddedViewRendererLoading());
  testDatabaseViewTabsBar(renderDatabaseViewTabsBar());
  testViewOrderMutationContract(await viewOrderMutationContract());
  testFieldTypeIcons(renderFieldTypeIcons());
  testViewTypeIcons(renderViewTypeIcons());
  testEntityIcons(renderEntityIcons());
  testWorkspaceSelector(renderWorkspaceSelector());
  testCoverArea(renderCoverArea());
  testDesignSystemLab(renderDesignSystemLab());
  testDatabaseProperties(renderDatabaseProperties());
  testManagementDatabasesView(renderManagementDatabasesView());
  testManagementPagesView(renderManagementPagesView());
  testManagementRecentView(renderManagementRecentView());
  testManagementFavoritesView(renderManagementFavoritesView());
  testManagementPluginsView(renderManagementPluginsView());
  testManagementPluginDetailOverview(renderManagementPluginDetailOverview());
  testManagementPluginDetailSettings(renderManagementPluginDetailSettings());
  testManagementGeneralSettingsCenter(renderManagementGeneralSettingsCenter());
  testManagementSettingsCenter(renderManagementSettingsCenter());
  testManagementTagView(renderManagementTagView());
  testMenuPrimitives(renderMenuPrimitives());
  testMissingEmbeddedViewDiagnosticCopy(renderMissingEmbeddedViewDiagnosticCopy());
  testCleanHeadingTextContract(cleanHeadingTextContract());
  testLotionToggleFenceContract(lotionToggleFenceContract());
  testOptionMutationContract(await optionMutationContract());
  testRowPropertyInteractionContract(rowPropertyInteractionContract());
  testNotionAuditPanelInitial(renderNotionAuditPanelInitial());
  testNotionAuditRunContract(await notionAuditRunContract());
  testNotionAuditResult(renderNotionAuditResult());
  testNotionAuditPassingResult(renderNotionAuditPassingResult());
  testNotionImportDialogPick(renderNotionImportDialogPick());
  testNotionImportPanelPick(renderNotionImportPanelPick());
  testNotionImportSettingsWithReport(renderNotionImportSettingsWithReport());
  testListBody(renderListBody());
  testGalleryBody(renderGalleryBody());
  testGalleryBodyEmpty(renderGalleryBodyEmpty());
  testCalendarBody(renderCalendarBody());
  testDatabaseTemplatePicker(renderDatabaseTemplatePicker());
  testDefaultFieldProviders(renderDefaultFieldProviders());
  testOptionPills(renderOptionPills());
  testDatabaseTableGridEmbedded(renderDatabaseTableGridEmbedded());
  testDatabaseTableGridStandalone(renderDatabaseTableGridStandalone());
  testDatabaseTableGridHiddenRows(renderDatabaseTableGridHiddenRows());
  testCreateViewDialog(renderCreateViewDialog());
  testCreateViewSubmissionContract(await createViewSubmissionContract());
  testColumnMenuActionContract(await columnMenuActionContract());
  testPropertyManagerDialog(renderPropertyManagerDialog());
  testPropertyManagerMutationContract(await propertyManagerMutationContract());
  testViewMenuActionContract(await viewMenuActionContract());
  testDatabaseSettingsActionContract(await databaseSettingsActionContract());
  testDeletedRowsActionContract(await deletedRowsActionContract());
  testRowMenuActionContract(await rowMenuActionContract());
  testFilterMutationContract(await filterMutationContract());
  testGroupSettingsSubmissionContract(await groupSettingsSubmissionContract());
  console.log("Renderer component regression tests passed.");
} finally {
  if (!configuredBundleDir) await rm(tempDir, { recursive: true, force: true });
}

function testRowPageProperties(html) {
  assert.match(html, /row-properties/, "row property panel should render");
  assert.match(html, /Original Notion HTML/, "source HTML field label should render");
  assert.match(html, /Original Notion CSV/, "source CSV field label should render");
  assert.match(html, /source-link-property/, "source fields should use source-link styling");
  assert.equal(count(html, 'class="page-property-link"'), 2, "source HTML and CSV should render as openable link buttons");
  assert.match(html, /attachments\/original\/source-page\.html/, "source HTML path should be visible");
  assert.match(html, /attachments\/original\/source-db\.csv/, "source CSV path should be visible");

  assert.match(html, /cell-textarea/, "editable text field should render an editable textarea");
  assert.match(html, /type="date"/, "editable date field should render a date input");
  assert.match(html, /type="checkbox"/, "editable checkbox field should render a checkbox");
  assert.equal(count(html, "row-property-option-search-chip"), 3, "select and multi-select values should expose chip-style search affordances");
  assert.match(html, /aria-label="Search Status: Done"/, "select property search affordance should be labelled");
  assert.match(html, /aria-label="Search Tags: Focus"/, "first multi-select search affordance should be labelled");
  assert.match(html, /aria-label="Search Tags: Bug"/, "second multi-select search affordance should be labelled");
  assert.match(html, /row-property-option-search-chip[\s\S]*row-property-option-search-label[^>]*>Done</, "select search affordance should render a distinct action label");
  assert.match(html, /row-property-option-search-chip[\s\S]*row-property-option-search-label[^>]*>Focus</, "multi-select search affordance should render a distinct action label");
  assert.match(html, /Formula Total/, "formula field label should render");
  assert.match(html, /readonly-cell[^>]*>42</, "formula field should render as read-only text");
  assert.match(html, /Created time/, "system created time label should render");
  assert.match(html, /readonly-cell/, "system fields should render read-only cells");

  assert.doesNotMatch(html, /Hidden Bookkeeping/, "hidden fields should not render");
  assert.doesNotMatch(html, /Visible row title should stay in the page title/, "title field should not render in properties");
}

function testRowPropertyInteractionContract(contract) {
  assert.deepEqual(contract, {
    managed: 1,
    searched: ["Done"],
    prevented: 2,
    stopped: 2
  }, "row property action callbacks should prevent bubbling and preserve the exact selected option");
}

function testBrowserPluginSettingsContract(contract) {
  assert.deepEqual(contract.initial, {
    enabled: true,
    missing: "fallback"
  }, "browser plugin settings should load persisted values and defaults");
  assert.equal(contract.snapshotIsDefensive, true, "all() should return a defensive top-level snapshot");
  assert.deepEqual(contract.afterSet, {
    cache: { enabled: true, model: "gpt-test" },
    persisted: { enabled: true, model: "gpt-test" },
    reloadModel: "gpt-test"
  }, "successful settings writes should align cache, persistence, and reload");
  assert.deepEqual(contract.undefinedValue, {
    cacheValue: "fallback",
    persistedHasKey: false
  }, "JSON-lossy undefined values should not remain only in memory");
  assert.deepEqual(contract.failedSet, {
    rejected: true,
    cacheValue: "before",
    persistedValue: "before"
  }, "failed writes should preserve the prior cache and storage");
  assert.deepEqual(contract.failedDelete, {
    rejected: true,
    cacheValue: "before",
    persistedValue: "before"
  }, "failed deletes should preserve the prior cache and storage");
  assert.equal(contract.cyclicRejected, true, "cyclic settings should reject without changing the cache");
  assert.equal(contract.toJSONRejected, true, "a functional toJSON setting should reject instead of replacing the object payload");
  assert.equal(contract.stableAfterSerializationFailures, "before", "serialization failures should preserve prior cached data");
  assert.deepEqual(contract.afterDelete, {
    cacheHasModel: false,
    persistedHasModel: false
  }, "successful deletes should align cache and storage");
  assert.deepEqual(contract.invalidStorage, {
    malformed: {},
    array: {}
  }, "malformed and array storage payloads should recover as empty settings");
  assert.equal(contract.pluginIsolation, true, "plugin settings should use isolated storage keys");
}

function testRendererWorkspaceMoveContract(contract) {
  assert.deepEqual(contract.validMove, {
    id: "pg_child",
    parentId: "pg_parent",
    parentKind: "page",
    path: ["Root", "Parent", "Child"]
  });
  assert.deepEqual(contract.clearMove, {
    id: "pg_child",
    parentId: null,
    parentKind: null,
    path: ["Child"]
  });
  assert.match(contract.selfError, /cannot move a page under itself/i);
  assert.equal(contract.selfUpdateAttempted, false);
  assert.match(contract.descendantError, /page hierarchy cycle/i);
}

function testCreateViewDialog(html) {
  assert.match(html, /role="dialog"/, "create view should render a dialog");
  assert.match(html, /aria-label="Create view"/, "create view dialog should be labelled");
  assert.match(html, /value="View 4"/, "create view should choose the next available generated name");
  assert.match(html, /<option value="table" selected="">Table<\/option>/, "new views should default to table layout");
  assert.match(html, /checked=""\/> Empty settings/, "new views should default to empty settings");
  assert.match(html, /Duplicate “Current board”/, "duplicate source should identify the active view");
  assert.match(html, /aria-busy="false"/, "idle create dialog should expose non-busy state");
  assert.match(html, />Create view<\/button>/, "idle create dialog should expose its submit action");
  assert.doesNotMatch(html, /role="alert"/, "idle create dialog should not render a stale error");
}

function testCreateViewSubmissionContract(contract) {
  assert.equal(contract.concurrent.createCalls, 1, "two synchronous submissions should call create once");
  assert.equal(contract.concurrent.firstStatus, "submitted", "the first in-flight submission should finish");
  assert.equal(contract.concurrent.secondStatus, "ignored", "the second in-flight submission should be ignored");
  assert.deepEqual(contract.concurrent.saving, [true, false], "single-flight success should report one saving transition");
  assert.deepEqual(contract.concurrent.errors, [null], "single-flight success should clear stale errors");
  assert.equal(contract.concurrent.successes, 1, "single-flight success should close once");
  assert.deepEqual(contract.concurrent.input, {
    databaseId: "db_contract",
    name: "Review",
    type: "list",
    sourceMode: "empty"
  }, "single-flight submission should forward its exact create input");
  assert.deepEqual(contract.failure, {
    status: "failed",
    error: "raw create failure",
    saving: [true, false],
    successes: 0,
    guardReset: true
  }, "failed create should normalize errors, stay open, and reset the guard");
  assert.deepEqual(contract.retry, {
    status: "submitted",
    errors: [null],
    saving: [true, false],
    successes: 1
  }, "a failed create should allow a successful retry");
}

function testColumnMenuActionContract(contract) {
  assert.deepEqual(contract.dismissal, {
    pending: false,
    idle: true,
    closeCalls: 1
  }, "column menu dismissal should be blocked while an action is pending");
  assert.deepEqual(contract.concurrent, {
    actionCalls: 1,
    firstStatus: "submitted",
    secondStatus: "ignored",
    pending: [true, false],
    errors: [""],
    successes: 1
  }, "column actions should synchronously suppress duplicate submissions and close once");
  assert.deepEqual(contract.failure, {
    status: "failed",
    error: "raw column action failure",
    pending: [true, false],
    successes: 0,
    guardReset: true
  }, "failed column actions should normalize errors, stay open, and reset their guard");
  assert.deepEqual(contract.retry, {
    status: "submitted",
    errors: [""],
    pending: [true, false],
    successes: 1
  }, "a failed column action should allow a successful retry");
}

function testPropertyManagerDialog(html) {
  assert.match(html, /role="dialog"/, "property manager should render a dialog");
  assert.match(html, /aria-label="Property manager"/, "property manager should expose its accessible name");
  assert.match(html, /aria-busy="false"/, "idle property manager should expose non-busy state");
  assert.match(html, /Current review/, "property manager should identify the active view");
  assert.match(html, /Name<small>text<\/small>/, "property manager should render the title property");
  assert.match(html, /Priority<small>select<\/small>/, "property manager should render editable properties");
  assert.match(html, /Hidden in this view/, "property manager should expose per-view visibility");
  assert.match(html, /Deleted properties/, "property manager should render recoverable properties");
  assert.match(html, /Depends on: Formula total/, "deleted properties should explain blocking dependencies");
  assert.match(html, /title="Restore or remove dependencies first."/, "blocked permanent deletion should explain recovery");
  assert.doesNotMatch(html, /role="alert"/, "idle property manager should not render a stale mutation error");
}

function testPropertyManagerMutationContract(contract) {
  assert.deepEqual(contract.filtering, {
    byName: ["priority"],
    byType: ["tags"],
    blank: ["title", "priority", "tags"]
  }, "property filtering should match names, types, and blank queries");
  assert.deepEqual(contract.inputs, {
    current: { name: "Review score", type: "number", visibility: "current", viewId: "view_current" },
    all: { name: "Shared note", type: "text", visibility: "all" }
  }, "property creation should scope current-only fields and omit unrelated view ids");
  assert.deepEqual(contract.reordering, {
    moved: ["title", "tags", "priority"],
    same: null,
    missing: null
  }, "property reorder planning should be deterministic and reject no-ops");
  assert.deepEqual(contract.dismissal, {
    pending: false,
    idle: true,
    closeCalls: 1
  }, "property manager dismissal should be blocked during a mutation and run once when idle");
  assert.deepEqual(contract.concurrent, {
    mutationCalls: 1,
    firstStatus: "submitted",
    secondStatus: "ignored",
    pending: [true, false],
    errors: [null]
  }, "property mutations should synchronously suppress a second in-flight call");
  assert.deepEqual(contract.failure, {
    status: "failed",
    error: "raw property failure",
    pending: [true, false],
    guardReset: true
  }, "property mutation failures should normalize errors and reset the guard");
  assert.deepEqual(contract.retry, {
    status: "submitted",
    errors: [null],
    pending: [true, false],
    calls: 1
  }, "property mutation failure should allow a clean retry");
}

function testViewMenuActionContract(contract) {
  assert.deepEqual(contract.validation, {
    blank: "View name cannot be empty.",
    conflict: "View names must be unique.",
    current: "",
    unique: ""
  }, "view rename validation should reject blank/case-insensitive conflicts and allow current or unique names");
  assert.deepEqual(contract.dismissal, {
    pending: false,
    idle: true,
    closeCalls: 1
  }, "view menu dismissal should be blocked while an action is pending");
  assert.deepEqual(contract.concurrent, {
    actionCalls: 1,
    firstStatus: "submitted",
    secondStatus: "ignored",
    pending: [true, false],
    errors: [""],
    successes: 1
  }, "view actions should synchronously suppress duplicate submissions and close once");
  assert.deepEqual(contract.failure, {
    status: "failed",
    error: "raw view action failure",
    pending: [true, false],
    successes: 0,
    guardReset: true
  }, "failed view actions should normalize errors, stay open, and reset their guard");
  assert.deepEqual(contract.retry, {
    status: "submitted",
    errors: [""],
    pending: [true, false],
    successes: 1
  }, "a failed view action should allow a successful retry");
}

function testDatabaseSettingsActionContract(contract) {
  assert.deepEqual(contract.pageOpenModes, {
    tableDefault: "side_peek",
    galleryDefault: "center_peek",
    explicit: "full_page"
  }, "database settings should normalize page-open modes by view type");
  assert.deepEqual(contract.navigation, {
    pending: false,
    idle: true,
    calls: 1
  }, "database settings navigation should be blocked while persistence is pending");
  assert.deepEqual(contract.concurrent, {
    actionCalls: 1,
    firstStatus: "submitted",
    secondStatus: "ignored",
    pending: [true, false],
    errors: [""],
    successes: 1
  }, "database settings should synchronously suppress duplicate persistent actions");
  assert.deepEqual(contract.failure, {
    status: "failed",
    error: "raw database settings failure",
    pending: [true, false],
    successes: 0,
    guardReset: true
  }, "database settings failures should stay recoverable and reset the action guard");
  assert.deepEqual(contract.retry, {
    status: "submitted",
    errors: [""],
    pending: [true, false],
    successes: 1
  }, "database settings should allow a clean retry after persistence failure");
}

function testGroupSettingsSubmissionContract(contract) {
  assert.deepEqual(contract.dismissal, {
    pending: false,
    idle: true,
    closeCalls: 1
  }, "group settings dismissal should be blocked while persistence is pending");
  assert.deepEqual(contract.concurrent, {
    saveCalls: 1,
    firstStatus: "submitted",
    secondStatus: "ignored",
    pending: [true, false],
    errors: [""],
    successes: 1
  }, "group settings should synchronously suppress duplicate saves and close once");
  assert.deepEqual(contract.failure, {
    status: "failed",
    error: "raw grouping failure",
    pending: [true, false],
    successes: 0,
    guardReset: true
  }, "failed grouping saves should normalize errors, stay open, and reset their guard");
  assert.deepEqual(contract.retry, {
    status: "submitted",
    errors: [""],
    pending: [true, false],
    successes: 1
  }, "a failed grouping save should allow a successful retry");
}

function testDeletedRowsActionContract(contract) {
  assert.deepEqual(contract.dismissal, {
    pending: false,
    idle: true,
    closeCalls: 1
  }, "deleted rows dismissal should be blocked while an action is pending");
  assert.deepEqual(contract.concurrent, {
    actionCalls: 1,
    firstStatus: "submitted",
    secondStatus: "ignored",
    pending: [true, false],
    errors: [""]
  }, "deleted row actions should synchronously suppress all competing submissions");
  assert.deepEqual(contract.failure, {
    status: "failed",
    error: "raw deleted row failure",
    pending: [true, false],
    guardReset: true
  }, "failed deleted row actions should normalize errors and reset their guard");
  assert.deepEqual(contract.retry, {
    status: "submitted",
    errors: [""],
    pending: [true, false],
    calls: 1
  }, "a failed deleted row action should allow a successful retry");
}

function testRowMenuActionContract(contract) {
  assert.deepEqual(contract.dismissal, {
    pending: false,
    idle: true,
    closeCalls: 1
  }, "row menu dismissal should be blocked while persistence is pending");
  assert.deepEqual(contract.concurrent, {
    actionCalls: 1,
    firstStatus: "submitted",
    secondStatus: "ignored",
    pending: [true, false],
    errors: [""],
    successes: 1
  }, "row actions should synchronously suppress duplicate submissions and close once");
  assert.deepEqual(contract.failure, {
    status: "failed",
    error: "raw row action failure",
    pending: [true, false],
    successes: 0,
    guardReset: true
  }, "failed row actions should normalize errors, stay open, and reset their guard");
  assert.deepEqual(contract.retry, {
    status: "submitted",
    errors: [""],
    pending: [true, false],
    successes: 1
  }, "a failed row action should allow a successful retry");
}

function testFilterMutationContract(contract) {
  assert.deepEqual(contract.dismissal, {
    pending: false,
    idle: true,
    closeCalls: 1
  }, "filter dismissal should be blocked while persistence is pending");
  assert.deepEqual(contract.concurrent, {
    changeCalls: 1,
    firstStatus: "submitted",
    secondStatus: "ignored",
    pending: [true, false],
    errors: [""],
    successes: 1
  }, "filter mutations should synchronously suppress duplicate submissions");
  assert.deepEqual(contract.failure, {
    status: "failed",
    error: "raw filter persistence failure",
    pending: [true, false],
    successes: 0,
    guardReset: true
  }, "failed filter mutations should normalize errors, retain the popover, and reset their guard");
  assert.deepEqual(contract.retry, {
    status: "submitted",
    errors: [""],
    pending: [true, false],
    successes: 1,
    value: "Recovered"
  }, "a failed filter mutation should allow an explicit successful retry");
}

function testSortMutationContract(contract) {
  assert.deepEqual(contract.dismissal, {
    pending: false,
    idle: true,
    closeCalls: 1
  }, "sort dismissal should be blocked while persistence is pending");
  assert.deepEqual(contract.concurrent, {
    changeCalls: 1,
    firstStatus: "submitted",
    secondStatus: "ignored",
    pending: [true, false],
    errors: [""]
  }, "sort mutations should synchronously suppress duplicate submissions");
  assert.deepEqual(contract.failure, {
    status: "failed",
    error: "raw sort persistence failure",
    pending: [true, false],
    guardReset: true
  }, "failed sort mutations should normalize errors, retain the popover, and reset their guard");
  assert.deepEqual(contract.retry, {
    status: "submitted",
    errors: [""],
    pending: [true, false],
    direction: "desc"
  }, "a failed sort mutation should allow an explicit successful retry");
}

function testRowPagePropertySettingsAffordance(html) {
  assert.match(html, /row-properties/, "managed row properties should render");
  assert.equal(count(html, 'class="row-property-settings"'), 10, "each visible row property should expose a settings button");
  assert.match(html, /aria-label="Field settings: Original Notion HTML"/, "source HTML settings button should be labelled");
  assert.match(html, /aria-label="Field settings: memo"/, "text settings button should be labelled");
  assert.match(html, /aria-label="Field settings: Due Date"/, "date settings button should be labelled");
  assert.match(html, /aria-label="Field settings: Created time"/, "system settings button should be labelled");
  assert.doesNotMatch(html, /Field settings: Hidden Bookkeeping/, "hidden fields should not expose settings buttons");
  assert.doesNotMatch(html, /Field settings: Name/, "title field should not expose a duplicate settings button");
  assert.doesNotMatch(html, /class="field-dialog"/, "field settings dialog should not mount before interaction");
}

function testPagePropertiesWithOriginalHtml(html) {
  assert.match(html, /page-properties/, "top-level page properties should render");
  assert.match(html, /Original Notion HTML/, "top-level original HTML label should render");
  assert.match(html, /attachments\/original\/top-level\.html/, "top-level original HTML path should be visible");
  assert.equal(count(html, 'class="page-property-link"'), 1, "top-level original HTML should render as one openable link");
  assert.equal(count(html, 'class="page-property-input"'), 3, "only tags/date/url fields should render editable inputs");
  assert.match(html, /class="url-cell page-property-url-cell"/, "top-level URL should use the shared URL cell affordance");
  assert.match(html, /class="url-cell-display"/, "top-level URL should render link-style display text");
  assert.match(html, /aria-label="Open URL"/, "top-level URL should expose a separate open button");
  assert.match(html, /title="https:\/\/example\.com\/source"/, "top-level URL open button should use the normalized URL title");
  assert.doesNotMatch(
    html,
    /<input[^>]+attachments\/original\/top-level\.html/,
    "top-level original HTML should not render as an editable input"
  );
}

function testPageLayoutComposition(rendered) {
  const { standard, fullWidth } = rendered;
  assert.match(standard, /class="page-editor page-layout"/, "standard page layout should render base shell");
  assert.doesNotMatch(standard, /class="page-editor page-layout full-width"/, "standard page layout should not force full width");
  assert.match(fullWidth, /class="page-editor page-layout full-width"/, "full-width page layout should render full-width shell");
  assertInOrder(
    standard,
    [
      "layout cover",
      'class="page-header"',
      "layout header",
      "layout properties",
      "layout overlay",
      "layout body"
    ],
    "PageLayout should preserve cover/header/properties/overlay/body order"
  );
}

function testPageEditorEmptyPrompt(html) {
  assert.match(html, /class="page-editor page-layout"/, "empty page editor should render the page layout shell");
  assert.match(html, /value="Empty Shell"/, "empty page editor should render the title input value");
  assert.match(html, /Workspace/, "empty page editor should render path context");
  assert.match(html, /aria-label="Page actions"/, "empty page editor should render the action bar");
  assert.match(html, /aria-label="Change icon"/, "empty page editor should expose the localized icon picker slot");
  assert.match(html, /class="empty-page-prompt"/, "empty page editor should render the empty-page prompt");
  assert.match(html, /Press Enter to continue with an empty page/, "empty prompt helper should render");
  assert.match(html, /Daily template/, "empty prompt should render supplied templates");
  assert.match(html, /Work template/, "empty prompt should render multiple supplied templates");
  assert.match(html, /class="empty-template-option active"[\s\S]*>Empty</, "empty-page option should be selected by default");
  assert.match(html, /New template/, "empty prompt should expose new-template affordance");
  assert.doesNotMatch(html, /data-testid="markdown-editor"/, "empty prompt should hide the editor until the user continues");
}

function testPageEditorBodyShell(html) {
  assert.match(html, /class="page-editor page-layout full-width"/, "body page editor should respect full-width layout state");
  assert.match(html, /value="Writing Shell"/, "body page editor should render the title input value");
  assert.match(html, /Writing Shell/, "body page editor should render title/path text");
  assert.match(html, /class="favorite-toggle on"/, "body page editor should render favorited state");
  assert.match(html, /aria-pressed="true"/, "favorite control should expose pressed state");
  assert.match(html, /aria-label="Page options"/, "body page editor should expose page options");
  assert.match(html, /class="page-body"/, "body page editor should render the body wrapper");
  assert.match(html, /class="codemirror-editor"[^>]+data-testid="markdown-editor"/, "body page editor should mount the markdown editor container");
  assert.match(html, /class="cm-md-lotion-view-preload"/, "body page editor should reserve the embedded-view preload host");
  assert.doesNotMatch(html, /empty-page-prompt/, "body page editor should not render empty-page prompt for non-empty markdown");
}

function testPageEditorSecondaryChrome(html) {
  assert.match(html, /data-testid="page-secondary-panel"/, "page editor should render secondary chrome wrapper");
  assert.match(html, /class="page-secondary-panel collapsed"/, "secondary chrome should default collapsed");
  assert.match(html, /aria-label="Expand page details"/, "secondary chrome should expose an expand affordance");
  assert.match(html, /aria-expanded="false"/, "collapsed secondary chrome should report collapsed state");
  assert.match(html, /History/, "secondary chrome should summarize local history");
  assert.match(html, /class="page-history-panel"/, "secondary chrome should include local page history");
  assert.match(html, /Page history/, "secondary chrome should keep history controls mounted");
  assert.match(html, /Renderer source details/, "secondary chrome should keep property content mounted for expansion");
  assert.match(html, /aria-hidden="true"/, "collapsed secondary chrome content should be hidden from assistive tech until expanded");
}

function testPageHistoryPanel(html) {
  assert.match(html, /class="page-history-panel"/, "page history panel should render");
  assert.match(html, /aria-label="Page history"/, "page history panel should expose an accessible label");
  assert.match(html, /class="page-history-status ready"[^>]*>Ready</, "ready status should render");
  assert.match(html, /2 local Git versions found\./, "history status message should render");
  assert.match(html, /aria-label="Local Git page history"/, "history list should be accessible");
  assert.equal(count(html, 'class="page-history-version'), 2, "history panel should render one row per version");
  assert.match(html, /Renderer history backup/, "history version message should render");
  assert.match(html, /class="page-history-version selected"/, "selected version should render selected state");
  assert.match(html, /aria-label="Local Git page history diff preview"/, "history diff preview should be labelled");
  assert.match(html, /Page snapshot · History Page/, "preview should render logical page identity");
  assert.doesNotMatch(html, /databases\/system\/pages--db_pages/, "preview should not expose its storage path");
  assert.match(html, />Restore<\/button>/, "restore action should render");
  assert.match(html, /class="page-history-diff-line removed"/, "removed diff line should render");
  assert.match(html, /class="page-history-diff-line added"/, "added diff line should render");
}

function testPageBacklinksPanel(html) {
  assert.match(html, /class="page-backlinks"/, "backlinks panel should render");
  assert.match(html, /Backlinks/, "backlinks panel title should render");
  assert.match(html, /class="page-backlinks-count"[^>]*>3</, "backlinks count should render");
  assert.equal(count(html, 'class="page-backlink-item"'), 3, "backlinks panel should render one button per backlink");
  assert.match(html, /Source Page/, "markdown backlink source title should render");
  assert.match(html, /Page<\/span>/, "page source type should render");
  assert.match(html, /Workspace \/ Notes/, "page backlink path should omit the repeated title segment");
  assert.match(html, /Markdown · L12/, "markdown backlink context should include line number");
  assert.match(html, /See target page here/, "markdown backlink excerpt should render");
  assert.doesNotMatch(html, /databases\/system\/pages--db_pages/, "markdown backlink excerpt should hide its link destination");
  assert.match(html, /Task Row/, "row backlink source title should render");
  assert.match(html, /Database row<\/span>/, "row source type should render");
  assert.match(html, /Workspace \/ Tasks/, "row backlink path should render database context");
  assert.match(html, /Property · Tasks · Related/, "property backlink context should include database and field names");
  assert.match(html, /Target is linked from a relation field/, "property backlink excerpt should render");
  assert.match(html, /2fd622e5-6282-47b7-aada-19390aaae913 Investigation/, "long imported backlink title should render");
  assert.match(html, /Property · pages · Parent entity/, "long imported property backlink context should render");
  assert.match(html, /entity-icon-emoji[^>]*>📘</, "page backlink icon should render");
  assert.match(html, /entity-icon-emoji[^>]*>✅</, "row backlink icon should render");
  assert.doesNotMatch(html, /disabled=""/, "backlink rows should be clickable when navigation is supplied");
}

function testMarkdownPropertyLinks(html) {
  assert.match(html, /page-property-link-list/, "markdown property links should render as a link list");
  assert.equal(count(html, 'class="page-property-link"'), 2, "standalone markdown links should render as link buttons");
  assert.match(html, /Design note/, "markdown link labels should be visible");
  assert.match(html, /attachments\/documents\/design-note\.pdf/, "markdown link href should be exposed on the button");
  assert.equal(count(html, 'class="page-property-link-open"'), 2, "each markdown link should expose the open affordance");
}

function testWorkspaceLinkButton(html) {
  assert.match(html, /<button/, "workspace property links should render as buttons");
  assert.match(html, /type="button"/, "workspace property link buttons should not submit forms");
  assert.match(html, /class="page-property-link"/, "workspace property links should use link-button chrome");
  assert.match(html, /title="attachments\/original\/source-page\.html"/, "workspace property links should expose the full file path");
  assert.match(html, /aria-label="Open link: Original Notion HTML"/, "workspace property links should expose an accessible open label");
  assert.match(html, /class="page-property-link-text"[^>]*>Original Notion HTML</, "workspace property links should show the user-facing label");
  assert.match(html, /class="page-property-link-open"[^>]+title="Open link"/, "workspace property links should expose the open affordance");
  assert.match(html, /<svg/, "workspace property links should render the external-link icon");
  assert.doesNotMatch(html, /<input/, "workspace property links should not render as editable inputs");
  assert.doesNotMatch(html, /url-cell/, "workspace property links should not use URL-cell editing chrome");
}

function testMixedMarkdownProperty(html) {
  assert.match(html, /Mixed Link Note/, "mixed markdown field label should render");
  assert.match(html, /Before \[Design note\]\(attachments\/documents\/design-note\.pdf\) after/, "mixed markdown text should stay visible");
  assert.equal(count(html, 'class="page-property-link"'), 0, "non-standalone markdown should not become link-only controls");
  assert.match(html, /readonly-cell/, "non-editable mixed markdown should use the normal read-only property path");
}

function testWorkspaceLinkRoutingContract(result) {
  assert.deepEqual(result.kinds, {
    page: "internal-md",
    rowPage: "internal-md",
    database: "internal-db",
    external: "external"
  }, "workspace link classifier should preserve editor click routing lanes");
  assert.equal(result.opened.page, true, "page markdown link should be navigable");
  assert.equal(result.opened.rowPage, true, "row-page markdown link should be navigable");
  assert.equal(result.opened.database, true, "database markdown link should be navigable");
  assert.deepEqual(result.calls, [
    ["selectPage", "pg_example"],
    ["openRowPageByFile", "db_tasks", "Task--row_abc.md"],
    ["selectDatabase", "db_tasks"]
  ], "workspace link navigation should call the correct Lotion actions");
}

function testEditableFieldSettingsDialog(html) {
  assert.match(html, /role="dialog"[^>]+aria-label="Field settings"/, "field settings dialog should be labelled");
  assert.match(html, /aria-busy="false"/, "idle field settings should expose its transactional state");
  assert.match(html, /<fieldset class="field-settings-controls">/, "all field settings controls should share one pending boundary");
  assert.match(html, /<h2>Field settings<\/h2>/, "dialog heading should render");
  assert.match(html, /<p>notes<\/p>/, "field id should render for debugging and management");
  assert.match(html, /value="Notes"/, "editable field name should render");
  assert.match(html, /value="text"/, "editable field type should render");
  assert.match(html, /Wrap text in this view/, "wrap control should render when provided");
  assert.match(html, /Hide in this view/, "hide control should render when provided");
  assert.match(html, />Cancel<\/button>/, "cancel action should render");
  assert.match(html, />Save field<\/button>/, "save action should render");
  assert.doesNotMatch(html, /System field values are managed by Lotion/, "editable fields should not show system helper");
}

function testInheritedDateFieldSettingsDialog(html) {
  assert.match(
    html,
    /<option value="" selected="">Use global default<\/option>/,
    "date-like fields without explicit formats should retain global-default inheritance"
  );
  assert.equal(
    (html.match(/<option value="" selected="">Use global default<\/option>/g) || []).length,
    2,
    "both date and time format controls should expose the inherited state"
  );
}

function testFieldFormatOverridesContract(result) {
  assert.deepEqual(
    result.inherited,
    {},
    "inherited date/time selections should not materialize field overrides"
  );
  assert.deepEqual(
    result.explicit,
    { dateFormat: "iso", timeFormat: "h24" },
    "explicit field date/time selections should remain authoritative"
  );
  assert.deepEqual(
    result.nonDate,
    {},
    "non-date fields should discard stale date/time selections"
  );
}

function testFieldSettingsActionContract(contract) {
  assert.deepEqual(contract.hydration, {
    failedSameField: false,
    idleSameField: true,
    switchedField: true
  }, "failed same-field refreshes should retain the draft while idle or switched fields hydrate");
  assert.deepEqual(contract.dismissal, {
    pending: false,
    idle: true,
    closeCalls: 1
  }, "field settings dismissal should be blocked only while persistence is pending");
  assert.equal(contract.concurrent.operationCalls, 1, "same-tick field settings actions should invoke one persistence operation");
  assert.equal(contract.concurrent.firstStatus, "submitted", "the accepted field settings action should submit");
  assert.equal(contract.concurrent.secondStatus, "ignored", "a competing same-tick field settings action should be ignored");
  assert.deepEqual(contract.concurrent.pending, [true, false], "the accepted field settings action should own one pending transition");
  assert.deepEqual(contract.concurrent.errors, [""], "the accepted field settings action should clear stale errors");
  assert.equal(contract.concurrent.successes, 1, "the accepted field settings action should complete once");
  assert.deepEqual(contract.failure, {
    status: "failed",
    error: "raw field settings failure",
    pending: [true, false],
    successes: 0,
    guardReset: true
  }, "field settings failures should normalize errors, retain the dialog, and reset the guard");
  assert.deepEqual(contract.retry, {
    status: "submitted",
    errors: [""],
    pending: [true, false],
    successes: 1
  }, "field settings retry should reuse the reset action path and succeed once");
}

function testViewPersistenceContract(result) {
  assert.equal(result.restored, "view_alt", "standalone databases should restore a valid last active view");
  assert.equal(result.explicit, "view_alt", "explicit non-default links should override local preferences");
  assert.equal(result.embedded, "view_default", "embedded views should honor their requested view");
  assert.deepEqual(result.patch, { filters: [{ fieldId: "status", operator: "is", value: "Done" }] }, "view mutations should send only changed mutable fields");
}

function testEditableKeyboardTargetContract(result) {
  assert.equal(result.nullTarget, false, "missing keyboard targets should not count as editing");
  assert.equal(result.plainTarget, false, "non-Element event targets should not throw or count as editing");
  assert.equal(result.editableTarget, true, "targets inside editable controls should count as editing");
  assert.equal(result.nonEditableTarget, false, "ordinary Element-like targets should not count as editing");
  assert.match(result.selector, /input[\s\S]*contenteditable/, "editable target detection should cover form and contenteditable controls");
}

function testBulkRowActionContract(contract) {
  assert.equal(contract.concurrent.operationCalls, 1, "same-tick bulk actions should invoke one persistence operation");
  assert.equal(contract.concurrent.firstStatus, "submitted", "the accepted bulk action should submit");
  assert.equal(contract.concurrent.secondStatus, "ignored", "a competing same-tick bulk action should be ignored");
  assert.deepEqual(contract.concurrent.pending, [true, false], "the accepted bulk action should own one pending transition");
  assert.deepEqual(contract.concurrent.errors, [""], "the accepted bulk action should clear stale errors");
  assert.equal(contract.concurrent.successes, 1, "the accepted bulk action should complete once");
  assert.deepEqual(contract.failure, {
    status: "failed",
    error: "raw bulk failure",
    pending: [true, false],
    successes: 0,
    guardReset: true
  }, "bulk failures should normalize errors, retain the operation, and reset the guard");
  assert.deepEqual(contract.retry, {
    status: "submitted",
    errors: [""],
    pending: [true, false],
    successes: 1
  }, "bulk retry should reuse the reset action path and succeed once");
  assert.deepEqual(contract.feedback.success, {
    kind: "success",
    message: "Rows duplicated."
  }, "clean batch results should surface success");
  assert.deepEqual(contract.feedback.partial, {
    kind: "error",
    message: "1 row action failed: missing: Row not found."
  }, "partially committed batch results should report row errors without entering the thrown-failure retry lane");
}

function testCellEditQueueContract(contract) {
  assert.deepEqual(contract.serial, {
    order: ["title:A", "notes:B"],
    first: "submitted",
    second: "submitted",
    duplicate: "ignored",
    peakQueued: 1,
    maxConcurrent: 1,
    final: { status: "idle", queuedCount: 0 }
  }, "cell edits should serialize writes, deduplicate the active value, and settle idle");
  assert.deepEqual(contract.recovery, {
    failure: {
      status: "error",
      error: "raw cell failure",
      queuedCount: 1,
      failedInput: { databaseId: "db", rowId: "row", fieldId: "title", value: "failed" }
    },
    retryAccepted: true,
    duplicateRetryIgnored: true,
    first: "submitted",
    later: "submitted",
    attempts: ["title:failed", "title:failed", "notes:queued"],
    final: { status: "idle", queuedCount: 0 }
  }, "a failed cell edit should pause later edits and Retry should resume the exact queue once");
  assert.deepEqual(contract.discard, {
    failed: "discarded",
    later: "submitted",
    discardAccepted: true,
    duplicateDiscardIgnored: true,
    attempts: ["title:drop", "notes:keep"],
    final: { status: "idle", queuedCount: 0 }
  }, "discard should drop only the failed edit and continue later queued work");
}

function testPagePropertyMutationContract(contract) {
  assert.deepEqual(contract.concurrent, {
    first: "submitted",
    duplicate: "ignored",
    calls: [{ tags: ["Work"] }],
    states: [
      { status: "pending", input: { tags: ["Work"] } },
      { status: "idle" }
    ]
  }, "page properties should synchronously suppress competing commits");
  assert.deepEqual(contract.recovery, {
    first: "failed",
    retry: "submitted",
    duplicateRetry: "ignored",
    attempts: [{ date: "2026-08-01" }, { date: "2026-08-01" }],
    failure: {
      status: "error",
      input: { date: "2026-08-01" },
      error: "raw page property failure"
    },
    final: { status: "idle" }
  }, "page property retry should retain the exact failed input and normalize raw errors");
  assert.deepEqual(contract.dismiss, {
    first: "failed",
    dismissed: true,
    duplicateDismiss: false,
    final: { status: "idle" }
  }, "page property dismissal should clear only unresolved recovery state");
}

function testPageTitleMutationContract(contract) {
  assert.deepEqual(contract.attempts, [
    ["page-a", "Draft A"],
    ["page-a", "Draft A"],
    ["page-a", "Discard me"],
    ["page-old", "Old page pending"],
    ["page-b", "Current page"]
  ], "title retries should retain the original entity operation and reset should allow the current entity");
  assert.deepEqual({
    first: contract.first,
    competing: contract.competing,
    duplicateRetry: contract.duplicateRetry,
    retry: contract.retry,
    discarded: contract.discarded,
    duplicateDiscardIgnored: contract.duplicateDiscardIgnored,
    staleResult: contract.staleResult,
    retryAfterReset: contract.retryAfterReset,
    currentResult: contract.currentResult
  }, {
    first: "failed",
    competing: "ignored",
    duplicateRetry: "ignored",
    retry: "submitted",
    discarded: true,
    duplicateDiscardIgnored: true,
    staleResult: "failed",
    retryAfterReset: "ignored",
    currentResult: "submitted"
  }, "title controller should serialize recovery, discard explicitly, and invalidate stale entity failures");
  assert.deepEqual(contract.states.at(-1), { status: "idle" }, "title controller should finish idle");
  assert.equal(
    contract.states.filter((state) => state.status === "error").length,
    2,
    "only owned failures should become visible"
  );
}

function testPageTitleBlurContract(contract) {
  assert.deepEqual(contract, {
    staleReactState: "Recovered page title",
    domValue: "Discarded page title",
    submitted: ["Discarded page title"]
  }, "title blur must submit the current DOM value even when committed React state lags");
}

function testPageLayoutMutationContract(contract) {
  assert.deepEqual(contract.attempts, [
    ["page-a", "fullWidth", true],
    ["page-a", "fullWidth", true],
    ["page-a", "smallText", true],
    ["page-old", "fullWidth", false],
    ["page-b", "smallText", false]
  ], "layout retries should retain the exact setting, value, and entity operation");
  assert.deepEqual({
    first: contract.first,
    blockedAfterFailure: contract.blockedAfterFailure,
    competing: contract.competing,
    duplicateRetry: contract.duplicateRetry,
    retry: contract.retry,
    discarded: contract.discarded,
    duplicateDiscardIgnored: contract.duplicateDiscardIgnored,
    staleResult: contract.staleResult,
    retryAfterReset: contract.retryAfterReset,
    currentResult: contract.currentResult
  }, {
    first: "failed",
    blockedAfterFailure: true,
    competing: "ignored",
    duplicateRetry: "ignored",
    retry: "submitted",
    discarded: true,
    duplicateDiscardIgnored: true,
    staleResult: "failed",
    retryAfterReset: "ignored",
    currentResult: "submitted"
  }, "layout controller should synchronously serialize recovery, discard explicitly, and invalidate stale entity failures");
  assert.deepEqual(contract.states.at(-1), { status: "idle" }, "layout controller should finish idle");
  assert.equal(
    contract.states.filter((state) => state.status === "error").length,
    2,
    "only owned layout failures should become visible"
  );
}

function testCoverOffsetMutationContract(contract) {
  assert.deepEqual(contract.attempts, [
    ["cover-a", 72],
    ["cover-a", 72],
    ["cover-a", 18],
    ["cover-old", 44],
    ["cover-b", 33]
  ], "cover retries should retain the original entity operation and reset should allow the current entity");
  assert.deepEqual({
    first: contract.first,
    competing: contract.competing,
    duplicateRetry: contract.duplicateRetry,
    retry: contract.retry,
    discarded: contract.discarded,
    duplicateDiscardIgnored: contract.duplicateDiscardIgnored,
    staleResult: contract.staleResult,
    retryAfterReset: contract.retryAfterReset,
    currentResult: contract.currentResult
  }, {
    first: "failed",
    competing: "ignored",
    duplicateRetry: "ignored",
    retry: "submitted",
    discarded: true,
    duplicateDiscardIgnored: true,
    staleResult: "failed",
    retryAfterReset: "ignored",
    currentResult: "submitted"
  }, "cover controller should serialize recovery, discard explicitly, and invalidate stale entity failures");
  assert.deepEqual(contract.states.at(-1), { status: "idle" }, "cover controller should finish idle");
  assert.equal(
    contract.states.filter((state) => state.status === "error").length,
    2,
    "only owned cover failures should become visible"
  );
}

function testRowCreationContract(contract) {
  assert.deepEqual(contract.concurrent, {
    operationCalls: 1,
    firstStatus: "submitted",
    secondStatus: "ignored",
    pending: [true, false],
    errors: [""],
    successes: 1
  }, "same-tick row creation should invoke one persistence operation and own one pending transition");
  assert.deepEqual(contract.failure, {
    status: "failed",
    error: "raw row creation failure",
    pending: [true, false],
    successes: 0,
    guardReset: true
  }, "row creation failures should normalize non-Error values and reset their single-flight guard");
  assert.deepEqual(contract.retry, {
    status: "submitted",
    errors: [""],
    pending: [true, false],
    successes: 1
  }, "row creation retry should succeed exactly once through the reset action path");
  assert.deepEqual(contract.blocked, {
    idle: false,
    pending: true,
    recovery: true
  }, "row creation controls should stay blocked during persistence and unresolved recovery");
}

function testRowPagePropertyEditContract(contract) {
  assert.deepEqual(contract, {
    states: [
      { status: "saving", queuedCount: 0 },
      { status: "saving", queuedCount: 1 },
      {
        status: "error",
        error: "row property failure",
        queuedCount: 1,
        failedInput: { databaseId: "db", rowId: "row", fieldId: "notes", value: "retry me" }
      },
      { status: "saving", queuedCount: 1 },
      { status: "idle", queuedCount: 0 },
      { status: "saving", queuedCount: 0 },
      { status: "idle", queuedCount: 0 },
      { status: "idle", queuedCount: 0 },
      { status: "saving", queuedCount: 0 },
      {
        status: "error",
        error: "row property failure",
        queuedCount: 0,
        failedInput: { databaseId: "db", rowId: "row", fieldId: "notes", value: "discard me" }
      },
      { status: "idle", queuedCount: 0 },
      { status: "idle", queuedCount: 0 }
    ],
    attempts: [
      ["notes", "retry me"],
      ["notes", "retry me"],
      ["empty_text", "queued"],
      ["notes", "discard me"]
    ],
    retryAccepted: true,
    duplicateRetryIgnored: true,
    discardAccepted: true,
    duplicateDiscardIgnored: true,
    discardedCount: 1,
    first: "submitted",
    later: "submitted",
    discarded: "discarded"
  }, "row-page properties should preserve field wiring across ordered Retry and Discard recovery");
}

function testFormulaFieldSettingsDialog(html) {
  assert.match(html, /Formula columns/, "formula settings should explain storage column references");
  assert.match(html, /Column letters and row numbers follow CSV storage order/, "formula settings should explain stable source coordinates");
  assert.match(html, /<code>A<\/code><span>ID<\/span><small>id<\/small>/, "formula settings should map the first schema field to column A");
  assert.match(html, /<code>D<\/code><span>SKU<\/span><small>sku<\/small>/, "formula settings should include visible field coordinates after system fields");
  assert.match(html, /AVERAGEIFS\(\[weight_kg\], \[recorded_date\]/, "formula settings should show an Excel-style date-based average example");
  assert.match(html, /SUM\(VALUES\(&quot;line_total&quot;, 4, 100\)\)/, "formula settings should show a stable cross-row aggregation example");
  assert.match(html, />Preview formula<\/button>/, "formula settings should expose an explicit preview action");
}

function testSystemFieldSettingsDialog(html) {
  assert.match(html, /Original Notion HTML/, "system field name should render");
  assert.match(html, /System field values are managed by Lotion/, "system field helper should render");
  assert.match(html, /<input[^>]+disabled=""[^>]+value="Original Notion HTML"/, "system field name input should be disabled");
  assert.match(html, /<select[^>]+disabled="">/, "system field type select should be disabled");
  assert.match(html, />Save field<\/button>/, "system dialog should still expose display-setting save");
}

function testSelectFieldSettingsDialog(html) {
  assert.match(html, /<p>status<\/p>/, "select field id should render");
  assert.match(html, /Options/, "select option section should render");
  assert.equal(count(html, 'class="option-editor-row"'), 2, "select options should render editable rows");
  assert.match(html, /value="Todo"/, "first option name should render");
  assert.match(html, /value="Done"/, "second option name should render");
  assert.match(html, /value="green"/, "option color selector should preserve colors");
  assert.match(html, /Cells can only use these options/, "options helper text should render");
}

function testUrlCell(html) {
  assert.match(html, /class="url-cell"/, "URL cells should render through the URL provider");
  assert.match(html, /class="url-cell-display"/, "URL cells should expose a visible display label");
  assert.match(html, /https:\/\/example\.com\/research/, "URL display value should be visible");
  assert.match(html, /<input[^>]+type="url"[^>]+value="https:\/\/example\.com\/research"/, "URL cells should remain directly editable");
  assert.match(html, /class="url-cell-open"/, "URL cells should include a separate open affordance");
  assert.match(html, /aria-label="Open URL"/, "URL open affordance should be accessible");
}

function testTitleCell(html) {
  assert.match(html, /class="title-cell-with-icon"/, "title cells should render the icon/editor/open wrapper");
  assert.match(html, /class="entity-icon entity-icon-emoji"/, "title cells should render row icons");
  assert.match(html, />📝</, "title cells should preserve emoji row icons");
  assert.match(html, /value="Visible Title"/, "title cells should render the editable title value");
  assert.match(html, /class="title-cell-open"/, "title cells should expose row-page open affordance");
  assert.match(html, /aria-label="Open"/, "title open affordance should be accessible");
}

function testFormulaCell(html) {
  assert.match(html, /class="readonly-cell"/, "formula cells should render read-only content");
  assert.match(html, />42</, "formula values should be visible");
  assert.doesNotMatch(html, /<input/, "formula cells should not render editable inputs");
  assert.doesNotMatch(html, /<textarea/, "formula cells should not render editable textareas");
}

function testFilterPopoverContent(html) {
  assert.match(html, /role="dialog"[^>]+aria-label="Filter"/, "filter popover should expose dialog semantics");
  assert.match(html, /class="popover filter-popover advanced-filter-popover"/, "advanced filter popover class should render");
  assert.match(html, /left:12px/, "filter popover should clamp anchored left position");
  assert.match(html, /top:64px/, "filter popover should preserve anchored top position");
  assert.match(html, /width:min\(480px, calc\(100vw - 24px\)\)/, "filter popover should render viewport-safe width");
  assert.match(html, /class="advanced-filter-header"[\s\S]*<strong>Filter<\/strong>[\s\S]*4 conditions/, "filter popover heading and condition count should render");
  assert.match(html, /class="filter-chip-list"[^>]+aria-label="Active filters"/, "active filter summaries should render");
  assert.match(html, /Name contains alpha/, "text filter chip should be human readable");
  assert.equal(count(html, 'class="filter-row"'), 4, "filter popover should render one row per filter");
  assert.match(html, />Name<\/option>/, "filter field choices should render");
  assert.match(html, />Score<\/option>/, "number field choices should render");
  assert.match(html, />Done<\/option>/, "checkbox field choices should render");
  assert.match(html, />contains<\/option>/, "text operator should render");
  assert.match(html, />is greater\/after<\/option>/, "number greater-than operator should render");
  assert.match(html, /<input aria-label="Filter value" type="search"[^>]+value="alpha"/, "text filter value input should render");
  assert.match(html, /<input aria-label="Filter value" type="number"[^>]+value="7"/, "number filter value input should render");
  assert.match(html, /<input aria-label="Related entity" type="search"[^>]+value="row_42"/, "entity-reference filters should render a named search editor");
  assert.equal(count(html, 'aria-label="Filter value"'), 2, "checkbox and entity-reference filters should use their appropriate value controls");
  assert.equal(count(html, 'aria-label="Remove filter"'), 4, "each filter row should expose a remove action");
  assert.match(html, /class="popover-add"[^>]*>\+ Add condition<\/button>/, "filter popover should expose condition creation");
  assert.match(html, /class="popover-add"[^>]*>\+ Add group<\/button>/, "filter popover should expose group creation");
}

function testFilterPopoverContentEmpty(html) {
  assert.match(html, /No conditions/, "empty filter count should render");
  assert.match(html, /Add a condition or an advanced group/, "empty filter guidance should render");
  assert.match(html, /\+ Add condition/, "empty filter state should expose condition creation");
  assert.match(html, /\+ Add group/, "empty filter state should expose group creation");
  assert.equal(count(html, 'class="filter-row"'), 0, "empty filter state should not render filter rows");
}

function testSortPopoverContent(html) {
  assert.match(html, /role="dialog"[^>]+aria-label="Sort"/, "sort popover should expose dialog semantics");
  assert.match(html, /class="popover sort-popover priority-sort-popover"/, "priority sort popover class should render");
  assert.match(html, /left:12px/, "sort popover should clamp anchored left position");
  assert.match(html, /top:80px/, "sort popover should preserve anchored top position");
  assert.match(html, /class="advanced-filter-header"[\s\S]*<strong>Sort<\/strong>[\s\S]*2 rules/, "sort popover heading and rule count should render");
  assert.match(html, /class="sort-priority-chips"[^>]+aria-label="Sort priority"[\s\S]*1\. Name[\s\S]*2\. Score/, "visible priority chips should reflect rule order");
  assert.equal(count(html, 'class="sort-rule"'), 2, "sort popover should render one rule per sort");
  assert.match(html, />Name<\/option>/, "sort field choices should render");
  assert.match(html, />Score<\/option>/, "sort number field choice should render");
  assert.match(html, />A → Z<\/option>/, "text-specific ascending label should render");
  assert.match(html, />Smallest first<\/option>/, "number-specific ascending label should render");
  assert.match(html, />Largest first<\/option>/, "number-specific descending label should render");
  assert.match(html, /aria-label="Reorder Name"/, "rules should expose keyboard and drag reorder handles");
  assert.match(html, /aria-label="Move Name down"/, "rules should expose explicit move controls");
  assert.equal(count(html, 'aria-label="Remove sort"'), 2, "each sort row should expose a remove action");
  assert.match(html, /class="popover-add"[^>]*>\+ Add sort<\/button>/, "sort popover should expose add action");
}

function testSortPopoverContentEmpty(html) {
  assert.match(html, /No sorts/, "empty sort state should render");
  assert.match(html, /\+ Add sort/, "empty sort state should still expose add action");
  assert.equal(count(html, 'class="sort-rule"'), 0, "empty sort state should not render sort rules");
}

function testSortPopoverContentDisabled(html) {
  assert.match(html, /<button[^>]+class="popover-add"[^>]+disabled="">\+ Add sort<\/button>/, "add sort should be disabled when all fields are sorted");
}

function testGlobalSearchPanelContentRecent(html) {
  assert.match(html, /class="dialog global-search"/, "global search dialog should render");
  assert.match(html, /aria-label="命令面板：搜索页面、数据库、行内容或执行命令"/, "search input should be labelled as a command palette");
  assert.match(html, /placeholder="搜索页面、数据库、行内容、命令…"/, "search input should expose the full placeholder");
  assert.match(html, /data-testid="global-search-progress"[^>]+data-state="recent"/, "recent search should expose a recent progress state");
  assert.match(html, /最近访问、标签和命令/, "empty query should expose the unified recent, tag, and command state");
  assert.match(html, /Enter 打开页面、标签或执行命令/, "empty query should explain that Enter can navigate or execute commands");
  assert.equal(count(html, 'class="global-search-hit'), 6, "recent panel should render recent entries, tag pages, and default commands");
  assert.match(html, /gs-kind-badge recent/, "recent rows should render recent badges");
  assert.match(html, /data-search-item-type="recent"/, "recent rows should expose stable item-type metadata");
  assert.match(html, /Recent Page/, "recent page title should render");
  assert.match(html, /Recent Database/, "recent database title should render");
  assert.match(html, /Recent Row Page/, "recent row-page title should render");
  assert.match(html, /页面 · Workspace/, "recent page subtitle should render parent path context");
  assert.match(html, /数据库 · Workspace \/ Data/, "recent database subtitle should render parent path context");
  assert.match(html, /data-search-item-type="tag"/, "tag page rows should expose stable item-type metadata");
  assert.match(html, /gs-kind-badge tag/, "tag page rows should render tag badges");
  assert.match(html, /#Focus/, "tag page title should render");
  assert.match(html, /标签页 · 2 个项目 · 页面 1 · 数据库 1/, "tag page preview should summarize tagged content");
  assert.match(html, /data-search-item-type="command"/, "default command rows should expose stable item-type metadata");
  assert.match(html, /新建页面/, "default command palette should expose New page");
  assert.match(html, /Lotion · 内置 · lotion\.new-page/, "default command preview should include built-in source and id");
  assert.match(html, /打开侧栏设置/, "default command palette should expose Open settings");
  assert.match(html, /class="gs-shortcut-label"[^>]*>⌘,<\/span>/, "command rows should render shortcut labels");
  assert.match(html, /Lotion · 内置 · lotion\.open-sidebar-settings/, "default command preview should include Open settings id");
  assert.doesNotMatch(html, /global-search-filters/, "recent default state should not show typed-query filters");
}

function testGlobalSearchPanelContentResults(html) {
  assert.match(html, /value="uber"/, "typed search input should preserve the current query");
  assert.match(html, /role="group"[^>]+aria-label="搜索结果类型"/, "typed search should expose result-type filters");
  assert.match(html, /class="active"><span>全部<\/span><span class="global-search-filter-count">24<\/span>/, "all filter should include command and search hit counts");
  assert.match(html, /<span>标题<\/span><span class="global-search-filter-count">1<\/span>/, "title filter count should render");
  assert.match(html, /<span>正文\/字段<\/span><span class="global-search-filter-count">1<\/span>/, "content filter count should render");
  assert.match(html, /<span>数据库<\/span><span class="global-search-filter-count">1<\/span>/, "database filter count should render");
  assert.match(html, /<span>命令<\/span><span class="global-search-filter-count">21<\/span>/, "command filter count should render");
  assert.match(html, /data-testid="global-search-progress"[^>]+data-state="partial"/, "typed search should expose a partial progress state");
  assert.match(html, /data-visible-count="23"[^>]+data-total-count="24"[^>]+data-truncated="true"[^>]+data-has-more="true"/, "typed search progress should expose visible, total, truncated, and has-more state");
  assert.match(html, /显示 23\/24\+ 个结果/, "typed search result meta should include visible count and capped total");
  assert.match(html, /当前只挂载 23 条/, "typed search result meta should explain mounted result cap");
  assert.match(html, /gs-kind-badge command/, "command result badge should render");
  assert.match(html, /Open LLM Chat/, "command title should render");
  assert.match(html, /LLM · LLM plugin · llm.open/, "command preview should include category, plugin, and id");
  assert.match(html, /Ask LLM about selection/, "selection command title should render");
  assert.match(html, /LLM · LLM plugin · llm\.ask-selection/, "selection command preview should include category, plugin, and id");
  assert.match(html, /Open Advanced Search/, "Advanced Search command title should render");
  assert.match(html, /Search · Advanced Search · advanced-search\.open/, "Advanced Search command preview should include category, plugin, and id");
  assert.match(html, /Open GitHub Backup/, "GitHub Backup command title should render");
  assert.match(html, /Sync · GitHub Backup · github-backup\.open/, "GitHub Backup command preview should include category, plugin, and id");
  assert.match(html, /Open Git Sync/, "Git Sync command title should render");
  assert.match(html, /Sync · Git Sync · git-sync\.open/, "Git Sync command preview should include category, plugin, and id");
  assert.match(html, /Fetch Git remote status/, "Git Sync fetch-status command title should render");
  assert.match(html, /Sync · Git Sync · git-sync\.fetch-status/, "Git Sync fetch-status command preview should include category, plugin, and id");
  assert.match(html, /Initialize Git repo/, "Git Sync init command title should render");
  assert.match(html, /Sync · Git Sync · git-sync\.init-repository/, "Git Sync init command preview should include category, plugin, and id");
  assert.match(html, /Test Git remote access/, "Git Sync remote test command title should render");
  assert.match(html, /Sync · Git Sync · git-sync\.test-remote/, "Git Sync remote test command preview should include category, plugin, and id");
  assert.match(html, /Pull Git remote/, "Git Sync pull command title should render");
  assert.match(html, /Sync · Git Sync · git-sync\.pull/, "Git Sync pull command preview should include category, plugin, and id");
  assert.match(html, /Push Git remote/, "Git Sync push command title should render");
  assert.match(html, /Sync · Git Sync · git-sync\.push/, "Git Sync push command preview should include category, plugin, and id");
  assert.match(html, /Check Git squash safety/, "Git Sync squash safety command title should render");
  assert.match(html, /Sync · Git Sync · git-sync\.squash-preflight/, "Git Sync squash safety command preview should include category, plugin, and id");
  assert.match(html, /打开所有页面/, "built-in command title should render");
  assert.match(html, /Lotion · 内置 · lotion\.open-pages/, "built-in command preview should include Lotion source and id");
  assert.match(html, /打开最近访问/, "open recent command title should render");
  assert.match(html, /Lotion · 内置 · lotion\.open-recent/, "open recent command preview should include Lotion source and id");
  assert.match(html, /打开侧栏设置/, "open sidebar settings command title should render");
  assert.match(html, /Lotion · 内置 · lotion\.open-sidebar-settings/, "open sidebar settings command preview should include Lotion source and id");
  assert.match(html, /切换 Vim 模式/, "toggle Vim mode command title should render");
  assert.match(html, /Lotion · 内置 · lotion\.toggle-vim-mode/, "toggle Vim mode command preview should include Lotion source and id");
  assert.match(html, /切换原文模式/, "toggle raw markdown command title should render");
  assert.match(html, /Lotion · 内置 · lotion\.toggle-raw-markdown/, "toggle raw markdown command preview should include Lotion source and id");
  assert.match(html, /切换嵌入源码显示/, "toggle embed source command title should render");
  assert.match(html, /Lotion · 内置 · lotion\.toggle-embed-source/, "toggle embed source command preview should include Lotion source and id");
  assert.match(html, /收藏\/取消收藏当前页面/, "favorite command title should render");
  assert.match(html, /Lotion · 内置 · lotion\.toggle-favorite/, "favorite command preview should include Lotion source and id");
  assert.match(html, /切换当前页面全宽/, "full-width command title should render");
  assert.match(html, /Lotion · 内置 · lotion\.toggle-full-width/, "full-width command preview should include Lotion source and id");
  assert.match(html, /切换当前页面小字号/, "small-text command title should render");
  assert.match(html, /Lotion · 内置 · lotion\.toggle-small-text/, "small-text command preview should include Lotion source and id");
  assert.match(html, /在新窗口打开当前项目/, "open-current-in-new-window command title should render");
  assert.match(html, /Lotion · 内置 · lotion\.open-current-in-new-window/, "open-current-in-new-window command preview should include Lotion source and id");
  assert.match(html, /gs-kind-badge">数据库<\/span>/, "database result kind badge should render");
  assert.match(html, /gs-match-badge database/, "database match badge should render");
  assert.match(html, /每日习惯/, "database result title should render");
  assert.match(html, /晨间日记 \/ 每日习惯/, "database entity path should render");
  assert.match(html, /gs-kind-badge">页面<\/span>/, "row result kind badge should render as a page for users");
  assert.match(html, /gs-match-badge title/, "row title match badge should render");
  assert.match(html, /<mark>Uber<\/mark>/, "matched preview ranges should render as highlighted snippets");
  assert.match(html, /class="global-search-more"[^>]*>加载更多<\/button>/, "load-more affordance should render when more results exist");
}

function testGlobalSearchPanelContentLoading(html) {
  assert.match(html, /data-testid="global-search-progress"[^>]+data-state="loading"/, "loading search should expose a loading progress state");
  assert.match(html, /搜索“uber”…/, "loading search should show the query in progress copy");
  assert.match(html, /输入框保持可编辑/, "loading search should promise editable input while pending");
  assert.match(html, /global-search-filters/, "loading typed search should keep filters visible");
  assert.doesNotMatch(html, /没有匹配。/, "loading state should not show empty result copy");
}

function testGlobalSearchPanelContentEmpty(html) {
  assert.match(html, /data-testid="global-search-progress"[^>]+data-state="empty"/, "empty typed search should expose an empty progress state");
  assert.match(html, /没有匹配。/, "empty typed search should show empty result copy");
  assert.match(html, /尝试更短的关键词，或切换结果类型。/, "empty typed search should show recovery copy");
  assert.match(html, /<span>全部<\/span><span class="global-search-filter-count">0<\/span>/, "empty typed search should render zero filter counts");
}

function testGlobalSearchPanelContentEnglish(html) {
  assert.match(html, /aria-label="Command palette: search pages, databases, row content, or run a command"/, "English search input should use the configured locale");
  assert.match(html, /placeholder="Search pages, databases, row content, commands…"/, "English search placeholder should use the configured locale");
  assert.match(html, /role="group"[^>]+aria-label="Search result types"/, "English search filters should be labelled");
  for (const label of ["All", "Title", "Content \/ field", "Reference", "Database", "Command"]) {
    assert.match(html, new RegExp(`<span>${label}<\\/span>`), `English search filter ${label} should render`);
  }
  assert.match(html, /aria-label="Search sort"/, "English search sort should be labelled");
  assert.match(html, /Showing 2 of 2 results/, "English search progress should use the configured locale");
  assert.match(html, /gs-kind-badge command[^>]*>Command</, "English command badges should use the configured locale");
  assert.doesNotMatch(html, /命令面板|搜索结果类型|没有匹配|加载更多/, "English search chrome should not mix in Chinese copy");
}

function testViewSettingsDialog(html) {
  assert.match(html, /role="dialog"[^>]+aria-label="View settings"/, "view settings dialog should be labelled");
  assert.match(html, /<h2>View settings<\/h2>/, "view settings heading should render");
  assert.match(html, /<p>view_kanban<\/p>/, "view id should render for management context");
  assert.match(html, /value="Team board"/, "view name input should preserve the current name");
  assert.match(html, /表格 \/ Table/, "builtin table view option should render");
  assert.match(html, /🧩 Kanban Plus/, "plugin view option should render");
  assert.match(html, /data-field-id="title"/, "title field should be manageable");
  assert.match(html, /data-field-id="status"/, "status field should be manageable");
  assert.match(html, /data-field-id="notes"/, "notes field should be manageable");
  assert.doesNotMatch(html, /data-field-id="hidden"/, "hidden fields should not render in view field controls");
  assert.match(html, /aria-label="Move Status up"/, "visible fields should expose move-up controls");
  assert.match(html, /aria-label="Move Notes down"/, "visible fields should expose move-down controls");
  assert.match(html, />Daily template<\/option>/, "default template choices should render");
  assert.match(html, />50<\/option>/, "page-size choices should render");
  assert.match(html, /Group field/, "plugin field-ref config should render");
  assert.match(html, /Board density/, "plugin select config should render");
  assert.match(html, /Show empty groups/, "plugin boolean config should render");
  assert.match(html, /Card limit/, "plugin number config should render");
  assert.match(html, /Board note/, "plugin text config should render");
  assert.match(html, />Set as default<\/button>/, "set-default action should render when available");
  assert.match(html, />Duplicate<\/button>/, "duplicate action should render when available");
  assert.match(html, /class="danger-button"[^>]*>Delete<\/button>/, "delete action should render when available");
  assert.match(html, />Save view<\/button>/, "save action should render");
}

function testViewSettingsActionContract(contract) {
  assert.deepEqual(contract.hydration, {
    failedSameView: false,
    idleSameView: true,
    switchedView: true
  }, "failed same-view refreshes should retain the draft while idle or switched views hydrate");
  assert.deepEqual(contract.dismissal, {
    pending: false,
    idle: true,
    closeCalls: 1
  }, "view settings should block dismissal only while an action is pending");
  assert.equal(contract.concurrent.operationCalls, 1, "same-tick view settings actions should invoke one persistence operation");
  assert.equal(contract.concurrent.firstStatus, "submitted", "the first view settings action should submit");
  assert.equal(contract.concurrent.secondStatus, "ignored", "a competing same-tick action should be ignored");
  assert.deepEqual(contract.concurrent.pending, [true, false], "the submitted action should own one pending transition");
  assert.deepEqual(contract.concurrent.errors, [""], "the submitted action should clear stale errors");
  assert.equal(contract.concurrent.successes, 1, "the submitted action should close once");
  assert.deepEqual(contract.failure, {
    status: "failed",
    error: "raw view settings failure",
    pending: [true, false],
    successes: 0,
    guardReset: true
  }, "view settings failures should normalize errors, retain the dialog, and reset the guard");
  assert.deepEqual(contract.retry, {
    status: "submitted",
    errors: [""],
    pending: [true, false],
    successes: 1
  }, "view settings retry should reuse the reset action path and close once");
}

function testRowTemplateDialog(html) {
  assert.match(html, /class="row-template-dialog"/, "row template dialog should render");
  assert.match(html, /<h2>Templates<\/h2>/, "template dialog heading should render");
  assert.match(html, /<p>Template Database<\/p>/, "schema name should render for context");
  assert.match(html, /New template/, "new template entry should render");
  assert.match(html, /Daily review/, "existing template entry should render");
  assert.match(html, /value="Daily review"/, "selected template name should render");
  assert.match(html, /Field defaults/, "field defaults section should render");
  assert.match(html, />Name<\/span><input[^>]+value="Daily title"/, "title default should render");
  assert.match(html, />Score<\/span><input[^>]+type="number"[^>]+value="7"/, "number default should render");
  assert.match(html, />Due<\/span><input[^>]+type="date"[^>]+value="2026-06-12"/, "date default should render");
  assert.match(html, />Done<\/span><input[^>]+type="checkbox"[^>]+checked=""/, "checkbox default should render");
  assert.match(html, />Status<\/span><select><option value=""><\/option><option[^>]+selected="">Doing<\/option>/, "select default should render");
  assert.doesNotMatch(html, /System Field/, "system fields should be excluded from template defaults");
  assert.doesNotMatch(html, /Hidden Field/, "hidden fields should be excluded from template defaults");
  assert.doesNotMatch(html, /Formula Field/, "formula fields should be excluded from template defaults");
  assert.doesNotMatch(html, /Rollup Field/, "rollup fields should be excluded from template defaults");
  assert.match(html, /Daily body note/, "template markdown body should render");
  assert.match(html, /Full width/, "full-width setting should render");
  assert.match(html, /class="danger-button"[^>]*>Delete<\/button>/, "delete action should render for existing templates");
  assert.match(html, />Cancel<\/button>/, "cancel action should render");
  assert.match(html, /class="primary"[^>]*>Save template<\/button>/, "save action should render");
}

function testRowTemplateActionContract(contract) {
  assert.deepEqual(contract.hydration, {
    failedSameTemplate: false,
    idleSameTemplate: true,
    switchedTemplate: true
  }, "failed same-template refreshes should retain the draft while idle or switched templates hydrate");
  assert.deepEqual(contract.dismissal, {
    pending: false,
    idle: true,
    closeCalls: 1
  }, "row template dismissal should be blocked only while persistence is pending");
  assert.equal(contract.concurrent.operationCalls, 1, "same-tick template actions should invoke one persistence operation");
  assert.equal(contract.concurrent.firstStatus, "submitted", "the accepted template action should submit");
  assert.equal(contract.concurrent.secondStatus, "ignored", "a competing same-tick template action should be ignored");
  assert.deepEqual(contract.concurrent.pending, [true, false], "the accepted template action should own one pending transition");
  assert.deepEqual(contract.concurrent.errors, [""], "the accepted template action should clear stale errors");
  assert.equal(contract.concurrent.successes, 1, "the accepted template action should complete once");
  assert.deepEqual(contract.failure, {
    status: "failed",
    error: "raw template failure",
    pending: [true, false],
    successes: 0,
    guardReset: true
  }, "template failures should normalize errors, retain the dialog, and reset the guard");
  assert.deepEqual(contract.retry, {
    status: "submitted",
    errors: [""],
    pending: [true, false],
    successes: 1
  }, "template retry should reuse the reset action path and succeed once");
}

function testSlashMenuContent(html) {
  assert.match(html, /class="slash-menu"[^>]+style="left:12px;top:24px"/, "slash menu should render at the provided anchor style");
  assert.equal(count(html, 'class="slash-menu-group-heading"'), 3, "slash menu should group commands by group label");
  assert.equal(count(html, 'class="slash-menu-item'), 5, "slash menu should render all visible commands");
  assert.match(html, /class="slash-menu-item active"/, "slash menu should mark the active command");
  assert.match(html, /class="slash-menu-label">Text<\/span>/, "slash menu should render command labels");
  assert.match(html, /class="slash-menu-group">Plain paragraph<\/span>/, "slash menu should render localized command descriptions");
  assert.doesNotMatch(html, /普通文本|大标题|强调提示块/, "English slash menu should not mix in Chinese command copy");
  assert.doesNotMatch(html, /slash-menu-hint/, "slash menu should not render a separate bilingual hint column");
  assert.match(html, /lucide-heading-1/, "slash menu should render heading command icons");
  assert.match(html, /class="slash-menu-label">Callout<\/span>/, "slash menu should render callout command");
  assert.match(html, /lucide-lightbulb/, "slash menu should render callout icon");
  assert.match(html, /class="slash-menu-label">Highlight<\/span>/, "slash menu should render highlight command");
  assert.match(html, /lucide-highlighter/, "slash menu should render highlight icon");
  assert.match(html, /class="slash-menu-label">Database<\/span>/, "slash menu should render database command");
  assert.match(html, /lucide-database/, "slash menu should render database icon");
}

function testSlashMenuContentZh(html) {
  assert.match(html, /class="slash-menu-group-heading">基础<\/div>/, "Chinese slash menu should localize group headings");
  assert.match(html, /class="slash-menu-label">文本<\/span>/, "Chinese slash menu should localize command labels");
  assert.match(html, /class="slash-menu-group">普通段落<\/span>/, "Chinese slash menu should localize command descriptions");
  assert.match(html, /class="slash-menu-label">标注<\/span>/, "Chinese slash menu should render localized callout command");
  assert.match(html, /class="slash-menu-label">高亮<\/span>/, "Chinese slash menu should render localized highlight command");
  assert.match(html, /class="slash-menu-label">数据库<\/span>/, "Chinese slash menu should render localized database command");
  assert.doesNotMatch(html, /Heading 1|Callout|Plain paragraph|Large section title/, "Chinese slash menu should not mix in English command copy");
  assert.doesNotMatch(html, /slash-menu-hint/, "Chinese slash menu should not render a separate bilingual hint column");
}

function testSlashMenuContentEmpty(html) {
  assert.match(html, /class="slash-menu"[^>]+style="left:16px;top:32px"/, "empty slash menu should preserve anchor style");
  assert.match(html, /class="slash-menu-empty"[^>]*>No matching commands\.<\/div>/, "slash menu should render a localized empty result state");
  assert.doesNotMatch(html, /slash-menu-item/, "empty slash menu should not render command rows");
}

function testSlashMenuContentEmptyZh(html) {
  assert.match(html, /class="slash-menu-empty"[^>]*>没有匹配的命令。<\/div>/, "Chinese slash menu should render a localized empty result state");
  assert.doesNotMatch(html, /slash-menu-item/, "empty slash menu should not render command rows");
}

function testWidgetMarkdownFormatting(html) {
  assert.match(html, /<blockquote>[\s\S]*<strong>从现在开始/, "widget markdown should render imported blockquote bold markers");
  assert.match(html, /<blockquote>[\s\S]*<em>斜体触发<\/em>/, "widget markdown should render imported blockquote italic markers");
  assert.match(html, /<code>inline code<\/code>/, "widget markdown should preserve inline code");
  assert.match(html, /<a href="https:\/\/example\.com">link<\/a>/, "widget markdown should render links");
  assert.match(html, /cm-md-notion-bg cm-md-notion-bg-yellow/, "widget markdown should restore Lotion highlight spans");
  assert.doesNotMatch(html, /\*\*<\/p>/, "widget markdown should not leave closing bold markers as literal text");
}

function testTabStrip(html) {
  assert.match(html, /class="tab-strip"/, "tab strip should render");
  assert.equal(count(html, 'draggable="true"'), 5, "tab strip should render all open tabs");
  assert.equal(count(html, 'draggable="false"'), 1, "startup diagnostics tab should stay pinned to its window");
  assert.match(html, /class="tab active"/, "active tab should be marked");
  assert.equal(count(html, 'class="tab-icon"'), 4, "entity and startup tabs should render compact icons");
  assert.match(html, /class="tab-icon"[\s\S]*class="tab-label">Home Page<\/span>/, "page tab should render an icon and page title");
  assert.match(html, /class="tab-icon"[\s\S]*class="tab-label">Daily Habits<\/span>/, "database tab should render an icon and database name");
  assert.match(html, /class="tab-icon"[\s\S]*class="tab-label">Daily Habits\/2026\/06\/12 Review<\/span>/, "row page tab should render an icon, database context, and row title");
  assert.match(html, /<span class="tab-label">所有页面<\/span>/, "management tab should render management label");
  assert.doesNotMatch(html, /class="tab-type"/, "tabs should not render translated type badges");
  assert.match(html, /<span class="tab-label">新标签页<\/span>/, "blank tab should render the new-tab label");
  assert.match(html, /<span class="tab-label">Startup performance<\/span>/, "startup tab should use the localized diagnostics label");
  assert.doesNotMatch(html, /row_today/, "tab labels should not expose raw row ids");
  assert.equal(count(html, 'class="tab-pop-out"'), 4, "tabs with active items should expose pop-out actions");
  assert.equal(count(html, 'aria-label="Move to new window"'), 4, "pop-out actions should be accessible");
  assert.equal(count(html, 'class="tab-close"'), 5, "multi-tab strip should expose close actions for every tab");
  assert.match(html, /class="tab-add"[^>]+aria-label="New tab"/, "tab strip should expose the new-tab button");
  assert.match(html, /title="页面: Daily Habits\/2026\/06\/12 Review"/, "row-page tab title should include type and label");
}

function testStartupPerformancePanel(html) {
  assert.match(html, /data-testid="startup-performance"/, "startup report should render a stable test id");
  assert.match(html, /data-grade="slow"/, "startup report should expose its performance grade");
  assert.match(html, /Startup performance/, "startup report should render its title");
  assert.match(html, /Real workspace/, "startup report should name the measured workspace");
  assert.match(html, /2\.34s/, "startup report should render total time");
  assert.match(html, /data-phase="index"/, "startup report should include the index phase");
  assert.match(html, /data-operation="workspaceIndex"/, "startup report should include persistent index timing");
  assert.match(html, /43,320 pages/, "startup report should include operation item counts");
  assert.match(html, /data-operation="workspacePath"/, "startup report should time workspace path resolution");
  assert.match(html, /SQLite cache hit/, "startup report should show the persistent cache status");
  assert.match(html, /validated in 10ms/, "startup report should show cache validation timing");
  assert.match(html, /This report is kept only for this app session/, "startup report should explain session-only retention");
}

function testBackupButton(html) {
  assert.match(html, /class="backup-button"/, "backup button should render");
  assert.match(html, />Backup<\/button>/, "backup button should render the idle label");
  assert.doesNotMatch(html, /disabled=""/, "backup button should be enabled while idle");
  assert.doesNotMatch(html, /Backing up/, "backup busy label should not render while idle");
}

function testSearchBox(html) {
  assert.match(html, /<button/, "search entry should render as a button");
  assert.match(html, /type="button"/, "search entry should not default to submit behavior");
  assert.match(html, /class="search-box search-box-button"/, "search entry should render stable sidebar search classes");
  assert.match(html, /class="search-box-label">Search<\/span>/, "search entry should render the concise localized search label");
  assert.match(html, /class="search-box-shortcut">⌘K<\/kbd>/, "search entry should expose its keyboard shortcut");
  assert.doesNotMatch(html, /<input/, "search entry should not render an editable input before the global panel opens");
}

function testSidebarShell(html) {
  assert.match(html, /class="sidebar"/, "sidebar shell should render");
  assert.match(html, /class="workspace-selector"/, "workspace selector should render");
  assert.match(html, /Renderer Workspace/, "workspace name should render");
  assert.match(html, /class="search-box-label">Search<\/span>/, "sidebar search entry should render");
  assert.match(html, />Recent</, "recent section should render");
  assert.match(html, /Weekly Review/, "recent page title should render");
  assert.match(html, /Daily Habits/, "recent database title should render");
  assert.match(html, /2026\/06\/23 Review/, "recent row-page title should resolve through the cache");
  assert.match(html, />Databases</, "database section should render from configured tags");
  assert.match(html, />All databases</, "database management entry should render");
  assert.match(html, />Pages</, "page section should render from configured tags");
  assert.match(html, />All pages</, "page management entry should render");
  assert.match(html, /class="nav-page-tree-toggle"/, "page section should render nested page disclosure controls");
  assert.match(html, /aria-label="Collapse Project Plan"/, "nested page disclosure should name the parent page");
  assert.match(html, /Project Plan Child/, "child page should render under its parent in the Pages section");
  assert.match(html, />import</, "custom sidebar tag section should render");
  assert.match(html, /Content Projects/, "tagged database should render in the sidebar");
  assert.match(html, /Project Plan/, "tagged page should render in the sidebar");
  assert.match(html, /aria-label="Quick create"/, "quick-create footer control should render");
  assert.match(html, /Renderer sidebar/, "plugin sidebar footer item should render");
  assert.match(html, />Plugins</, "plugins footer entry should render");
  assert.match(html, />Settings</, "settings footer should render");
  assert.match(html, /Sidebar/, "sidebar layout settings should render");
  assert.match(html, /Available sidebar tags/, "sidebar tag picker should render");
  assert.match(html, /Sidebar order/, "sidebar tag order controls should render");
  assert.doesNotMatch(html, /Keyboard shortcuts/, "closed quick settings should not load shortcut settings");
  assert.doesNotMatch(html, /Open command palette/, "closed quick settings should not load shortcut rows");
  assert.doesNotMatch(html, />Backup<\/button>/, "closed quick settings should not load the backup action");
  assert.match(html, />Files</, "files section should render");
}

function testSidebarPageContextMenu(html) {
  assert.match(html, /class="sidebar-context-menu"/, "sidebar page context menu should render");
  assert.match(html, /role="menu"/, "sidebar page context menu should expose menu semantics");
  assert.match(html, /aria-label="Project Plan"/, "sidebar page context menu should name the target page");
  assert.equal(count(html, 'role="menuitem"'), 3, "sidebar page context menu should render open, child-create, and delete actions");
  assert.match(html, />Open</, "sidebar page context menu should render the open action");
  assert.match(html, />New child page</, "sidebar page context menu should render the child-page creation action");
  assert.match(html, />Delete</, "sidebar page context menu should render the delete action");
}

function testShortcutSettings(html) {
  assert.match(html, /class="shortcut-settings"/, "shortcut settings root should render");
  assert.match(html, /Search keyboard shortcuts/, "shortcut settings search should render");
  assert.match(html, /Open command palette/, "global search shortcut should render");
  assert.match(html, /Open settings/, "settings shortcut should render");
  assert.match(html, /Reset all/, "shortcut reset-all control should render");
  assert.match(html, /Edit Open command palette/, "shortcut edit control should be accessible");
}

function testStartupLoadingScreen(html) {
  assert.match(html, /data-testid="startup-loading"/, "startup loading screen should render a stable test id");
  assert.match(html, /role="status"/, "startup loading should expose a status region");
  assert.match(html, /aria-busy="true"/, "startup loading should expose busy state");
  assert.match(html, /Starting workspace/, "startup loading should render a concise phase heading");
  assert.match(html, /Loading test workspace/, "startup loading should render the supplied title");
  assert.match(html, /Opening workspace/, "workspace phase should render");
  assert.match(html, /Reading workspace index/, "index phase should render");
  assert.match(html, /Restoring page/, "navigation phase should render");
  assert.match(html, /Painting editor/, "paint phase should render");
  assert.match(html, /data-startup-phase="workspace" data-status="done"/, "completed phase should expose done status");
  assert.match(html, /data-startup-phase="index" data-status="active"/, "active phase should expose active status");
  assert.match(html, /1 of 4 phases/, "startup loading should render progress text");
}

function testStandaloneDatabaseHeader(html) {
  assert.match(html, /class="page-header"/, "standalone database header should render");
  assert.match(html, /aria-label="Change icon"/, "database icon picker should use the localized accessible label");
  assert.match(html, /Project Tracker/, "database title should render");
  assert.match(html, /Workspace \/ Operations/, "database path subtitle should render");
  assert.match(html, /3 fields · 2 rows/, "database subtitle should include visible field and row counts");
  assert.match(html, /class="page-header-addition page-add-cover"[\s\S]*Add cover/, "localized cover affordance should render when no cover is set");
  assert.match(html, /class="database-open-window"/, "open-in-new-window affordance should render");
  assert.match(html, /aria-label="Open in new window"/, "open-in-new-window affordance should be labelled");
}

function testEmbeddedDatabaseHeader(html) {
  assert.match(html, /class="embedded-view-header"/, "embedded database header should render");
  assert.match(html, /Inline Tasks/, "embedded title should render");
  assert.match(html, /All rows/, "active view name should render in subtitle");
  assert.match(html, /Table/, "active view type label should render in subtitle");
  assert.match(html, />Open<\/button>/, "embedded open action should render");
  assert.match(html, /aria-label="Refresh"/, "embedded refresh action should be labelled");
  assert.match(html, /aria-label="View settings"/, "embedded settings action should be labelled");
  assert.match(html, /data-testid="embedded-actions"/, "embedded view actions slot should render");
}

function testEmbeddedViewRendererCached(html) {
  assert.match(html, /class="embedded-view"/, "embedded view renderer should render the host wrapper");
  assert.match(html, /class="database-table embedded-table"/, "cached embedded view should render the embedded database table");
  assert.match(html, /class="embedded-view-header"/, "cached embedded view should render the database header");
  assert.match(html, /Project Tracker/, "cached embedded view should render the database name");
  assert.match(html, /All rows/, "cached embedded view should render the active view name");
  assert.match(html, />Open<\/button>/, "cached embedded view should expose the Open action");
  assert.match(html, /aria-label="Refresh"/, "cached embedded view should expose the Refresh action");
  assert.match(html, /aria-label="View settings"/, "cached embedded view should expose the settings action");
  assert.match(html, /First task/, "cached embedded view should render row content");
  assert.match(html, /Second task/, "cached embedded view should render multiple rows");
  assert.match(html, /2 of 2 rows/, "cached embedded view should render the row count footer");
  assert.doesNotMatch(html, /```lotion-view/, "cached embedded view should not expose raw source fences");
}

function testEmbeddedViewRendererLoading(html) {
  assert.match(html, /class="embedded-view"/, "loading embedded view should keep a stable host wrapper");
  assert.match(html, /Loading view\.\.\./, "loading embedded view should communicate loading state");
  assert.doesNotMatch(html, /database-table embedded-table/, "loading embedded view should not render a blank table shell");
  assert.doesNotMatch(html, /```lotion-view/, "loading embedded view should not expose raw source fences");
}

function testMissingEmbeddedViewDiagnosticCopy(copy) {
  assert.equal(copy.label, "Missing imported view", "missing embedded view diagnostic should label the imported-view failure");
  assert.equal(copy.title, "问题列表", "missing embedded view diagnostic should preserve the imported view title");
  assert.match(copy.message, /Imported Notion embedded database\/page view/, "diagnostic should explain the imported embedded-view context");
  assert.match(copy.message, /Search the workspace/, "diagnostic should point to a recovery path");
  assert.equal(copy.searchText, "Search workspace", "diagnostic action should be explicit");
  assert.match(copy.searchAriaLabel, /问题列表/, "search action should include the missing view title");
  assert.match(copy.ariaLabel, /Missing imported Notion embedded view: 问题列表/, "diagnostic card should expose clear accessible context");
  assert.doesNotMatch(copy.message, /^Database not found/, "diagnostic should not use the old vague message");
}

function testCleanHeadingTextContract(contract) {
  assert.deepEqual(contract, {
    markdownLink: "Read the guide",
    importedDoubleBracketLink: "工作反思跳转",
    formattedHeading: "Bold and code"
  }, "table-of-contents heading cleanup should hide Markdown formatting, URLs, and imported double brackets");
}

function testLotionToggleFenceContract(contract) {
  assert.equal(contract.parsedTo, contract.expectedTo, "legacy toggle source scan should end at the outer fence");
  assert.equal(contract.parsedSummary, "GetBannerV2", "legacy toggle source scan should preserve the outer summary");
  assert.equal(contract.parsedOpen, true, "legacy toggle source scan should preserve the outer open state");
  assert.match(contract.parsedMarkdown, /After nested toggle/, "legacy toggle source scan should preserve content after a nested toggle");
  assert.match(contract.parsedMarkdown, /````lotion-toggle/, "legacy toggle source scan should preserve nested toggle fences");
  assert.match(contract.parsedMarkdown, /```ts/, "legacy toggle source scan should preserve ordinary nested code fences");
  assert.match(contract.parsedMarkdown, /```js/, "legacy toggle source scan should preserve code fences inside nested toggles");
  assert.match(contract.parsedMarkdown, /```lotion-callout/, "legacy toggle source scan should preserve nested callout fences");
  assert.match(contract.parsedMarkdown, /```lotion-equation/, "legacy toggle source scan should preserve nested equation fences");
  assert.match(contract.parsedMarkdown, /```lotion-iframe/, "legacy toggle source scan should preserve nested iframe fences");
  assert.match(contract.parsedMarkdown, /```lotion-view/, "legacy toggle source scan should preserve nested view fences");
  assert.match(contract.parsedMarkdown, /```lotion-toc/, "legacy toggle source scan should preserve nested toc fences");
  assert.match(contract.renderedHtml, /<p>Paragraph with <strong>bold<\/strong> and <em>italic<\/em> and <code>inline code<\/code> and <s>strike<\/s>\.<\/p>/, "toggle body should render inline Markdown");
  assert.match(contract.renderedHtml, /<h1>Toggle heading 1<\/h1>/, "toggle body should render h1 headings");
  assert.match(contract.renderedHtml, /<h2>Toggle heading 2<\/h2>/, "toggle body should render h2 headings");
  assert.match(contract.renderedHtml, /<blockquote>\s*<p>Toggle quote<\/p>\s*<\/blockquote>/, "toggle body should render blockquotes");
  assert.match(contract.renderedHtml, /<ul>[\s\S]*<li>Bullet item[\s\S]*Nested bullet item[\s\S]*<\/ul>/, "toggle body should render bullet and nested bullet lists");
  assert.match(contract.renderedHtml, /<ol>[\s\S]*<li>Numbered item<\/li>[\s\S]*<li>Second numbered item<\/li>[\s\S]*<\/ol>/, "toggle body should render numbered lists");
  assert.match(contract.renderedHtml, /Toggle todo unchecked/, "toggle body should preserve unchecked task text");
  assert.match(contract.renderedHtml, /Toggle todo checked/, "toggle body should preserve checked task text");
  assert.match(contract.renderedHtml, /<table>[\s\S]*<th>Name<\/th>[\s\S]*<td style="text-align:right">1<\/td>[\s\S]*<\/table>/, "toggle body should render tables");
  assert.match(contract.renderedHtml, /<hr>/, "toggle body should render dividers");
  assert.match(contract.renderedHtml, /<img src="attachments\/toggle\.png" alt="Toggle image" \/>/, "toggle body should render standalone images without raw source text");
  assert.match(contract.renderedHtml, /<a href="https:\/\/example\.com\/toggle">Toggle link<\/a>/, "toggle body should render links");
  assert.match(contract.renderedHtml, /<pre><code class="language-ts">const value: number = 42;/, "toggle body should render fenced code blocks");
  assert.match(contract.renderedHtml, /language-lotion-callout[\s\S]*Nested callout content/, "toggle body should preserve callout fences as fenced content");
  assert.match(contract.renderedHtml, /language-lotion-equation[\s\S]*E = mc\^2/, "toggle body should preserve equation fences as fenced content");
  assert.match(contract.renderedHtml, /language-lotion-iframe[\s\S]*https:\/\/example\.com\/embed/, "toggle body should preserve iframe fences as fenced content");
  assert.match(contract.renderedHtml, /language-lotion-view[\s\S]*db_toggle/, "toggle body should preserve view fences as fenced content");
  assert.match(contract.renderedHtml, /language-lotion-toc/, "toggle body should preserve toc fences as fenced content");
  assert.match(contract.renderedHtml, /language-lotion-toggle[\s\S]*Nested child/, "toggle body should preserve nested toggle blocks as fenced content");
  assert.equal(contract.serializedFirstLine, "`````lotion-toggle", "toggle writeback should choose a longer opening fence than every nested fence");
  assert.equal(contract.serializedLastLine, "`````", "toggle writeback should close with the matching longest fence");
  assert.match(contract.serialized, /open: true/, "toggle writeback should preserve open state");
  assert.match(contract.serialized, /````lotion-toggle/, "toggle writeback should preserve nested toggle source");
  assert.equal(contract.tilde.parsedTo, contract.tilde.expectedTo, "tilde toggle source scan should end at the outer tilde fence");
  assert.equal(contract.tilde.summary, "Tilde outer", "tilde toggle source scan should preserve summary");
  assert.equal(contract.tilde.open, false, "tilde toggle source scan should preserve collapsed state");
  assert.match(contract.tilde.markdown, /Tilde body after code/, "tilde toggle source scan should preserve content after inner backtick code");
}

function testOptionMutationContract(contract) {
  assert.deepEqual(contract, {
    attempts: [["Todo", "Done"], ["Todo", "Done"], ["Todo"]],
    states: [
      { status: "pending", names: ["Todo", "Done"] },
      { status: "error", names: ["Todo", "Done"], error: "raw option failure" },
      { status: "pending", names: ["Todo", "Done"] },
      { status: "idle", names: [] },
      { status: "pending", names: ["Todo"] },
      { status: "error", names: ["Todo"], error: "raw option failure" },
      { status: "idle", names: [] }
    ],
    first: "failed",
    competing: "ignored",
    retry: "submitted",
    duplicateRetry: "ignored",
    discardAccepted: true,
    duplicateDiscardIgnored: true
  }, "field option schema changes should retain exact failed options and enforce single-flight Retry or Discard");
}

function testDatabaseViewTabsBar(html) {
  assert.match(html, /role="tablist"/, "view tab bar should expose tablist semantics");
  assert.match(html, /aria-selected="true"[^>]*class="view-tab active [^"]+"/, "active view tab should be marked selected");
  assert.match(html, /role="tab"[^>]*draggable="true"/, "view tabs should expose drag reorder");
  assert.match(html, /All rows/, "default table view should render");
  assert.match(html, /Gallery wall/, "secondary gallery view should render");
  assert.match(html, /🧩/, "plugin/provider icon should render for custom view types");
  assert.match(html, /Kanban board/, "plugin view tab should render");
  assert.match(html, /class="view-tab-add"[^>]*aria-label="New view"/, "new-view affordance should be accessible");
  assert.match(html, /aria-label="View tab display"/, "view tabs should expose the local label display preference");
  assert.match(html, /data-testid="tabs-actions"/, "non-embedded tab bar should render trailing actions");
  assert.match(html, /aria-busy="false"/, "idle view tabs should expose their transaction state");
}

function testViewOrderMutationContract(contract) {
  assert.deepEqual(contract.concurrent, {
    operationCalls: 1,
    firstStatus: "submitted",
    secondStatus: "ignored",
    pending: [true, false],
    errors: [""],
    successes: 1
  }, "view reorder should synchronously suppress a second in-flight submission");
  assert.deepEqual(contract.failure, {
    status: "failed",
    error: "raw view reorder failure",
    pending: [true, false],
    successes: 0,
    guardReset: true
  }, "view reorder should normalize thrown values and release its guard");
  assert.deepEqual(contract.retry, {
    status: "submitted",
    errors: [""],
    pending: [true, false],
    successes: 1
  }, "view reorder should allow a clean retry after atomic failure");
  assert.deepEqual(contract.blocked, {
    idle: false,
    pending: true,
    recovery: true
  }, "view controls should stay blocked during persistence and unresolved recovery");
  assert.equal(contract.typedError, "typed view reorder failure", "view reorder should preserve Error messages");
}

function testFieldTypeIcons(html) {
  assert.match(html, /data-testid="field-title"[^>]*><span class="field-type-glyph field-type-glyph-text"[^>]*>Aa<\/span>/, "title text fields should render the Aa glyph");
  assert.match(html, /data-testid="field-text"[\s\S]*lucide-text-align-start/, "ordinary text fields should render paragraph-style align-left glyphs");
  assert.match(html, /data-testid="field-number"[\s\S]*lucide-hash/, "number fields should render hash glyphs");
  assert.match(html, /data-testid="field-formula"[\s\S]*lucide-sigma/, "formula fields should render sigma glyphs");
  assert.match(html, /data-testid="field-id"[^>]*><span class="field-type-glyph field-type-glyph-id"[^>]*>id<\/span>/, "id fields should render id text glyphs");
  assert.match(html, /data-testid="field-select"[\s\S]*lucide-chevron-down/, "select fields should render dropdown glyphs");
  assert.match(html, /data-testid="field-multi"[\s\S]*lucide-tags/, "multi-select fields should render tag glyphs");
  assert.match(html, /data-testid="field-date"[\s\S]*lucide-calendar/, "date fields should render calendar glyphs");
  assert.match(html, /data-testid="field-url"[\s\S]*lucide-link/, "URL fields should render link glyphs");
  assert.match(html, /data-testid="field-checkbox"[\s\S]*lucide-square-check/, "checkbox fields should render checkbox glyphs");
  assert.match(html, /data-testid="field-created"[\s\S]*lucide-clock/, "created time fields should render clock glyphs");
  assert.match(html, /data-testid="field-unknown"[^>]*><span class="field-type-glyph"[^>]*>·<\/span>/, "unknown fields should render neutral fallback glyphs");
}

function testDefaultFieldProviders(html) {
  assert.match(html, /data-testid="default-field-provider-grid"/, "default field provider fixture should render");
  assert.equal(count(html, 'class="default-provider-case"'), 11, "all default field providers should render a fixture case");
  assert.match(html, /data-testid="provider-text"[\s\S]*class="cell-textarea"/, "text provider should render a wrapped textarea editor");
  assert.match(html, /data-testid="provider-person"[\s\S]*value="Ada Lovelace"/, "person provider should render editable text");
  assert.match(html, /data-testid="provider-number"[\s\S]*type="number"[^>]+value="42.5"/, "number provider should render a number input");
  assert.match(html, /data-testid="provider-select"[\s\S]*class="option-dropdown-trigger"/, "select provider should render the option dropdown trigger");
  assert.match(html, /data-testid="provider-select"[\s\S]*>Done</, "select provider should render the selected option pill");
  assert.match(html, /data-testid="provider-multi_select"[\s\S]*>Work</, "multi-select provider should render the first selected option");
  assert.match(html, /data-testid="provider-multi_select"[\s\S]*>Life</, "multi-select provider should render the second selected option");
  assert.match(html, /data-testid="provider-date"[\s\S]*class="date-cell-text-input"/, "date provider should render the editable text date input");
  assert.match(html, /data-testid="provider-date"[\s\S]*type="date"[^>]+value="2026-06-12"/, "date provider should render a native date picker");
  assert.match(html, /data-testid="provider-url"[\s\S]*class="url-cell-display"/, "URL provider should render highlighted display text");
  assert.match(html, /data-testid="provider-url"[\s\S]*type="url"[^>]+value="https:\/\/example.com\/note"/, "URL provider should remain directly editable");
  assert.match(html, /data-testid="provider-url"[\s\S]*aria-label="Open URL"/, "URL provider should expose a separate open action");
  assert.match(html, /data-testid="provider-entity_ref"[\s\S]*class="entity-ref-chip"/, "entity ref provider should render entity chips");
  assert.match(html, /data-testid="provider-entity_ref"[\s\S]*Linked Page/, "entity ref provider should render readable titles");
  assert.match(html, /data-testid="provider-checkbox"[\s\S]*type="checkbox"[^>]+checked=""/, "checkbox provider should render checked state");
  assert.match(html, /data-testid="provider-formula"[\s\S]*class="readonly-cell"[^>]*>SUM\(A1:A3\)<\/span>/, "formula provider should be read-only");
  assert.match(html, /data-testid="provider-rollup"[\s\S]*class="readonly-cell"[^>]*>7<\/span>/, "rollup provider should be read-only");
  assert.doesNotMatch(html, /data-testid="provider-formula"[\s\S]*<input/, "formula provider should not expose editable inputs");
  assert.doesNotMatch(html, /data-testid="provider-rollup"[\s\S]*<input/, "rollup provider should not expose editable inputs");
}

function testKanbanProviderVisual(result) {
  const { html, dropOutline, groupPillStyle, cardStyle, openedRowId, rowCreationRecovery } = result;
  assert.match(html, /class="kanban-shell"/, "kanban provider should render the shell");
  assert.match(html, /class="kanban-board"/, "kanban provider should render the board");
  assert.match(html, /class="kanban-col"/, "kanban provider should render columns");
  assert.match(html, /Design visual system/, "kanban provider should render record cards");
  assert.match(html, /Tokenize plugin UI/, "kanban provider should render all grouped cards");
  assert.match(html, /background: var\(--paper\)/, "kanban shell should use shared paper token");
  assert.match(groupPillStyle, /background: var\(--accent-soft\)/, "kanban group pill should use the shared accent soft token");
  assert.match(groupPillStyle, /color: var\(--accent\)/, "kanban group pill should use the shared accent token");
  assert.match(cardStyle, /border-bottom: 1px solid var\(--rule\)/, "kanban cards should use shared rule token");
  assert.equal(dropOutline, "2px dashed var(--accent)", "kanban drop target should use the shared accent outline");
  assert.equal(openedRowId, "row_todo", "kanban cards should delegate row opening to the host");
  assert.match(html, /border: 1px solid #a9d4b0/, "kanban option pills should share the default option color palette");
  assert.doesNotMatch(html, /#c25434|#7b7368|#ededeb|#aac1dc|#eef4fb|#315c7e/, "kanban provider should not render legacy UI fallback colors");
  assert.deepEqual(rowCreationRecovery, {
    addCalls: 2,
    duplicateSubmitSuppressed: true,
    error: "Row creation failed: raw Kanban row failure",
    addDisabledDuringRecovery: true,
    retryClearedError: true,
    initialValues: { status: "Todo" }
  }, "Kanban row creation should use one atomic initial-value write with visible single-flight recovery");
}

function testViewTypeIcons(html) {
  assert.match(html, /data-testid="view-table"[\s\S]*lucide-table-2/, "table views should render table glyphs");
  assert.match(html, /data-testid="view-list"[\s\S]*lucide-list/, "list views should render list glyphs");
  assert.match(html, /data-testid="view-calendar"[\s\S]*lucide-calendar-days/, "calendar views should render calendar-days glyphs");
  assert.match(html, /data-testid="view-gallery"[\s\S]*lucide-gallery-horizontal/, "gallery views should render gallery glyphs");
  assert.match(html, /data-testid="view-kanban"[\s\S]*lucide-square-kanban/, "kanban views should render kanban glyphs");
  assert.match(html, /data-testid="view-provider"[^>]*><span class="view-type-glyph view-type-glyph-text"[^>]*>🧩<\/span>/, "custom provider views should render provider emoji icons");
}

function testEntityIcons(html) {
  assert.match(html, /data-testid="entity-page"[^>]*><span class="entity-icon entity-icon-default custom-entity"/, "default page entity should render default icon wrapper and custom class");
  assert.match(html, /data-testid="entity-database"[^>]*><span class="entity-icon entity-icon-default"/, "default database entity should render default icon wrapper");
  assert.match(html, /data-testid="entity-row"[^>]*><span class="entity-icon entity-icon-default"/, "default row-page entity should render default icon wrapper");
  assert.match(html, /data-testid="entity-workspace"[^>]*><span class="entity-icon entity-icon-default"/, "default workspace entity should render default icon wrapper");
  assert.match(html, /data-testid="entity-emoji"[^>]*><span class="entity-icon entity-icon-emoji"[^>]*>📌<\/span>/, "emoji entity icons should render emoji text");
  assert.match(html, /data-testid="entity-image"[^>]*><span class="entity-icon entity-icon-image"[^>]*><img src="lotion-file:\/\/\/attachments\/icons\/Page%20Icon\.png"/, "image entity icons should use the lotion-file protocol and encode path segments");
  assert.match(html, /width:20px;height:20px/, "entity image icon should preserve requested dimensions");
}

function testWorkspaceSelector(html) {
  assert.match(html, /class="workspace-selector"/, "workspace selector button should render");
  assert.match(html, /aria-haspopup="menu"/, "workspace selector should advertise its menu");
  assert.match(html, /aria-expanded="false"/, "workspace selector should start closed");
  assert.match(html, /class="workspace-selector-label"[^>]*>Import Notion<\/span>/, "workspace selector should render the current workspace name");
  assert.match(html, /entity-icon-emoji[^>]*>🟩</, "workspace selector should render the current workspace icon");
  assert.match(html, /lucide-chevron-down/, "workspace selector should render a dropdown affordance");
  assert.doesNotMatch(html, /workspace-selector-menu/, "workspace menu should not render before interaction");
  assert.doesNotMatch(html, /Open workspace/, "workspace actions should stay hidden while the selector is closed");
}

function testCoverArea(html) {
  assert.match(html, /class="page-cover"/, "cover area should render the cover wrapper");
  assert.match(html, /src="lotion-file:\/\/\/attachments\/covers\/Daily%20Review\.png"/, "cover image should use the Lotion file protocol");
  assert.match(html, /style="object-position:50% 35%"/, "cover image should preserve the saved focal point");
  assert.match(html, /draggable="false"/, "cover images should not be browser-draggable");
  assert.match(html, />更换封面<\/button>/, "cover area should expose the change-cover action");
  assert.match(html, />重新定位<\/button>/, "cover area should expose the reposition action");
  assert.match(html, />移除<\/button>/, "cover area should expose the remove-cover action");
  assert.doesNotMatch(html, /page-cover-reposition-actions/, "cover area should not show reposition controls before interaction");
}

function testDesignSystemLab(html) {
  assert.match(html, /data-testid="design-system-lab"/, "design system lab should expose a stable test id");
  assert.match(html, /Lotion workbench system/, "design system heading should render");
  assert.match(html, /A restrained local workbench style/, "design system purpose copy should render");
  assert.match(html, /Tokens/, "token section should render");
  assert.match(html, /Controls/, "controls section should render");
  assert.match(html, /Patterns/, "patterns section should render");
  assert.equal(count(html, 'class="design-token-card"'), 6, "core surface token swatches should render");
  assert.match(html, /class="lotion-ui-button primary"/, "primary button primitive should render");
  assert.match(html, /class="lotion-ui-button ghost"/, "ghost button primitive should render");
  assert.equal(count(html, 'class="lotion-ui-icon-button"'), 2, "icon button primitives should render");
  assert.match(html, /class="lotion-ui-input-shell"/, "input shell primitive should render");
  assert.match(html, /class="lotion-ui-select"/, "select primitive should render");
  assert.match(html, /class="lotion-ui-toggle"/, "toggle primitive should render");
  assert.match(html, /class="lotion-ui-segmented"/, "segmented control primitive should render");
  assert.equal(count(html, 'class="lotion-ui-result-item"'), 2, "result item pattern should render");
  assert.match(html, /class="lotion-ui-settings-row"/, "settings row pattern should render");
  assert.match(html, /class="lotion-ui-source-card"/, "source card pattern should render");
  assert.match(html, /class="lotion-ui-status-pill success"/, "success status pill should render");
  assert.match(html, /class="lotion-ui-status-pill warning"/, "warning status pill should render");
  assert.match(html, /class="lotion-ui-status-pill neutral"/, "neutral status pill should render");
}

function testDatabaseProperties(html) {
  assert.match(html, /class="row-properties page-properties database-properties"/, "database properties should render");
  assert.match(html, /Tags/, "database tags label should render");
  assert.match(html, /class="page-property-input"[^>]*value="finance, import"/, "database tag input should preserve comma-separated tags");
  assert.match(html, /placeholder="Empty"/, "database tag input should expose an empty placeholder");
}

function testManagementDatabasesView(html) {
  assert.match(html, /class="management-view"/, "database management view shell should render");
  assert.match(html, /<h1>Manage databases<\/h1>/, "database management heading should render");
  assert.match(html, /class="management-subtitle"[^>]*>2<\/div>/, "database management count should render");
  assert.match(html, /Cached stats\. Refresh manually when you need current counts\./, "cached-stats hint should render");
  assert.match(html, />Refresh stats<\/button>/, "manual stats refresh action should render");
  assert.match(html, /aria-label="Database stats"/, "database stats summary should be labelled");
  assert.match(html, />Databases<\/div>/, "database count metric label should render");
  assert.match(html, />Pages<\/div>/, "page count metric label should render");
  assert.match(html, />Non-empty pages<\/div>/, "non-empty page metric label should render");
  assert.match(html, />Opens<\/div>/, "open count metric label should render");
  assert.match(html, /<span>Name<\/span>/, "database name sort header should render");
  assert.match(html, /<span>Fields<\/span>/, "field-count sort header should render");
  assert.match(html, /<span>Last opened<\/span>/, "last-opened sort header should render");
  assert.match(html, /<th class="manage-table-id">ID<\/th>/, "database id header should render");
  assert.match(html, /Content Projects/, "first database title should render");
  assert.match(html, /Workspace \/ Archive \/ Content Projects/, "nested database path should render");
  assert.match(html, /Daily Habits/, "second database title should render");
  assert.match(html, /Workspace \/ Daily Habits/, "database path should render");
  assert.match(html, /entity-icon-emoji[^>]*>🗂️</, "database icon should render");
  assert.match(html, /June 12, 2026 11:00 AM/, "last opened activity should use the global default format");
  assert.match(html, />Never<\/td>/, "never-opened fallback should render");
  assert.match(html, /<td class="manage-table-number">2<\/td>/, "database activity open count should render");
  assert.match(html, /<td class="manage-table-number">0<\/td>/, "database rows without activity should render zero opens");
  assert.match(html, /<td class="manage-table-number">\.\.\.<\/td>/, "loading stats placeholders should render before cached stats resolve");
  assert.match(html, /<td class="manage-table-id">db_daily<\/td>/, "database ids should render in the management id column");
}

function testManagementPagesView(html) {
  assert.match(html, /class="management-view"/, "management view shell should render");
  assert.match(html, /<h1>All pages<\/h1>/, "all pages heading should render");
  assert.match(html, /class="management-subtitle"[^>]*>2<\/div>/, "all pages count should render");
  assert.match(html, /<th>Title<\/th><th>Updated<\/th>/, "pages table headers should render");
  assert.match(html, /Weekly Review/, "page title should render");
  assert.match(html, /Project Plan/, "second page title should render");
  assert.match(html, /June 12, 2026 9:30 AM/, "page updated timestamp should use the global default format");
  assert.match(html, /entity-icon-emoji[^>]*>📘</, "page icon should render");
  assert.doesNotMatch(html, /pg_weekly/, "known page rows should not fall back to raw ids");
}

function testManagementRecentView(html) {
  assert.match(html, /<h1>Recent<\/h1>/, "recent heading should render");
  assert.match(html, /class="management-subtitle"[^>]*>3<\/div>/, "recent count should render");
  assert.match(html, /<th>Item<\/th><th>Kind<\/th><th>Visited<\/th>/, "recent table headers should render");
  assert.match(html, /Weekly Review/, "recent page title should render");
  assert.match(html, />页面<\/td>/, "recent page kind should render");
  assert.match(html, /Daily Habits/, "recent database title should render");
  assert.match(html, />数据库<\/td>/, "recent database kind should render");
  assert.match(html, /2026\/06\/23 Review/, "recent row page title should come from the database bundle");
  assert.match(html, />行的页面<\/td>/, "recent row-page kind should render");
  assert.match(html, /entity-icon-emoji[^>]*>🚜</, "recent row-page icon should render");
  assert.match(html, /June 12, 2026 12:15 PM/, "recent timestamp should use the global default format");
  assert.doesNotMatch(html, /row_daily/, "known row-page recents should not expose raw row ids");
}

function testManagementFavoritesView(html) {
  assert.match(html, /class="management-view"/, "favorites management shell should render");
  assert.match(html, /<h1>Favorites<\/h1>/, "favorites heading should render");
  assert.match(html, /class="management-subtitle"[^>]*>2<\/div>/, "favorites count should render");
  assert.match(html, /data-testid="favorites-management-view"/, "favorites table should expose a stable test id");
  assert.match(html, /<th>Item<\/th><th>Kind<\/th><th>Context<\/th>/, "favorites table headers should render");
  assert.match(html, /Project Plan/, "favorite page title should render");
  assert.match(html, /2026\/06\/23 Review/, "favorite row-page title should resolve from cache");
  assert.match(html, />Page<\/td>/, "favorite page kind should render");
  assert.match(html, />Database row<\/td>/, "favorite row-page kind should render");
  assert.match(html, /Workspace \/ Project Plan/, "favorite page path context should render");
  assert.match(html, /Workspace \/ Daily Habits/, "favorite row-page database path should render");
  assert.match(html, /entity-icon-emoji[^>]*>🧭</, "favorite page icon should render");
  assert.match(html, /entity-icon-emoji[^>]*>🚜</, "favorite row-page icon should render");
  assert.doesNotMatch(html, /row_daily/, "known favorite row pages should not expose raw row ids");
}

function testManagementTagView(html) {
  assert.match(html, /class="management-view"/, "tag management view shell should render");
  assert.match(html, /<h1>Tag Focus<\/h1>/, "tag management heading should render");
  assert.match(html, /class="management-subtitle"[^>]*>2<\/div>/, "tag management count should render");
  assert.match(html, /data-testid="tag-management-view"/, "tag management view test id should render");
  assert.match(html, /aria-label="Tag summary"/, "tag summary region should be labelled");
  assert.match(html, />#Focus<\/div>/, "tag summary should show the selected tag");
  assert.match(html, /Weekly Review/, "tagged page should render");
  assert.match(html, /Content Projects/, "tagged database should render");
  assert.match(html, />Page<\/td>/, "tagged page type should render");
  assert.match(html, />Database<\/td>/, "tagged database type should render");
  assert.match(html, /Workspace \/ Archive \/ Content Projects/, "tagged database path should render");
  assert.doesNotMatch(html, /Project Plan/, "untagged page should be omitted");
  assert.doesNotMatch(html, /Daily Habits/, "untagged database should be omitted");
}

function testMenuPrimitives(html) {
  assert.match(html, /role="menuitem"/, "menu item should expose menu semantics");
  assert.match(html, /View settings/, "menu item label should render");
  assert.match(html, /Only affects this view/, "menu item description should render");
  assert.match(html, /System database structure is managed by Lotion/, "disabled reason should render");
  assert.match(html, /disabled=""/, "disabled menu item should be inert");
}

function testManagementPluginsView(html) {
  assert.match(html, /class="management-view"/, "plugin management view shell should render");
  assert.match(html, /<h1>Plugins<\/h1>/, "plugin management heading should render");
  assert.match(html, /class="management-subtitle"[^>]*>\d+<\/div>/, "plugin management count should render");
  assert.match(html, /class="plugin-manager"/, "plugin manager body should render");
  assert.match(html, />Plugins<\/div>/, "plugin summary should include plugin count label");
  assert.match(html, />Field providers<\/div>/, "plugin summary should include field-provider count label");
  assert.match(html, />View providers<\/div>/, "plugin summary should include view-provider count label");
  assert.match(html, />Extension points<\/div>/, "plugin summary should include extension-point count label");
  assert.match(html, /Loaded plugins/, "loaded plugins section should render");
  assert.match(html, /Renderer Test Plugin/, "fake plugin name should render");
  assert.match(html, /renderer-test-plugin/, "fake plugin id should render");
  assert.match(html, /0\.1\.0/, "fake plugin version should render");
  assert.match(html, /workspace\.read/, "plugin permissions should render");
  assert.match(html, /workspace\.write/, "multiple plugin permissions should render");
  assert.match(html, /class="plugin-status-pill"[^>]*>active<\/span>/, "plugin status should render");
  assert.match(html, /Renderer text/, "field provider label should render");
  assert.match(html, /plugin-renderer-test\.text/, "field provider type should render");
  assert.match(html, /Renderer board/, "view provider label should render");
  assert.match(html, /plugin-renderer-test\.board/, "view provider type should render");
  assert.match(html, /Renderer Test Plugin \(renderer-test-plugin\)/, "provider source should link back to plugin");
  assert.match(html, /Registered extension points/, "extension point section should render");
  assert.match(html, />Command<\/td>/, "command extension point should render");
  assert.match(html, />Sidebar<\/td>/, "sidebar extension point should render");
  assert.match(html, />Page action<\/td>/, "page action extension point should render");
  assert.match(html, />Settings tab<\/td>/, "settings tab extension point should render");
  assert.match(html, /Renderer command/, "command title should render");
  assert.match(html, /Renderer sidebar/, "sidebar title should render");
  assert.match(html, /Renderer page action/, "page action title should render");
  assert.match(html, /Renderer settings/, "settings tab title should render");
}

function testManagementPluginDetailOverview(html) {
  assert.match(html, /class="plugin-detail-page"/, "plugin detail page shell should render");
  assert.match(html, /Renderer Test Plugin/, "plugin detail heading should render");
  assert.match(html, /role="tab"[^>]+aria-selected="true"[^>]*>\s*Overview\s*<\/button>/, "overview tab should be selected by default");
  assert.match(html, /role="tab"[^>]+aria-selected="false"[^>]*>\s*Settings\s*<\/button>/, "settings tab should be available but inactive");
  assert.match(html, /data-testid="plugin-workflow-overview"/, "workflow overview should render");
  assert.match(html, /Primary actions and read-only status stay here/, "workflow separation copy should render");
  assert.match(html, />Commands<\/div>/, "workflow command count should render");
  assert.match(html, />Sidebar entries<\/div>/, "workflow sidebar count should render");
  assert.match(html, />Page actions<\/div>/, "workflow page action count should render");
  assert.match(html, />Settings tabs<\/div>/, "workflow settings count should render");
  assert.match(html, /Renderer command/, "overview keeps extension point table visible");
  assert.doesNotMatch(html, /class="plugin-detail-settings-panel"/, "overview should not render settings panel");
  assert.doesNotMatch(html, /class="plugin-settings-tab-host"/, "overview should not mount plugin settings hosts");
}

function testManagementPluginDetailSettings(html) {
  assert.match(html, /class="plugin-detail-page"/, "plugin settings detail shell should render");
  assert.match(html, /Renderer Test Plugin/, "plugin settings detail heading should render");
  assert.match(html, /role="tab"[^>]+aria-selected="false"[^>]*>\s*Overview\s*<\/button>/, "overview tab should be inactive on settings panel");
  assert.match(html, /role="tab"[^>]+aria-selected="true"[^>]*>\s*Settings\s*<\/button>/, "settings tab should be selected");
  assert.match(html, /class="management-section plugin-detail-settings-panel"/, "settings panel should render");
  assert.match(html, /Configuration is separated from the plugin workflow/, "settings separation helper copy should render");
  assert.match(html, /class="plugin-settings-tab-host"/, "settings panel should mount plugin settings hosts");
  assert.doesNotMatch(html, /data-testid="plugin-workflow-overview"/, "settings panel should not render workflow overview");
}

function testManagementSettingsCenter(html) {
  assert.match(html, /data-testid="settings-center"/, "settings center should expose a stable root");
  assert.match(html, /<h1>Settings<\/h1>/, "settings management title should render");
  assert.match(html, /aria-label="Settings sections"/, "settings category nav should be labelled");
  assert.match(html, /aria-label="Search settings"/, "settings search input should be labelled");
  assert.match(html, /role="tab"[^>]*aria-selected="true"[^>]*>[\s\S]*Search &amp; AI/, "deep-linked Search & AI section should be selected");
  for (const title of ["General", "Appearance", "Search &amp; AI", "Shortcuts", "Plugins", "Git Sync / Backup", "Import", "Advanced / Developer"]) {
    assert.match(html, new RegExp(title), `${title} settings section should render`);
  }
  assert.match(html, /Advanced Search/, "Advanced Search settings plugin should render in Search & AI");
  assert.match(html, /LLM Providers/, "LLM settings plugin should render in Search & AI");
  assert.match(html, /class="settings-row"/, "settings rows should use the shared settings row primitive");
  assert.match(html, /class="settings-plugin-tabs"/, "plugin-owned settings tabs should mount inside the settings center");
  assert.equal(count(html, 'class="plugin-settings-tab-host"'), 2, "Search & AI should mount one host per plugin-owned settings tab");
  assert.doesNotMatch(html, /No plugin settings are registered for this section/, "Search & AI should have registered plugin settings");
}

function testManagementGeneralSettingsCenter(html) {
  assert.match(html, /<h2>General<\/h2>/, "general settings deep link should render");
  assert.match(html, /aria-label="Default date format"/, "global date format menu should be labelled");
  assert.match(html, /value="month_day_year" selected=""/, "global date format should default to month-day-year");
  assert.match(html, /aria-label="Default time format"/, "global time format menu should be labelled");
  assert.match(html, /value="h12" selected=""/, "global time format should default to 12-hour time");
  for (const value of ["full", "month_day_year", "day_month_year", "year_month_day", "iso", "none", "h12", "h24"]) {
    assert.match(html, new RegExp(`value="${value}"`), `${value} should be available as a global date/time option`);
  }
}

function testNotionAuditPanelInitial(html) {
  assert.match(html, /class="notion-audit-panel"/, "audit panel shell should render");
  assert.match(html, /<h2>Audit imported workspace<\/h2>/, "audit panel heading should render");
  assert.match(html, /Compare the current Lotion workspace against a source Notion export\./, "audit helper copy should render");
  assert.match(html, /class="primary"[^>]+disabled=""[^>]*>Run audit<\/button>/, "audit action should start disabled without a source path");
  assert.match(html, /class="secondary"[^>]*>Choose source…<\/button>/, "source chooser should render");
  assert.match(html, /placeholder="Paste a Notion export folder path, or choose one"/, "source path input should render");
  assert.match(html, /<span>CSV filters<\/span>/, "CSV filter label should render");
  assert.match(html, /placeholder="Blank = audit every source CSV"/, "CSV filter textarea should render");
  assert.match(html, /<span>HTML filters<\/span>/, "HTML filter label should render");
  assert.match(html, /placeholder="Blank = skip HTML body audit"/, "HTML filter textarea should render");
  assert.match(html, /Audit every HTML body/, "HTML body audit option should render");
  assert.match(html, /Expect blank source rows to be imported/, "blank-row expectation option should render");
  assert.equal(count(html, 'type="checkbox"'), 2, "audit panel should render the two option checkboxes");
  assert.doesNotMatch(html, /notion-audit-result/, "initial panel should not render stale audit results");
  assert.doesNotMatch(html, /notion-error/, "initial panel should not render stale errors");
}

function testNotionAuditRunContract(contract) {
  assert.deepEqual(contract.calls, ["first", "failure", "retry"]);
  assert.equal(contract.runningDuringFirst, true);
  assert.equal(contract.competing.status, "ignored");
  assert.equal(contract.completed.status, "success");
  assert.equal(contract.completed.result.summary.issues, 0);
  assert.equal(contract.runningAfterFirst, false);
  assert.deepEqual(contract.failed, { status: "error", error: "audit unavailable" });
  assert.equal(contract.retry.status, "success");
  assert.equal(contract.retry.result.summary.issues, 0);
  assert.equal(contract.runningAfterRetry, false);
}

function testNotionAuditResult(html) {
  assert.match(html, /class="notion-audit-result"/, "audit result shell should render");
  assert.match(html, /Source roots/, "audit summary should include source roots");
  assert.match(html, /\/notion\/Export-A/, "audit summary should render source root paths");
  assert.match(html, /Workspace root/, "audit summary should include workspace root");
  assert.match(html, /\/workspaces\/Import Notion/, "audit summary should render workspace root path");
  assert.match(html, /Source CSVs<\/th><td>3 \/ 5<\/td>/, "CSV audit count should render");
  assert.match(html, /Source HTMLs<\/th><td>2 \/ 8<\/td>/, "HTML audit count should render");
  assert.match(html, /Workspace<\/th><td>11 DBs, 42 rows<\/td>/, "workspace DB and row counts should render");
  assert.match(html, /2 databases, 7 row\/pages/, "imported mapping counts should render");
  assert.match(html, /Issues<\/th><td>1<\/td>/, "issue count should render");
  assert.match(html, /Warnings<\/th><td>2<\/td>/, "warning count should render");
  assert.match(html, /class="notion-audit-fail"/, "blocking issue state should render as fail");
  assert.match(html, /Audit found blocking import issues\./, "blocking issue copy should render");
  assert.match(html, /Issue types/, "issue kind summary should render");
  assert.match(html, /missing-row/, "issue kind key should render");
  assert.match(html, /Warning types/, "warning kind summary should render");
  assert.match(html, /truncated-preview/, "warning kind key should render");
  assert.match(html, /Issues \(1\)/, "issues details summary should render");
  assert.match(html, /Missing row body/, "issue message should render");
  assert.match(html, /Warnings \(2\)/, "warnings details summary should render");
  assert.match(html, /Preview was truncated/, "warning message should render");
  assert.match(html, /Showing first 1 items/, "truncated warning helper should render");
  assert.equal(count(html, '<button type="button">Open</button>'), 5, "each non-empty audit path should expose an Open button");
}

function testNotionAuditPassingResult(html) {
  assert.match(html, /class="notion-audit-result"/, "passing audit result shell should render");
  assert.match(html, /\/notion\/Clean Export/, "passing audit should render the source root path");
  assert.match(html, /\/workspaces\/Clean Import/, "passing audit should render the workspace root path");
  assert.match(html, /Source CSVs<\/th><td>4 \/ 4<\/td>/, "passing audit should render full CSV audit coverage");
  assert.match(html, /Source HTMLs<\/th><td>3 \/ 3<\/td>/, "passing audit should render full HTML audit coverage");
  assert.match(html, /Workspace<\/th><td>5 DBs, 120 rows<\/td>/, "passing audit should render workspace totals");
  assert.match(html, /5 databases, 120 row\/pages/, "passing audit should render imported mapping counts");
  assert.match(html, /Issues<\/th><td>0<\/td>/, "passing audit should render zero issues");
  assert.match(html, /Warnings<\/th><td>0<\/td>/, "passing audit should render zero warnings");
  assert.match(html, /class="notion-audit-ok"/, "passing audit should render OK state");
  assert.match(html, /No blocking audit issues found\./, "passing audit should render OK copy");
  assert.equal(count(html, '<button type="button">Open</button>'), 2, "source and workspace paths should remain openable");
  assert.doesNotMatch(html, /Issue types/, "passing audit should not render stale issue kind summary");
  assert.doesNotMatch(html, /Warning types/, "passing audit should not render stale warning kind summary");
  assert.doesNotMatch(html, /Issues \(/, "passing audit should not render issue details");
  assert.doesNotMatch(html, /Warnings \(/, "passing audit should not render warning details");
  assert.doesNotMatch(html, /Showing first/, "passing audit should not render truncated helper copy");
}

function testNotionImportPanelPick(html) {
  assert.match(html, /class="notion-import-panel embedded"/, "embedded import panel should render plugin-page shell");
  assert.doesNotMatch(html, /dialog-backdrop/, "embedded import panel should not render modal backdrop");
  assert.match(html, /<h2>Import from Notion<\/h2>/, "import panel heading should render");
  assert.match(html, /<legend>Import settings<\/legend>/, "import settings group should render");
  assert.equal(count(html, 'type="checkbox"'), 3, "import panel should render the default option checkboxes");
  assert.equal(count(html, 'checked=""'), 3, "all import options should be enabled by default");
  assert.match(html, /Do not import blank rows and pages/, "blank-skip option should render");
  assert.match(html, /Blank definition\./, "blank definition explanation should render");
  assert.match(html, /system fields, row id, row icon, page file/i, "blank definition should explain ignored system fields");
  assert.match(html, /Auto-dedupe duplicate Notion pages/, "dedupe option should render");
  assert.match(html, /Preserve original Notion export for audit/, "original export option should render");
  assert.match(html, /Choose folder…<\/button>/, "choose-folder action should render");
}

function testNotionImportDialogPick(html) {
  assert.match(html, /class="dialog-backdrop plugin-modal-backdrop"/, "import dialog should render the shared modal backdrop");
  assert.match(html, /class="plugin-modal notion-dialog"[^>]*role="dialog"[^>]*aria-modal="true"/, "import dialog should render an accessible opaque modal shell");
  assert.match(html, /id="notion-import-dialog-title">Import from Notion<\/h2>/, "import dialog should render its own visible title");
  assert.match(html, /class="plugin-modal-close"[^>]*aria-label="Close import dialog"/, "import dialog should render a close action");
  assert.match(html, /class="plugin-modal-body"/, "import dialog should render an owned scrolling body");
  assert.doesNotMatch(html, /class="dialog notion-dialog"/, "import dialog should not depend on the removed generic dialog surface");
  assert.match(html, /class="notion-import-panel"/, "import dialog should render the import panel");
  assert.doesNotMatch(html, /class="notion-import-panel embedded"/, "modal import panel should not use embedded plugin-page styling");
  assert.doesNotMatch(html, /<h2>Import from Notion<\/h2>/, "modal import panel should not duplicate the modal shell heading");
  assert.match(html, /<legend>Import settings<\/legend>/, "modal import settings should render");
  assert.match(html, /Do not import blank rows and pages/, "modal blank-skip option should render");
  assert.match(html, /Choose folder…<\/button>/, "modal choose-folder action should render");
}

function testNotionImportSettingsWithReport(html) {
  assert.match(html, /class="plugin-import-report-link"/, "Notion import settings should render the report entry");
  assert.match(html, /<h2>Latest import report<\/h2>/, "latest report heading should render");
  assert.match(html, /Import report 2026-06-12/, "latest report title should render");
  assert.match(html, /class="secondary"[^>]*>Open report<\/button>/, "open report action should render");
  assert.doesNotMatch(html, /<button[^>]*disabled=""[^>]*>\s*Open report<\/button>/, "open report action should be enabled when a report exists");
  assert.match(html, /class="notion-audit-panel"/, "settings page should include the audit panel");
  assert.match(html, /class="notion-import-panel embedded"/, "settings page should include the embedded import panel");
  assert.match(html, /Do not import blank rows and pages/, "embedded import options should remain visible in settings");
}

function testListBody(html) {
  assert.match(html, /class="list-view-body"/, "list view body should render");
  assert.equal(count(html, 'class="list-view-row"'), 2, "list view should render one row button per record");
  assert.match(html, /Alpha task/, "list view should render record titles");
  assert.match(html, /Untitled/, "list view should fall back to Untitled for blank titles");
  assert.match(html, />🧾</, "list view should render row icons");
  assert.match(html, /Status/, "visible select property label should render");
  assert.match(html, /Doing/, "visible select property value should render");
  assert.match(html, /Due/, "visible date property label should render");
  assert.match(html, /June 12, 2026/, "date properties should use display formatting");
  assert.match(html, /Done/, "visible checkbox property label should render");
  assert.match(html, /Checked/, "boolean properties should use checked text");
  assert.doesNotMatch(html, /Hidden Notes/, "hidden list properties should not render");
  assert.doesNotMatch(html, /Name<\/span><span class="list-view-property-value"/, "title should not duplicate as a property");
  assert.equal(count(html, 'class="row-context-handle" role="button" tabindex="0"'), 2, "list row action handles should be keyboard focusable");
  assert.match(html, /aria-label="Row actions Alpha task"/, "list row action handles should name their row");
}

function testGalleryBody(html) {
  assert.match(html, /class="gallery-body"/, "gallery body should render");
  assert.equal(count(html, 'class="gallery-card"'), 2, "gallery should render one card per record");
  assert.match(html, /Alpha task/, "gallery should render card titles");
  assert.match(html, /Untitled/, "gallery should fall back to Untitled for blank titles");
  assert.match(html, />🖼️</, "gallery should render row icons");
  assert.match(html, /src="attachment:\/\/covers\/alpha\.png"/, "gallery should render configured cover images");
  assert.match(html, /object-position:50% 30%/, "gallery should preserve cover offsets");
  assert.match(html, /gallery-card-cover-placeholder/, "gallery should render placeholders for missing covers");
  assert.match(html, /Status/, "gallery caption labels should render");
  assert.match(html, /Doing/, "gallery caption values should render");
  assert.match(html, /Due/, "gallery second caption label should render");
  assert.match(html, /June 12, 2026/, "gallery date captions should use display formatting");
  assert.equal(count(html, 'class="row-context-handle" role="button" tabindex="0"'), 2, "gallery action handles should be keyboard focusable");
}

function testGalleryBodyEmpty(html) {
  assert.match(html, /gallery-body-empty/, "gallery empty wrapper should render");
  assert.match(html, /No rows/, "gallery empty state should render");
  assert.doesNotMatch(html, /gallery-card"/, "gallery empty state should not render cards");
}

function testCalendarBody(html) {
  assert.match(html, /class="calendar-body"/, "calendar body should render");
  assert.match(html, /class="calendar-toolbar"/, "calendar toolbar should render");
  assert.match(html, /class="calendar-nav"[^>]*>‹<\/button>/, "previous-month control should render");
  assert.match(html, /class="calendar-nav"[^>]*>›<\/button>/, "next-month control should render");
  assert.match(html, /class="calendar-today"[^>]*>今天<\/button>/, "today control should render");
  assert.equal(count(html, 'class="calendar-weekday"'), 7, "calendar should render weekday headings");
  assert.match(html, /Calendar task/, "calendar should render rows in the current month");
  assert.match(html, />📅</, "calendar row chips should render row icons");
  assert.match(html, /class="row-context-handle" role="button" tabindex="0" aria-label="Row actions Calendar task"/, "calendar row action handles should be keyboard focusable");
  assert.doesNotMatch(html, /Outside month task/, "calendar should omit rows outside the current month");
}

function testDatabaseTemplatePicker(html) {
  assert.match(html, /class="dialog-backdrop"/, "database template picker backdrop should render");
  assert.match(html, /class="db-template-dialog"/, "database template dialog should render");
  assert.match(html, /<h2>新建数据库<\/h2>/, "database template heading should render");
  assert.match(html, /从模板开始，或选择「空白」/, "template helper copy should render");
  assert.match(html, />关闭<\/button>/, "template picker close action should render");
  assert.equal(count(html, 'class="db-template-card"'), 4, "all built-in database templates should render");
  assert.match(html, /class="db-template-emoji"[^>]*>✱</, "empty template emoji should render");
  assert.match(html, /class="db-template-name"[^>]*>Empty</, "empty template should render");
  assert.match(html, /Plain title \+ timestamps/, "empty template description should render");
  assert.match(html, /class="db-template-name"[^>]*>Tasks</, "tasks template should render");
  assert.match(html, /Status \+ priority \+ due date/, "tasks template description should render");
  assert.match(html, /class="db-template-name"[^>]*>Reading list</, "reading template should render");
  assert.match(html, /Title \+ author \+ status \+ rating/, "reading template description should render");
  assert.match(html, /class="db-template-name"[^>]*>Journal</, "journal template should render");
  assert.match(html, /Date-keyed entries with tags/, "journal template description should render");
}

function testOptionPills(html) {
  assert.equal(count(html, 'class="option-pill"'), 2, "normal option pills should render");
  assert.equal(count(html, 'class="option-pill muted"'), 1, "muted option pill should render");
  assert.match(html, />Done</, "green option label should render");
  assert.match(html, /background-color:#e9f6eb/, "green option background token should render");
  assert.match(html, /border-color:#a9d4b0/, "green option border token should render");
  assert.match(html, /color:#28623a/, "green option text token should render");
  assert.match(html, />Muted task</, "muted option label should render");
  assert.match(html, />Fallback</, "fallback option label should render");
  assert.match(html, /background-color:#ece7dd/, "unknown colors should fall back to gray");
}

function testDatabaseTableGridEmbedded(html) {
  assert.match(html, /class="table-sticky-header"/, "embedded grid should render a sticky header");
  assert.match(html, /class="table-scroll"/, "table scroll container should render");
  assert.match(html, /min-width:720px/, "table min width should be applied");
  assert.match(html, /margin-left:-24px/, "embedded sticky header should track horizontal scroll");
  assert.equal(count(html, 'class="virtual-spacer"'), 2, "top and bottom virtual spacers should render");
  assert.match(html, /height:32px/, "top spacer height should render");
  assert.match(html, /height:48px/, "bottom spacer height should render");
  assert.match(html, /data-row-id="row_alpha"/, "visible rows should expose row ids");
  assert.match(html, /data-formula-row="9"[^>]*>9<\/td>/, "row numbers should use stable CSV source positions instead of view indexes");
  assert.match(html, /Cell:Alpha task\/Name/, "renderCell output should render for title field");
  assert.match(html, /Cell:Doing\/Status/, "renderCell output should render for status field");
  assert.match(html, /class="row-actions"/, "row action cell should render when provided");
  assert.match(html, /Action:row_alpha/, "row actions should receive the record");
  assert.match(html, /class="add-row"/, "add-row affordance should render at the end");
  assert.match(html, />\+ New<\/td>/, "add-row label should render");
}

function testDatabaseTableGridStandalone(html) {
  assert.doesNotMatch(html, /class="table-sticky-header"/, "standalone grid should not render an embedded sticky header");
  assert.match(html, /<thead><tr><th>Name<\/th><th>Status<\/th><\/tr><\/thead>/, "standalone grid should render table head inside the scroll table");
  assert.match(html, /data-row-id="row_alpha"/, "standalone grid should render rows");
  assert.match(html, /class="add-row disabled"/, "blocked standalone row creation should render a disabled add-row affordance");
  assert.match(html, /aria-disabled="true"/, "blocked standalone row creation should expose its disabled state");
}

function testDatabaseTableGridHiddenRows(html) {
  assert.match(html, /class="table-sticky-header"/, "embedded hidden-row grid should still render sticky header");
  assert.match(html, /data-row-id="row_alpha"/, "hidden-row grid should still render visible rows");
  assert.doesNotMatch(html, /class="add-row"/, "hidden embedded rows should suppress add-row affordance");
}

function count(value, needle) {
  return value.split(needle).length - 1;
}

function assertInOrder(value, needles, message) {
  let previous = -1;
  for (const needle of needles) {
    const index = value.indexOf(needle);
    assert.notEqual(index, -1, `${message}: missing ${needle}`);
    assert.equal(index > previous, true, `${message}: ${needle} should appear after the previous marker`);
    previous = index;
  }
}

function testGitHubBackupPanelInitial(html) {
  assert.match(html, /data-testid="github-backup-panel"/, "GitHub backup panel should expose a stable test root");
  assert.match(html, /class="github-backup-panel"/, "GitHub backup panel wrapper should render");
  assert.match(html, /Workspace backup/, "GitHub backup panel kicker should render");
  assert.match(html, /GitHub-backed page history/, "GitHub backup title should render");
  assert.match(html, /Back up Lotion content to a configured GitHub target/, "GitHub backup description should render");
  assert.match(html, /class="github-backup-status backed_up"[^>]*>Backed up</, "GitHub backup status pill should render backed-up state");
  assert.match(html, />Adapter</, "adapter label should render");
  assert.match(html, /aria-label="GitHub backup adapter"/, "adapter select should be accessible");
  assert.match(html, /<option value="local_mock"[^>]*>Local mock GitHub<\/option>/, "local mock adapter option should render");
  assert.match(html, /<option value="github_api">GitHub API<\/option>/, "GitHub API adapter option should render");
  assert.match(html, /aria-label="GitHub repository"[^>]+value="owner\/repo"/, "repository input should render current value");
  assert.match(html, /aria-label="GitHub branch"[^>]+value="main"/, "branch input should render current value");
  assert.match(html, /aria-label="GitHub backup path"[^>]+value="lotion-integration-tests\/renderer"/, "backup path input should render current value");
  assert.match(html, /aria-label="GitHub token"[^>]+type="password"/, "token input should render as a password field");
  assert.match(html, />Save settings<\/button>/, "save settings action should render");
  assert.match(html, />Run backup<\/button>/, "manual backup action should render");
  assert.match(html, /Backed up 3 changed files\./, "status message should render");
  assert.match(html, /<dt>Last backup<\/dt>/, "last backup metric should render");
  assert.match(html, /<dt>Commit<\/dt>\s*<dd>abc1234<\/dd>/, "last commit metric should render");
  assert.match(html, /<dt>Files<\/dt>\s*<dd>12<\/dd>/, "file count metric should render");
  assert.match(html, /Local mock mode stores a deterministic fake GitHub remote/, "local mock safety note should render");
  assert.match(html, /<h4>Page history<\/h4>/, "page history heading should render");
  assert.match(html, /Weekly Review/, "active page title should render in page history");
  assert.match(html, /aria-label="GitHub page history"/, "page history list should be accessible");
  assert.match(html, /class="github-backup-version selected"/, "selected history version should render");
  assert.match(html, /Lotion backup 2026-06-12/, "history version message should render");
  assert.match(html, />Refresh<\/button>/, "history refresh action should render");
  assert.match(html, /aria-label="GitHub backup diff preview"/, "diff preview should be labelled");
  assert.match(html, /<h4>Preview restore<\/h4>/, "restore preview heading should render");
  assert.match(html, /Page snapshot · Weekly Review/, "restore preview should render logical page identity");
  assert.doesNotMatch(html, /lotion-backups\/pages\/weekly-review\.md/, "restore preview should not expose its internal storage path");
  assert.match(html, />Restore this version<\/button>/, "restore action should render");
  assert.match(html, /class="github-backup-diff-line removed"/, "removed diff lines should render");
  assert.match(html, /class="github-backup-diff-line added"/, "added diff lines should render");
}

function testGitHubBackupPanelFailure(html) {
  assert.match(html, /data-testid="github-backup-panel"/, "failed GitHub backup panel should expose a stable test root");
  assert.match(html, /class="github-backup-status failed"[^>]*>Failed</, "failed status pill should render");
  assert.match(html, /GitHub token is required\./, "typed failure message should render");
  assert.match(html, /<option value="github_api" selected="">GitHub API<\/option>/, "GitHub API adapter should render as selected");
  assert.match(html, /aria-label="GitHub repository"[^>]+placeholder="owner\/repo"/, "empty repository input should keep the owner/repo hint");
  assert.match(html, /aria-label="GitHub token"[^>]+placeholder="Required for GitHub API"/, "GitHub API token hint should render");
  assert.match(html, /<dt>Last backup<\/dt>\s*<dd>None<\/dd>/, "missing last backup should render as None");
  assert.match(html, /<dt>Commit<\/dt>\s*<dd>None<\/dd>/, "missing commit should render as None");
  assert.match(html, /Open a page to inspect its GitHub history\./, "no-active-page helper should render");
  assert.match(html, /aria-label="GitHub page history"/, "empty history list should remain accessible");
  assert.doesNotMatch(html, /Local mock mode stores a deterministic fake GitHub remote/, "GitHub API failure should not show the local mock note");
  assert.doesNotMatch(html, /Preview restore/, "failure state should not render a restore preview without a selected version");
}

function testGitHubBackupPanelHistoryEmpty(html) {
  assert.match(html, /data-testid="github-backup-panel"/, "history-empty GitHub backup panel should expose a stable test root");
  assert.match(html, /class="github-backup-status history_empty"[^>]*>History empty</, "history-empty status pill should render");
  assert.match(html, /This page has no backed-up versions yet\./, "history-empty status message should render");
  assert.match(html, /<h4>Page history<\/h4>/, "page history heading should render");
  assert.match(html, /Weekly Review/, "active page title should render");
  assert.match(html, /History empty for the current page\./, "active-page empty history helper should render");
  assert.match(html, />Refresh<\/button>/, "history empty state should retain refresh action");
  assert.doesNotMatch(html, /class="github-backup-version/, "history empty state should not render stale version buttons");
  assert.doesNotMatch(html, /Preview restore/, "history empty state should not render a restore preview");
}

function testGitSyncPanelConfigured(html) {
  assert.match(html, /class="git-sync-panel"/, "Git Sync panel should render");
  assert.match(html, /<h3>Git Sync<\/h3>/, "Git Sync title should render");
  assert.match(html, /Inspect the workspace Git state and create manual backup commits\./, "Git Sync description should render");
  assert.match(html, /class="git-sync-pill dirty"[^>]*>3 changed</, "dirty status pill should render");
  assert.match(html, />Refresh<\/button>/, "refresh action should render");
  assert.match(html, />Initialize repo<\/button>/, "initialize action should render");
  assert.match(html, />Backup now<\/button>/, "manual backup action should render");
  assert.match(html, />Remote repository URL</, "remote URL field label should render");
  assert.match(html, /value="git@github\.com:owner\/repo\.git"/, "remote URL value should render");
  assert.match(html, />Branch</, "branch field label should render");
  assert.match(html, /value="main"/, "branch value should render");
  assert.match(html, />SSH key path</, "SSH key field label should render");
  assert.match(html, /value="\/Users\/me\/\.ssh\/id_ed25519"/, "SSH key value should render");
  assert.match(html, />Choose<\/button>/, "SSH key picker action should render");
  assert.match(html, />Pause automatic sync</, "automation pause control should render");
  assert.match(html, /type="checkbox"[^>]+checked=""/, "paused automation checkbox should preserve checked state");
  assert.match(html, />Manual actions stay available</, "pause helper copy should render");
  assert.match(html, />Commit message prefix</, "commit prefix label should render");
  assert.match(html, /value="Lotion backup"/, "commit prefix should render");
  assert.match(html, />Auto backup cadence</, "auto backup cadence label should render");
  assert.match(html, /<option value="minutes_15">Every 15 minutes<\/option>/, "15 minute cadence option should render");
  assert.match(html, /<option value="minutes_30" selected="">Every 30 minutes<\/option>/, "selected 30 minute cadence should render");
  assert.match(html, />Auto push cadence</, "auto push cadence label should render");
  assert.match(html, /<option value="after_backup" selected="">After backup<\/option>/, "selected after-backup push cadence should render");
  assert.match(html, />Save settings<\/button>/, "save action should render");
  assert.match(html, />Apply remote config<\/button>/, "remote config action should render");
  assert.match(html, />Test remote<\/button>/, "remote test action should render");
  assert.match(html, />Fetch status<\/button>/, "fetch status action should render");
  assert.match(html, />Pull<\/button>/, "pull action should render");
  assert.match(html, />Push<\/button>/, "push action should render");
  assert.match(html, />Check squash safety<\/button>/, "squash preflight action should render");
  assert.match(html, /class="git-sync-message success"/, "success message should render");
  assert.match(html, /Backup created\./, "message text should render");
  assert.match(html, /Created commit abc1234/, "message output should render");
  assert.match(html, />Git<\/span><strong>Installed<\/strong>/, "Git installed status should render");
  assert.match(html, />Repository<\/span><strong>Initialized<\/strong>/, "repo initialized status should render");
  assert.match(html, />Working tree<\/span><strong>3 changed files<\/strong>/, "dirty working tree status should render");
  assert.match(html, />Ahead \/ behind<\/span><strong>2 \/ 1<\/strong>/, "ahead/behind status should render");
  assert.match(html, />Automation<\/span><strong>Paused<\/strong>/, "automation status should render");
  assert.match(html, />Last commit<\/span><strong>abc1234 Lotion backup<\/strong>/, "last commit status should render");
  assert.match(html, />Last error<\/span><strong>Previous push failed<\/strong>/, "last error status should render");
  assert.match(html, /class="git-sync-output"/, "raw output details should render");
  assert.match(html, /Raw status output/, "raw output summary should render");
  assert.match(html, /M pages\/weekly\.md/, "raw Git output should render");
}

function testGitSyncPanelDefaultSettings(html) {
  assert.match(html, /class="git-sync-panel"/, "Git Sync default panel should render");
  assert.match(html, />Remote repository URL</, "Git Sync should render remote URL before async settings load");
  assert.match(html, /placeholder="git@github\.com:user\/repo\.git"/, "default remote URL placeholder should render");
  assert.match(html, />Branch</, "default branch field label should render");
  assert.match(html, /value="main"/, "default branch should render");
  assert.match(html, />Auto backup cadence</, "default auto-backup cadence should render");
  assert.match(html, /<option value="off" selected="">Off<\/option>/, "default cadence should select Off");
  assert.match(html, />Save settings<\/button>/, "default settings form should keep save action visible");
}

function testGitSyncPanelStatusScenarios(html) {
  assert.match(
    html,
    /data-testid="git-sync-status-behind"[\s\S]*class="git-sync-pill warn"[^>]*>Sync needed</,
    "remote-ahead clean repo should show a warning sync-needed status"
  );
  assert.match(
    html,
    /data-testid="git-sync-status-diverged"[\s\S]*class="git-sync-pill warn"[^>]*>Diverged</,
    "diverged clean repo should show a warning diverged status"
  );
  assert.match(
    html,
    /data-testid="git-sync-status-ahead"[\s\S]*class="git-sync-pill success"[^>]*>Ready to push</,
    "local-ahead clean repo should show a ready-to-push status"
  );
  assert.match(
    html,
    /data-testid="git-sync-status-dirty"[\s\S]*class="git-sync-pill dirty"[^>]*>2 changed</,
    "dirty working tree should continue to prioritize changed-file status"
  );
}

function testLLMChatVisualContract(contract) {
  assert.equal(contract.visualMode, "polished", "LLM Chat should expose the polished visual contract");
  for (const region of [
    "llm-chat-surface",
    "llm-chat-history",
    "llm-chat-toolbar",
    "llm-chat-quick-actions",
    "llm-chat-activity",
    "llm-chat-transcript",
    "llm-chat-composer"
  ]) {
    assert.ok(contract.regions.includes(region), `LLM Chat visual contract should include ${region}`);
  }
  for (const control of [
    "Assistant tool mode",
    "Assistant context",
    "LLM provider",
    "LLM model",
    "New chat",
    "Clear",
    "Send"
  ]) {
    assert.ok(contract.controls.includes(control), `LLM Chat visual contract should include ${control}`);
  }
}

function testAdvancedSearchPanelInitial(html) {
  assert.match(html, /data-testid="advanced-search-panel"/, "advanced search panel should expose a stable test root");
  assert.match(html, /class="advanced-search-panel embedded"/, "embedded advanced search panel should render embedded styling");
  assert.match(html, />Advanced Search</, "advanced search title should render");
  assert.match(html, /Qwen3 via Ollama keeps content on this device/, "advanced search description should render local privacy copy");
  assert.match(html, /class="advanced-search-status not_built"[^>]*>Loading</, "initial status should be visible while plugin state loads");
  assert.match(html, />Provider</, "provider control label should render");
  assert.match(html, /<option value="ollama"[^>]*>Qwen3 local semantic index<\/option>/, "Qwen3 Ollama provider option should render");
  assert.match(html, /<option value="local"[^>]*>Deterministic fallback<\/option>/, "deterministic provider option should render");
  assert.match(html, /<option value="openai-compatible">OpenAI-compatible embeddings<\/option>/, "external provider option should render");
  assert.match(html, />Base URL</, "base URL control should render");
  assert.match(html, />Model</, "model control should render");
  assert.match(html, /value="qwen3-embedding:0\.6b"/, "default Qwen3 Ollama model should render");
  assert.match(html, />API key</, "API key control should render");
  assert.match(html, />Vector store</, "vector store control should render");
  assert.match(html, /<option value="lancedb">LanceDB adapter<\/option>/, "LanceDB vector store option should render");
  assert.match(html, /Cloud embeddings require explicit configuration/, "explicit provider/cost warning should render");
  assert.match(html, />Save settings<\/button>/, "save settings action should render");
  assert.match(html, />Rebuild index<\/button>/, "manual rebuild action should render");
  assert.match(html, /aria-label="Advanced search query"/, "query input should be accessible");
  assert.match(html, /Ask semantically across pages, databases, and row pages/, "query placeholder should communicate scope");
  assert.match(html, /role="status"[\s\S]*Loading index state/, "initial meta status should render");
  assert.match(html, /role="listbox"[^>]+aria-label="Advanced search results"/, "results listbox should render even before searching");
}

function testAdvancedSearchProgressCard(html) {
  assert.match(html, /data-testid="advanced-search-progress"/, "advanced search progress card should expose a stable test root");
  assert.match(html, /data-phase="embedding"/, "progress card should expose current phase");
  assert.match(html, /data-current="32"/, "progress card should expose current count");
  assert.match(html, /data-total="64"/, "progress card should expose total count");
  assert.match(html, /data-percent="50"/, "progress card should expose percent");
  assert.match(html, />Embedding chunks</, "progress phase label should render");
  assert.match(html, />50%<\/strong>/, "progress percent should render");
  assert.match(html, /Embedding 32\/64 changed chunks/, "progress message should render");
  assert.match(html, /Ollama · qwen3-embedding:0\.6b/, "progress provider summary should render");
  assert.match(html, /JSON index/, "progress vector store should render");
}

function testAppShellExpanded(html) {
  assert.match(html, /class="app-shell"/, "expanded app shell should render");
  assert.match(html, /class="sidebar"/, "expanded app shell should include the sidebar");
  assert.match(html, /aria-label="Hide sidebar"/, "expanded app shell should expose the hide-sidebar button");
  assert.match(html, /aria-expanded="true"/, "expanded sidebar toggle should report sidebar visibility");
  assert.match(html, /class="main-area"/, "expanded app shell should render the main area");
  assert.match(html, /class="tab-strip"/, "expanded app shell should render the tab strip");
  assert.match(html, /Daily Habits/, "expanded app shell should render active tab/sidebar context");
  assert.match(html, /class="main-content"/, "expanded app shell should render the main content wrapper");
  assert.match(html, /Renderer main content/, "expanded app shell should render child content");
}

function testAppShellCollapsed(html) {
  assert.match(html, /class="app-shell sidebar-collapsed"/, "collapsed app shell should expose collapsed class");
  assert.doesNotMatch(html, /class="sidebar"/, "collapsed app shell should hide the sidebar");
  assert.match(html, /aria-label="Show sidebar"/, "collapsed app shell should expose the show-sidebar button");
  assert.match(html, /aria-expanded="false"/, "collapsed sidebar toggle should report hidden sidebar");
  assert.match(html, /class="main-area"/, "collapsed app shell should keep the main area visible");
  assert.match(html, /class="tab-strip"/, "collapsed app shell should keep the tab strip visible");
  assert.match(html, /Renderer main content/, "collapsed app shell should keep child content visible");
}

function testSearchAiSurface(html) {
  assert.match(html, /data-testid="search-ai-surface"/, "Search & AI surface should expose a stable root");
  assert.match(html, /Search &amp; AI/, "Search & AI heading should render");
  assert.match(html, /role="tab"[^>]*aria-selected="true"[^>]*>Search</, "Search tab should be selected by default");
  assert.match(html, /role="tab"[^>]*>LLM Chat</, "LLM Chat sibling tab should render");
  assert.match(html, /Advanced/, "Advanced result tab should render inside Search");
  assert.match(html, /Command palette/, "Search tab should expose the command palette handoff");
}

function testSearchAiSubtitleContract(result) {
  assert.deepEqual(result, {
    database: "Database · Research / Knowledge Base",
    row: "Row page · Knowledge Base",
    rowPage: "Row page · Knowledge Base · Research / Semantic Orchard",
    databaseBackedPage: "Row page · Knowledge Base",
    databasePage: "Page · Knowledge Base · Research / Notes",
    workspacePage: "Page · Research / Home",
    internalWorkspacePage: "Page · Workspace"
  });
}

function rendererComponentEntry() {
  return String.raw`
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    import { Text } from "@codemirror/state";
    import { AdvancedSearchPanel, AdvancedSearchProgressCard } from "./src/builtin-plugins/advanced-search/index.tsx";
    import { GitHubBackupPanel } from "./src/builtin-plugins/github-backup/index.tsx";
    import { GitSyncSettingsPanel } from "./src/builtin-plugins/git-sync/index.tsx";
    import { OPENAI_LLM_CHAT_VISUAL_CONTRACT } from "./src/builtin-plugins/llm-openai/chat-ui.ts";
    import { AppShell } from "./src/renderer/components/AppShell.tsx";
    import { DesignSystemLab } from "./src/renderer/components/DesignSystemLab.tsx";
    import {
      FieldSettingsDialog,
      dismissFieldSettingsIfIdle,
      fieldFormatOverrides,
      runFieldSettingsAction,
      shouldHydrateFieldSettingsDraft
    } from "./src/renderer/features/databases/FieldSettingsDialog.tsx";
    import { EntityIcon } from "./src/renderer/components/EntityIcon.tsx";
    import { MenuItem, MenuSection } from "./src/renderer/components/Menu.tsx";
    import { FieldTypeIcon, ViewTypeIcon } from "./src/renderer/components/FieldTypeIcon.tsx";
    import {
      Cell,
      bulkRowsResultFeedback,
      createCellEditQueue,
      diffTableView,
      isEditableKeyboardTarget,
      preferredActiveViewId,
      runBulkRowAction,
      runRowCreation,
      rowCreationControlsBlocked
    } from "./src/renderer/features/databases/DatabaseTable.tsx";
    import {
      DatabaseProperties,
      DatabaseViewTabsBar,
      EmbeddedDatabaseHeader,
      runViewOrderMutation,
      StandaloneDatabaseHeader,
      viewOrderControlsBlocked
    } from "./src/renderer/features/databases/DatabaseChrome.tsx";
    import { DatabaseTableGrid } from "./src/renderer/features/databases/DatabaseTableGrid.tsx";
    import { CreateViewDialog, runCreateViewSubmission } from "./src/renderer/features/databases/CreateViewDialog.tsx";
    import {
      dismissColumnMenuIfIdle,
      runColumnMenuAction
    } from "./src/renderer/features/databases/ColumnHeaderMenu.tsx";
    import {
      PropertyManagerDialog,
      dismissPropertyManagerIfIdle,
      filterPropertyFields,
      propertyCreateInput,
      reorderPropertyIds,
      runPropertyManagerMutation
    } from "./src/renderer/features/databases/PropertyManagerDialog.tsx";
    import {
      dismissViewMenuIfIdle,
      runViewMenuAction,
      viewRenameValidation
    } from "./src/renderer/features/databases/ViewContextMenu.tsx";
    import {
      databaseSettingsPageOpenMode,
      runDatabaseSettingsAction,
      runDatabaseSettingsNavigationIfIdle
    } from "./src/renderer/features/databases/DatabaseSettingsMenu.tsx";
    import { CalendarBody } from "./src/renderer/features/databases/CalendarBody.tsx";
    import { DatabaseTemplatePicker } from "./src/renderer/features/databases/DatabaseTemplatePicker.tsx";
    import {
      FilterPopoverContent,
      dismissFilterPopoverIfIdle,
      runFilterMutation
    } from "./src/renderer/features/databases/FilterPopover.tsx";
    import {
      SortPopoverContent,
      dismissSortPopoverIfIdle,
      runSortMutation
    } from "./src/renderer/features/databases/SortPopover.tsx";
    import { GalleryBody } from "./src/renderer/features/databases/GalleryBody.tsx";
    import {
      dismissGroupSettingsIfIdle,
      runGroupSettingsSubmission
    } from "./src/renderer/features/databases/GroupSettingsDialog.tsx";
    import {
      dismissDeletedRowsIfIdle,
      runDeletedRowsAction
    } from "./src/renderer/features/databases/DeletedRowsDialog.tsx";
    import {
      dismissRowMenuIfIdle,
      runRowMenuAction
    } from "./src/renderer/features/databases/RowContextMenu.tsx";
    import { ListBody } from "./src/renderer/features/databases/ListBody.tsx";
    import { OptionPill } from "./src/renderer/features/databases/OptionPill.tsx";
    import {
      ViewSettingsDialog,
      dismissViewSettingsIfIdle,
      runViewSettingsAction,
      shouldHydrateViewSettingsDraft
    } from "./src/renderer/features/databases/ViewSettingsDialog.tsx";
    import {
      RowTemplateDialog,
      dismissRowTemplateIfIdle,
      runRowTemplateAction,
      shouldHydrateRowTemplateDraft
    } from "./src/renderer/features/databases/RowTemplateDialog.tsx";
    import { DatabaseCacheValueProvider } from "./src/renderer/context/database-cache.tsx";
    import { SettingsProvider } from "./src/renderer/lib/settings.tsx";
    import { CoverArea, createCoverOffsetMutationController } from "./src/renderer/features/pages/CoverArea.tsx";
    import { EmbeddedViewRenderer } from "./src/renderer/features/pages/EmbeddedViewRenderer.tsx";
    import { BrowserPluginSettings } from "./src/renderer/plugin-host/browser-settings.ts";

    export function renderCreateViewDialog() {
      const currentView = {
        id: "view_board",
        databaseId: "db_contract",
        name: "Current board",
        type: "kanban",
        visibleFieldIds: ["title"],
        fieldOrder: ["title"],
        filters: [],
        sorts: [],
        revision: 0
      };
      return renderToStaticMarkup(
        <CreateViewDialog
          databaseId="db_contract"
          currentView={currentView}
          existingNames={["Default", "View 3"]}
          onClose={() => {}}
          onCreate={async () => {}}
        />
      );
    }

    export async function createViewSubmissionContract() {
      const input = {
        databaseId: "db_contract",
        name: "Review",
        type: "list",
        sourceMode: "empty"
      };
      const concurrentGuard = { current: false };
      const concurrentSaving = [];
      const concurrentErrors = [];
      let concurrentSuccesses = 0;
      let createCalls = 0;
      let receivedInput;
      let releaseCreate;
      const first = runCreateViewSubmission({
        guard: concurrentGuard,
        input,
        onCreate: (nextInput) => {
          createCalls += 1;
          receivedInput = nextInput;
          return new Promise((resolve) => { releaseCreate = resolve; });
        },
        onError: (message) => concurrentErrors.push(message),
        onSavingChange: (value) => concurrentSaving.push(value),
        onSuccess: () => { concurrentSuccesses += 1; }
      });
      const secondStatus = await runCreateViewSubmission({
        guard: concurrentGuard,
        input,
        onCreate: async () => { createCalls += 1; },
        onError: (message) => concurrentErrors.push(message),
        onSavingChange: (value) => concurrentSaving.push(value),
        onSuccess: () => { concurrentSuccesses += 1; }
      });
      releaseCreate();
      const firstStatus = await first;

      const retryGuard = { current: false };
      const failureSaving = [];
      const failureErrors = [];
      let failureSuccesses = 0;
      const failureStatus = await runCreateViewSubmission({
        guard: retryGuard,
        input,
        onCreate: async () => { throw "raw create failure"; },
        onError: (message) => failureErrors.push(message),
        onSavingChange: (value) => failureSaving.push(value),
        onSuccess: () => { failureSuccesses += 1; }
      });
      const failure = {
        status: failureStatus,
        error: failureErrors.at(-1),
        saving: failureSaving,
        successes: failureSuccesses,
        guardReset: retryGuard.current === false
      };

      const retrySaving = [];
      const retryErrors = [];
      let retrySuccesses = 0;
      const retryStatus = await runCreateViewSubmission({
        guard: retryGuard,
        input,
        onCreate: async () => {},
        onError: (message) => retryErrors.push(message),
        onSavingChange: (value) => retrySaving.push(value),
        onSuccess: () => { retrySuccesses += 1; }
      });

      return {
        concurrent: {
          createCalls,
          firstStatus,
          secondStatus,
          saving: concurrentSaving,
          errors: concurrentErrors,
          successes: concurrentSuccesses,
          input: receivedInput
        },
        failure,
        retry: {
          status: retryStatus,
          errors: retryErrors,
          saving: retrySaving,
          successes: retrySuccesses
        }
      };
    }

    export function renderPropertyManagerDialog() {
      const fields = [
        { id: "title", name: "Name", type: "text", system: true },
        { id: "priority", name: "Priority", type: "select" },
        { id: "tags", name: "Tags", type: "multi_select" }
      ];
      const activeView = {
        id: "view_current",
        databaseId: "db_contract",
        name: "Current review",
        type: "table",
        visibleFieldIds: ["title", "priority"],
        fieldOrder: ["title", "priority"],
        filters: [],
        sorts: [],
        revision: 0
      };
      return renderToStaticMarkup(
        <PropertyManagerDialog
          fields={fields}
          deletedFields={[{
            field: { id: "legacy", name: "Legacy score", type: "number" },
            dependencies: ["Formula total"],
            deletedAt: "2026-07-23T00:00:00.000Z"
          }]}
          activeView={activeView}
          onClose={() => {}}
          onEdit={() => {}}
          onAdd={async () => {}}
          onReorder={async () => {}}
          onDelete={async () => {}}
          onRestore={async () => {}}
          onPermanentlyDelete={async () => {}}
        />
      );
    }

    export async function propertyManagerMutationContract() {
      const fields = [
        { id: "title", name: "Name", type: "text" },
        { id: "priority", name: "Priority", type: "select" },
        { id: "tags", name: "Tags", type: "multi_select" }
      ];
      const filtering = {
        byName: filterPropertyFields(fields, " PRIORITY ").map((field) => field.id),
        byType: filterPropertyFields(fields, "multi_select").map((field) => field.id),
        blank: filterPropertyFields(fields, " ").map((field) => field.id)
      };
      const inputs = {
        current: propertyCreateInput({
          activeViewId: "view_current",
          name: "Review score",
          type: "number",
          visibility: "current"
        }),
        all: propertyCreateInput({
          activeViewId: "view_current",
          name: "Shared note",
          type: "text",
          visibility: "all"
        })
      };
      const reordering = {
        moved: reorderPropertyIds(fields, "tags", "priority"),
        same: reorderPropertyIds(fields, "priority", "priority"),
        missing: reorderPropertyIds(fields, "missing", "priority")
      };
      let closeCalls = 0;
      const dismissal = {
        pending: dismissPropertyManagerIfIdle({ current: true }, () => { closeCalls += 1; }),
        idle: dismissPropertyManagerIfIdle({ current: false }, () => { closeCalls += 1; }),
        closeCalls
      };

      const concurrentGuard = { current: false };
      const concurrentPending = [];
      const concurrentErrors = [];
      let mutationCalls = 0;
      let releaseMutation;
      const first = runPropertyManagerMutation({
        guard: concurrentGuard,
        mutation: () => {
          mutationCalls += 1;
          return new Promise((resolve) => { releaseMutation = resolve; });
        },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value)
      });
      const secondStatus = await runPropertyManagerMutation({
        guard: concurrentGuard,
        mutation: async () => { mutationCalls += 1; },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value)
      });
      releaseMutation();
      const firstStatus = await first;

      const retryGuard = { current: false };
      const failurePending = [];
      const failureErrors = [];
      const failureStatus = await runPropertyManagerMutation({
        guard: retryGuard,
        mutation: async () => { throw "raw property failure"; },
        onError: (message) => failureErrors.push(message),
        onPendingChange: (value) => failurePending.push(value)
      });
      const failure = {
        status: failureStatus,
        error: failureErrors.at(-1),
        pending: failurePending,
        guardReset: retryGuard.current === false
      };

      const retryPending = [];
      const retryErrors = [];
      let retryCalls = 0;
      const retryStatus = await runPropertyManagerMutation({
        guard: retryGuard,
        mutation: async () => { retryCalls += 1; },
        onError: (message) => retryErrors.push(message),
        onPendingChange: (value) => retryPending.push(value)
      });

      return {
        filtering,
        inputs,
        reordering,
        dismissal,
        concurrent: {
          mutationCalls,
          firstStatus,
          secondStatus,
          pending: concurrentPending,
          errors: concurrentErrors
        },
        failure,
        retry: {
          status: retryStatus,
          errors: retryErrors,
          pending: retryPending,
          calls: retryCalls
        }
      };
    }

    export async function columnMenuActionContract() {
      let closeCalls = 0;
      const dismissal = {
        pending: dismissColumnMenuIfIdle({ current: true }, () => { closeCalls += 1; }),
        idle: dismissColumnMenuIfIdle({ current: false }, () => { closeCalls += 1; }),
        closeCalls
      };

      const concurrentGuard = { current: false };
      const concurrentPending = [];
      const concurrentErrors = [];
      let actionCalls = 0;
      let releaseAction;
      let successes = 0;
      const first = runColumnMenuAction({
        guard: concurrentGuard,
        action: () => {
          actionCalls += 1;
          return new Promise((resolve) => { releaseAction = resolve; });
        },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value),
        onSuccess: () => { successes += 1; }
      });
      const secondStatus = await runColumnMenuAction({
        guard: concurrentGuard,
        action: async () => { actionCalls += 1; },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value),
        onSuccess: () => { successes += 1; }
      });
      releaseAction();
      const firstStatus = await first;

      const retryGuard = { current: false };
      const failurePending = [];
      const failureErrors = [];
      let failureSuccesses = 0;
      const failureStatus = await runColumnMenuAction({
        guard: retryGuard,
        action: async () => { throw "raw column action failure"; },
        onError: (message) => failureErrors.push(message),
        onPendingChange: (value) => failurePending.push(value),
        onSuccess: () => { failureSuccesses += 1; }
      });
      const failure = {
        status: failureStatus,
        error: failureErrors.at(-1),
        pending: failurePending,
        successes: failureSuccesses,
        guardReset: retryGuard.current === false
      };

      const retryPending = [];
      const retryErrors = [];
      let retrySuccesses = 0;
      const retryStatus = await runColumnMenuAction({
        guard: retryGuard,
        action: async () => {},
        onError: (message) => retryErrors.push(message),
        onPendingChange: (value) => retryPending.push(value),
        onSuccess: () => { retrySuccesses += 1; }
      });

      return {
        dismissal,
        concurrent: {
          actionCalls,
          firstStatus,
          secondStatus,
          pending: concurrentPending,
          errors: concurrentErrors,
          successes
        },
        failure,
        retry: {
          status: retryStatus,
          errors: retryErrors,
          pending: retryPending,
          successes: retrySuccesses
        }
      };
    }

    export async function viewMenuActionContract() {
      const validation = {
        blank: viewRenameValidation(" ", "Default", ["Default", "Board"]),
        conflict: viewRenameValidation(" board ", "Default", ["Default", "Board"]),
        current: viewRenameValidation("Default", "Default", ["Default", "Board"]),
        unique: viewRenameValidation("Review", "Default", ["Default", "Board"])
      };
      let closeCalls = 0;
      const dismissal = {
        pending: dismissViewMenuIfIdle({ current: true }, () => { closeCalls += 1; }),
        idle: dismissViewMenuIfIdle({ current: false }, () => { closeCalls += 1; }),
        closeCalls
      };

      const concurrentGuard = { current: false };
      const concurrentPending = [];
      const concurrentErrors = [];
      let actionCalls = 0;
      let releaseAction;
      let successes = 0;
      const first = runViewMenuAction({
        guard: concurrentGuard,
        action: () => {
          actionCalls += 1;
          return new Promise((resolve) => { releaseAction = resolve; });
        },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value),
        onSuccess: () => { successes += 1; }
      });
      const secondStatus = await runViewMenuAction({
        guard: concurrentGuard,
        action: async () => { actionCalls += 1; },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value),
        onSuccess: () => { successes += 1; }
      });
      releaseAction();
      const firstStatus = await first;

      const retryGuard = { current: false };
      const failurePending = [];
      const failureErrors = [];
      let failureSuccesses = 0;
      const failureStatus = await runViewMenuAction({
        guard: retryGuard,
        action: async () => { throw "raw view action failure"; },
        onError: (message) => failureErrors.push(message),
        onPendingChange: (value) => failurePending.push(value),
        onSuccess: () => { failureSuccesses += 1; }
      });
      const failure = {
        status: failureStatus,
        error: failureErrors.at(-1),
        pending: failurePending,
        successes: failureSuccesses,
        guardReset: retryGuard.current === false
      };

      const retryPending = [];
      const retryErrors = [];
      let retrySuccesses = 0;
      const retryStatus = await runViewMenuAction({
        guard: retryGuard,
        action: async () => {},
        onError: (message) => retryErrors.push(message),
        onPendingChange: (value) => retryPending.push(value),
        onSuccess: () => { retrySuccesses += 1; }
      });

      return {
        validation,
        dismissal,
        concurrent: {
          actionCalls,
          firstStatus,
          secondStatus,
          pending: concurrentPending,
          errors: concurrentErrors,
          successes
        },
        failure,
        retry: {
          status: retryStatus,
          errors: retryErrors,
          pending: retryPending,
          successes: retrySuccesses
        }
      };
    }

    export async function databaseSettingsActionContract() {
      const pageOpenModes = {
        tableDefault: databaseSettingsPageOpenMode({ type: "table" }),
        galleryDefault: databaseSettingsPageOpenMode({ type: "gallery" }),
        explicit: databaseSettingsPageOpenMode({ type: "table", pageOpenMode: "full_page" })
      };
      let navigationCalls = 0;
      const navigation = {
        pending: runDatabaseSettingsNavigationIfIdle({ current: true }, () => { navigationCalls += 1; }),
        idle: runDatabaseSettingsNavigationIfIdle({ current: false }, () => { navigationCalls += 1; }),
        calls: navigationCalls
      };

      const concurrentGuard = { current: false };
      const concurrentPending = [];
      const concurrentErrors = [];
      let actionCalls = 0;
      let releaseAction;
      let successes = 0;
      const first = runDatabaseSettingsAction({
        guard: concurrentGuard,
        action: () => {
          actionCalls += 1;
          return new Promise((resolve) => { releaseAction = resolve; });
        },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value),
        onSuccess: () => { successes += 1; }
      });
      const secondStatus = await runDatabaseSettingsAction({
        guard: concurrentGuard,
        action: async () => { actionCalls += 1; },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value),
        onSuccess: () => { successes += 1; }
      });
      releaseAction();
      const firstStatus = await first;

      const retryGuard = { current: false };
      const failurePending = [];
      const failureErrors = [];
      let failureSuccesses = 0;
      const failureStatus = await runDatabaseSettingsAction({
        guard: retryGuard,
        action: async () => { throw "raw database settings failure"; },
        onError: (message) => failureErrors.push(message),
        onPendingChange: (value) => failurePending.push(value),
        onSuccess: () => { failureSuccesses += 1; }
      });
      const failure = {
        status: failureStatus,
        error: failureErrors.at(-1),
        pending: failurePending,
        successes: failureSuccesses,
        guardReset: retryGuard.current === false
      };

      const retryPending = [];
      const retryErrors = [];
      let retrySuccesses = 0;
      const retryStatus = await runDatabaseSettingsAction({
        guard: retryGuard,
        action: async () => {},
        onError: (message) => retryErrors.push(message),
        onPendingChange: (value) => retryPending.push(value),
        onSuccess: () => { retrySuccesses += 1; }
      });

      return {
        pageOpenModes,
        navigation,
        concurrent: {
          actionCalls,
          firstStatus,
          secondStatus,
          pending: concurrentPending,
          errors: concurrentErrors,
          successes
        },
        failure,
        retry: {
          status: retryStatus,
          errors: retryErrors,
          pending: retryPending,
          successes: retrySuccesses
        }
      };
    }

    export async function groupSettingsSubmissionContract() {
      let closeCalls = 0;
      const dismissal = {
        pending: dismissGroupSettingsIfIdle({ current: true }, () => { closeCalls += 1; }),
        idle: dismissGroupSettingsIfIdle({ current: false }, () => { closeCalls += 1; }),
        closeCalls
      };

      const concurrentGuard = { current: false };
      const concurrentPending = [];
      const concurrentErrors = [];
      let saveCalls = 0;
      let releaseSave;
      let successes = 0;
      const first = runGroupSettingsSubmission({
        guard: concurrentGuard,
        submit: () => {
          saveCalls += 1;
          return new Promise((resolve) => { releaseSave = resolve; });
        },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value),
        onSuccess: () => { successes += 1; }
      });
      const secondStatus = await runGroupSettingsSubmission({
        guard: concurrentGuard,
        submit: async () => { saveCalls += 1; },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value),
        onSuccess: () => { successes += 1; }
      });
      releaseSave();
      const firstStatus = await first;

      const retryGuard = { current: false };
      const failurePending = [];
      const failureErrors = [];
      let failureSuccesses = 0;
      const failureStatus = await runGroupSettingsSubmission({
        guard: retryGuard,
        submit: async () => { throw "raw grouping failure"; },
        onError: (message) => failureErrors.push(message),
        onPendingChange: (value) => failurePending.push(value),
        onSuccess: () => { failureSuccesses += 1; }
      });
      const failure = {
        status: failureStatus,
        error: failureErrors.at(-1),
        pending: failurePending,
        successes: failureSuccesses,
        guardReset: retryGuard.current === false
      };

      const retryPending = [];
      const retryErrors = [];
      let retrySuccesses = 0;
      const retryStatus = await runGroupSettingsSubmission({
        guard: retryGuard,
        submit: async () => {},
        onError: (message) => retryErrors.push(message),
        onPendingChange: (value) => retryPending.push(value),
        onSuccess: () => { retrySuccesses += 1; }
      });

      return {
        dismissal,
        concurrent: {
          saveCalls,
          firstStatus,
          secondStatus,
          pending: concurrentPending,
          errors: concurrentErrors,
          successes
        },
        failure,
        retry: {
          status: retryStatus,
          errors: retryErrors,
          pending: retryPending,
          successes: retrySuccesses
        }
      };
    }

    export async function viewSettingsActionContract() {
      let closeCalls = 0;
      const dismissal = {
        pending: dismissViewSettingsIfIdle({ current: true }, () => { closeCalls += 1; }),
        idle: dismissViewSettingsIfIdle({ current: false }, () => { closeCalls += 1; }),
        closeCalls
      };

      const concurrentGuard = { current: false };
      const concurrentPending = [];
      const concurrentErrors = [];
      let operationCalls = 0;
      let releaseOperation;
      let successes = 0;
      const first = runViewSettingsAction({
        guard: concurrentGuard,
        operation: () => {
          operationCalls += 1;
          return new Promise((resolve) => { releaseOperation = resolve; });
        },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value),
        onSuccess: () => { successes += 1; }
      });
      const secondStatus = await runViewSettingsAction({
        guard: concurrentGuard,
        operation: async () => { operationCalls += 1; },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value),
        onSuccess: () => { successes += 1; }
      });
      releaseOperation();
      const firstStatus = await first;

      const retryGuard = { current: false };
      const failurePending = [];
      const failureErrors = [];
      let failureSuccesses = 0;
      const failureStatus = await runViewSettingsAction({
        guard: retryGuard,
        operation: async () => { throw "raw view settings failure"; },
        onError: (message) => failureErrors.push(message),
        onPendingChange: (value) => failurePending.push(value),
        onSuccess: () => { failureSuccesses += 1; }
      });
      const failure = {
        status: failureStatus,
        error: failureErrors.at(-1),
        pending: failurePending,
        successes: failureSuccesses,
        guardReset: retryGuard.current === false
      };

      const retryPending = [];
      const retryErrors = [];
      let retrySuccesses = 0;
      const retryStatus = await runViewSettingsAction({
        guard: retryGuard,
        operation: async () => {},
        onError: (message) => retryErrors.push(message),
        onPendingChange: (value) => retryPending.push(value),
        onSuccess: () => { retrySuccesses += 1; }
      });

      return {
        hydration: {
          failedSameView: shouldHydrateViewSettingsDraft("view-a", "view-a", true),
          idleSameView: shouldHydrateViewSettingsDraft("view-a", "view-a", false),
          switchedView: shouldHydrateViewSettingsDraft("view-a", "view-b", true)
        },
        dismissal,
        concurrent: {
          operationCalls,
          firstStatus,
          secondStatus,
          pending: concurrentPending,
          errors: concurrentErrors,
          successes
        },
        failure,
        retry: {
          status: retryStatus,
          errors: retryErrors,
          pending: retryPending,
          successes: retrySuccesses
        }
      };
    }

    export async function rowTemplateActionContract() {
      let closeCalls = 0;
      const dismissal = {
        pending: dismissRowTemplateIfIdle({ current: true }, () => { closeCalls += 1; }),
        idle: dismissRowTemplateIfIdle({ current: false }, () => { closeCalls += 1; }),
        closeCalls
      };

      const concurrentGuard = { current: false };
      const concurrentPending = [];
      const concurrentErrors = [];
      let operationCalls = 0;
      let releaseOperation;
      let successes = 0;
      const first = runRowTemplateAction({
        guard: concurrentGuard,
        operation: () => {
          operationCalls += 1;
          return new Promise((resolve) => { releaseOperation = resolve; });
        },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value),
        onSuccess: () => { successes += 1; }
      });
      const secondStatus = await runRowTemplateAction({
        guard: concurrentGuard,
        operation: async () => { operationCalls += 1; },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value),
        onSuccess: () => { successes += 1; }
      });
      releaseOperation();
      const firstStatus = await first;

      const retryGuard = { current: false };
      const failurePending = [];
      const failureErrors = [];
      let failureSuccesses = 0;
      const failureStatus = await runRowTemplateAction({
        guard: retryGuard,
        operation: async () => { throw "raw template failure"; },
        onError: (message) => failureErrors.push(message),
        onPendingChange: (value) => failurePending.push(value),
        onSuccess: () => { failureSuccesses += 1; }
      });
      const failure = {
        status: failureStatus,
        error: failureErrors.at(-1),
        pending: failurePending,
        successes: failureSuccesses,
        guardReset: retryGuard.current === false
      };

      const retryPending = [];
      const retryErrors = [];
      let retrySuccesses = 0;
      const retryStatus = await runRowTemplateAction({
        guard: retryGuard,
        operation: async () => {},
        onError: (message) => retryErrors.push(message),
        onPendingChange: (value) => retryPending.push(value),
        onSuccess: () => { retrySuccesses += 1; }
      });

      return {
        hydration: {
          failedSameTemplate: shouldHydrateRowTemplateDraft("template-a", "template-a", true),
          idleSameTemplate: shouldHydrateRowTemplateDraft("template-a", "template-a", false),
          switchedTemplate: shouldHydrateRowTemplateDraft("template-a", "template-b", true)
        },
        dismissal,
        concurrent: {
          operationCalls,
          firstStatus,
          secondStatus,
          pending: concurrentPending,
          errors: concurrentErrors,
          successes
        },
        failure,
        retry: {
          status: retryStatus,
          errors: retryErrors,
          pending: retryPending,
          successes: retrySuccesses
        }
      };
    }

    export async function deletedRowsActionContract() {
      let closeCalls = 0;
      const dismissal = {
        pending: dismissDeletedRowsIfIdle({ current: true }, () => { closeCalls += 1; }),
        idle: dismissDeletedRowsIfIdle({ current: false }, () => { closeCalls += 1; }),
        closeCalls
      };

      const concurrentGuard = { current: false };
      const concurrentPending = [];
      const concurrentErrors = [];
      let actionCalls = 0;
      let releaseAction;
      const first = runDeletedRowsAction({
        guard: concurrentGuard,
        action: () => {
          actionCalls += 1;
          return new Promise((resolve) => { releaseAction = resolve; });
        },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value)
      });
      const secondStatus = await runDeletedRowsAction({
        guard: concurrentGuard,
        action: async () => { actionCalls += 1; },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value)
      });
      releaseAction();
      const firstStatus = await first;

      const retryGuard = { current: false };
      const failurePending = [];
      const failureErrors = [];
      const failureStatus = await runDeletedRowsAction({
        guard: retryGuard,
        action: async () => { throw "raw deleted row failure"; },
        onError: (message) => failureErrors.push(message),
        onPendingChange: (value) => failurePending.push(value)
      });
      const failure = {
        status: failureStatus,
        error: failureErrors.at(-1),
        pending: failurePending,
        guardReset: retryGuard.current === false
      };

      const retryPending = [];
      const retryErrors = [];
      let retryCalls = 0;
      const retryStatus = await runDeletedRowsAction({
        guard: retryGuard,
        action: async () => { retryCalls += 1; },
        onError: (message) => retryErrors.push(message),
        onPendingChange: (value) => retryPending.push(value)
      });

      return {
        dismissal,
        concurrent: {
          actionCalls,
          firstStatus,
          secondStatus,
          pending: concurrentPending,
          errors: concurrentErrors
        },
        failure,
        retry: {
          status: retryStatus,
          errors: retryErrors,
          pending: retryPending,
          calls: retryCalls
        }
      };
    }

    export async function rowMenuActionContract() {
      let closeCalls = 0;
      const dismissal = {
        pending: dismissRowMenuIfIdle({ current: true }, () => { closeCalls += 1; }),
        idle: dismissRowMenuIfIdle({ current: false }, () => { closeCalls += 1; }),
        closeCalls
      };

      const concurrentGuard = { current: false };
      const concurrentPending = [];
      const concurrentErrors = [];
      let actionCalls = 0;
      let releaseAction;
      let successes = 0;
      const first = runRowMenuAction({
        guard: concurrentGuard,
        action: () => {
          actionCalls += 1;
          return new Promise((resolve) => { releaseAction = resolve; });
        },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value),
        onSuccess: () => { successes += 1; }
      });
      const secondStatus = await runRowMenuAction({
        guard: concurrentGuard,
        action: async () => { actionCalls += 1; },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value),
        onSuccess: () => { successes += 1; }
      });
      releaseAction();
      const firstStatus = await first;

      const retryGuard = { current: false };
      const failurePending = [];
      const failureErrors = [];
      let failureSuccesses = 0;
      const failureStatus = await runRowMenuAction({
        guard: retryGuard,
        action: async () => { throw "raw row action failure"; },
        onError: (message) => failureErrors.push(message),
        onPendingChange: (value) => failurePending.push(value),
        onSuccess: () => { failureSuccesses += 1; }
      });
      const failure = {
        status: failureStatus,
        error: failureErrors.at(-1),
        pending: failurePending,
        successes: failureSuccesses,
        guardReset: retryGuard.current === false
      };

      const retryPending = [];
      const retryErrors = [];
      let retrySuccesses = 0;
      const retryStatus = await runRowMenuAction({
        guard: retryGuard,
        action: async () => {},
        onError: (message) => retryErrors.push(message),
        onPendingChange: (value) => retryPending.push(value),
        onSuccess: () => { retrySuccesses += 1; }
      });

      return {
        dismissal,
        concurrent: {
          actionCalls,
          firstStatus,
          secondStatus,
          pending: concurrentPending,
          errors: concurrentErrors,
          successes
        },
        failure,
        retry: {
          status: retryStatus,
          errors: retryErrors,
          pending: retryPending,
          successes: retrySuccesses
        }
      };
    }

    export async function filterMutationContract() {
      const expression = {
        version: 1,
        kind: "group",
        id: "filter-root",
        conjunction: "and",
        children: [{
          version: 1,
          kind: "condition",
          id: "filter-condition",
          fieldId: "title",
          operator: "contains",
          value: "Recovered"
        }]
      };
      let closeCalls = 0;
      const dismissal = {
        pending: dismissFilterPopoverIfIdle({ current: true }, () => { closeCalls += 1; }),
        idle: dismissFilterPopoverIfIdle({ current: false }, () => { closeCalls += 1; }),
        closeCalls
      };

      const concurrentGuard = { current: false };
      const concurrentPending = [];
      const concurrentErrors = [];
      let changeCalls = 0;
      let releaseChange;
      let successes = 0;
      const first = runFilterMutation({
        expression,
        guard: concurrentGuard,
        onChange: () => {
          changeCalls += 1;
          return new Promise((resolve) => { releaseChange = resolve; });
        },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value),
        onSuccess: () => { successes += 1; }
      });
      const secondStatus = await runFilterMutation({
        expression,
        guard: concurrentGuard,
        onChange: async () => { changeCalls += 1; },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value),
        onSuccess: () => { successes += 1; }
      });
      releaseChange();
      const firstStatus = await first;

      const retryGuard = { current: false };
      const failurePending = [];
      const failureErrors = [];
      let failureSuccesses = 0;
      const failureStatus = await runFilterMutation({
        expression,
        guard: retryGuard,
        onChange: async () => { throw "raw filter persistence failure"; },
        onError: (message) => failureErrors.push(message),
        onPendingChange: (value) => failurePending.push(value),
        onSuccess: () => { failureSuccesses += 1; }
      });
      const failure = {
        status: failureStatus,
        error: failureErrors.at(-1),
        pending: failurePending,
        successes: failureSuccesses,
        guardReset: retryGuard.current === false
      };

      const retryPending = [];
      const retryErrors = [];
      let retrySuccesses = 0;
      let retryValue = "";
      const retryStatus = await runFilterMutation({
        expression,
        guard: retryGuard,
        onChange: async (next) => { retryValue = String(next.children[0]?.value ?? ""); },
        onError: (message) => retryErrors.push(message),
        onPendingChange: (value) => retryPending.push(value),
        onSuccess: () => { retrySuccesses += 1; }
      });

      return {
        dismissal,
        concurrent: {
          changeCalls,
          firstStatus,
          secondStatus,
          pending: concurrentPending,
          errors: concurrentErrors,
          successes
        },
        failure,
        retry: {
          status: retryStatus,
          errors: retryErrors,
          pending: retryPending,
          successes: retrySuccesses,
          value: retryValue
        }
      };
    }

    export async function sortMutationContract() {
      const sorts = [{ fieldId: "title", direction: "desc" }];
      let closeCalls = 0;
      const dismissal = {
        pending: dismissSortPopoverIfIdle({ current: true }, () => { closeCalls += 1; }),
        idle: dismissSortPopoverIfIdle({ current: false }, () => { closeCalls += 1; }),
        closeCalls
      };

      const concurrentGuard = { current: false };
      const concurrentPending = [];
      const concurrentErrors = [];
      let changeCalls = 0;
      let releaseChange;
      const first = runSortMutation({
        sorts,
        guard: concurrentGuard,
        onChange: () => {
          changeCalls += 1;
          return new Promise((resolve) => { releaseChange = resolve; });
        },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value)
      });
      const secondStatus = await runSortMutation({
        sorts,
        guard: concurrentGuard,
        onChange: async () => { changeCalls += 1; },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value)
      });
      releaseChange();
      const firstStatus = await first;

      const retryGuard = { current: false };
      const failurePending = [];
      const failureErrors = [];
      const failureStatus = await runSortMutation({
        sorts,
        guard: retryGuard,
        onChange: async () => { throw "raw sort persistence failure"; },
        onError: (message) => failureErrors.push(message),
        onPendingChange: (value) => failurePending.push(value)
      });
      const failure = {
        status: failureStatus,
        error: failureErrors.at(-1),
        pending: failurePending,
        guardReset: retryGuard.current === false
      };

      const retryPending = [];
      const retryErrors = [];
      let retryDirection = "";
      const retryStatus = await runSortMutation({
        sorts,
        guard: retryGuard,
        onChange: async (next) => { retryDirection = next[0]?.direction ?? ""; },
        onError: (message) => retryErrors.push(message),
        onPendingChange: (value) => retryPending.push(value)
      });

      return {
        dismissal,
        concurrent: {
          changeCalls,
          firstStatus,
          secondStatus,
          pending: concurrentPending,
          errors: concurrentErrors
        },
        failure,
        retry: {
          status: retryStatus,
          errors: retryErrors,
          pending: retryPending,
          direction: retryDirection
        }
      };
    }

    export async function browserPluginSettingsContract() {
      const previousWindow = globalThis.window;
      const storage = new Map();
      let failWrites = false;
      globalThis.window = {
        ...(previousWindow || {}),
        localStorage: {
          getItem(key) { return storage.get(key) ?? null; },
          setItem(key, value) {
            if (failWrites) throw new Error("simulated localStorage failure");
            storage.set(key, String(value));
          },
          removeItem(key) { storage.delete(key); }
        }
      };
      try {
        const key = "lotion.plugin.plugin-a.settings";
        storage.set(key, JSON.stringify({ enabled: true }));
        const settings = new BrowserPluginSettings("plugin-a");
        const initial = {
          enabled: settings.get("enabled"),
          missing: settings.get("missing", "fallback")
        };
        const snapshot = settings.all();
        snapshot.enabled = false;
        const snapshotIsDefensive = settings.get("enabled") === true;

        await settings.set("model", "gpt-test");
        const afterSet = {
          cache: settings.all(),
          persisted: JSON.parse(storage.get(key)),
          reloadModel: new BrowserPluginSettings("plugin-a").get("model")
        };

        await settings.set("unsupported", undefined);
        const undefinedValue = {
          cacheValue: settings.get("unsupported", "fallback"),
          persistedHasKey: Object.hasOwn(JSON.parse(storage.get(key)), "unsupported")
        };

        await settings.set("stable", "before");
        failWrites = true;
        let failedSetRejected = false;
        try {
          await settings.set("stable", "after");
        } catch {
          failedSetRejected = true;
        }
        const failedSet = {
          rejected: failedSetRejected,
          cacheValue: settings.get("stable"),
          persistedValue: JSON.parse(storage.get(key)).stable
        };
        let failedDeleteRejected = false;
        try {
          await settings.delete("stable");
        } catch {
          failedDeleteRejected = true;
        }
        const failedDelete = {
          rejected: failedDeleteRejected,
          cacheValue: settings.get("stable"),
          persistedValue: JSON.parse(storage.get(key)).stable
        };
        failWrites = false;

        const cyclic = {};
        cyclic.self = cyclic;
        let cyclicRejected = false;
        try {
          await settings.set("cyclic", cyclic);
        } catch {
          cyclicRejected = true;
        }
        let toJSONRejected = false;
        try {
          await settings.set("toJSON", () => "replacement");
        } catch {
          toJSONRejected = true;
        }
        const stableAfterSerializationFailures = settings.get("stable");

        await settings.delete("model");
        const afterDelete = {
          cacheHasModel: Object.hasOwn(settings.all(), "model"),
          persistedHasModel: Object.hasOwn(JSON.parse(storage.get(key)), "model")
        };

        storage.set("lotion.plugin.malformed.settings", "{broken");
        storage.set("lotion.plugin.array.settings", "[]");
        const invalidStorage = {
          malformed: new BrowserPluginSettings("malformed").all(),
          array: new BrowserPluginSettings("array").all()
        };
        const isolated = new BrowserPluginSettings("plugin-b");
        await isolated.set("stable", "plugin-b");
        const pluginIsolation = settings.get("stable") === "before"
          && isolated.get("stable") === "plugin-b"
          && storage.has("lotion.plugin.plugin-a.settings")
          && storage.has("lotion.plugin.plugin-b.settings");

        return {
          initial,
          snapshotIsDefensive,
          afterSet,
          undefinedValue,
          failedSet,
          failedDelete,
          cyclicRejected,
          toJSONRejected,
          stableAfterSerializationFailures,
          afterDelete,
          invalidStorage,
          pluginIsolation
        };
      } finally {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
      }
    }

    export async function rendererWorkspaceMoveContract() {
      const previousWindow = globalThis.window;
      const pages = new Map([
        ["pg_parent", { meta: { id: "pg_parent", title: "Parent", path: ["Root", "Parent"] }, markdown: "# Parent" }],
        ["pg_child", { meta: { id: "pg_child", title: "Child", path: ["Root", "Parent", "Child"] }, markdown: "# Child" }]
      ]);
      const updates = [];
      globalThis.window = {
        ...(previousWindow || {}),
        lotion: {
          pages: {
            get: async (id) => pages.get(id),
            update: async (id, input) => {
              updates.push({ id, ...input });
              if (id === "pg_parent" && input.parentId === "pg_child") {
                throw new Error("Page move would create a page hierarchy cycle.");
              }
              return pages.get(id);
            }
          }
        }
      };
      const context = new PluginContextImpl(
        pluginHost,
        {
          id: "renderer-workspace-move-test",
          name: "Renderer workspace move test",
          version: "0.1.0",
          author: "Lotion Tests",
          permissions: ["workspace.read", "workspace.write"]
        },
        new InMemoryPluginSettings()
      );
      try {
        await context.workspace.movePage("pg_child", "pg_parent");
        const validMove = updates.at(-1);
        await context.workspace.movePage("pg_child", null);
        const clearMove = updates.at(-1);
        const beforeSelf = updates.length;
        let selfError = "";
        try {
          await context.workspace.movePage("pg_child", "pg_child");
        } catch (error) {
          selfError = String(error);
        }
        let descendantError = "";
        try {
          await context.workspace.movePage("pg_parent", "pg_child");
        } catch (error) {
          descendantError = String(error);
        }
        return {
          validMove,
          clearMove,
          selfError,
          selfUpdateAttempted: updates.length > beforeSelf + 1,
          descendantError
        };
      } finally {
        context.disposeAll();
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
      }
    }

    export function viewPersistenceContract() {
      const previousWindow = globalThis.window;
      const values = new Map([["lotion.database.lastActiveView.db_contract", "view_alt"]]);
      globalThis.window = {
        ...(previousWindow || {}),
        localStorage: {
          getItem(key) { return values.get(key) ?? null; },
          setItem(key, value) { values.set(key, String(value)); }
        }
      };
      try {
        const defaultView = { id: "view_default", databaseId: "db_contract", name: "Default", type: "table", visibleFieldIds: ["title"], fieldOrder: ["title"], filters: [], sorts: [], revision: 3 };
        const alternateView = { ...defaultView, id: "view_alt", name: "Alternate" };
        const bundle = { schema: { id: "db_contract", defaultViewId: "view_default" }, records: [], views: [defaultView, alternateView] };
        return {
          restored: preferredActiveViewId(bundle, defaultView, true),
          explicit: preferredActiveViewId(bundle, alternateView, true),
          embedded: preferredActiveViewId(bundle, defaultView, false),
          patch: diffTableView(defaultView, {
            ...defaultView,
            filters: [{ fieldId: "status", operator: "is", value: "Done" }],
            revision: 99,
            updatedAt: "2099-01-01T00:00:00.000Z"
          })
        };
      } finally {
        if (previousWindow === undefined) delete globalThis.window;
        else globalThis.window = previousWindow;
      }
    }

    export function editableKeyboardTargetContract() {
      let selector = "";
      const editableTarget = isEditableKeyboardTarget({
        closest(value) {
          selector = value;
          return {};
        }
      });
      const nonEditableTarget = isEditableKeyboardTarget({ closest() { return null; } });
      return {
        nullTarget: isEditableKeyboardTarget(null),
        plainTarget: isEditableKeyboardTarget({}),
        editableTarget,
        nonEditableTarget,
        selector
      };
    }
    import { PageLayout } from "./src/renderer/features/pages/PageLayout.tsx";
    import { createPagePropertyMutationController, PageProperties } from "./src/renderer/features/pages/PageProperties.tsx";
    import {
      createPageLayoutMutationController,
      createPageTitleMutationController,
      PageBacklinks,
      PageEditor,
      PageHistoryPanel,
      submitPageTitleBlurValue
    } from "./src/renderer/features/pages/PageEditor.tsx";
    import {
      __testParseToggleBody,
      __testReadLotionToggleSource,
      __testRenderToggleMarkdown,
      __testRenderWidgetMarkdown,
      __testSerializeToggleFence,
      __testCleanHeadingText,
      missingEmbeddedViewDiagnosticCopy
    } from "./src/renderer/features/pages/markdown-decorations.ts";
    import { MarkdownPropertyLinks, WorkspaceLinkButton } from "./src/renderer/features/pages/PropertyLinks.tsx";
    import { classifyLink, tryNavigateWorkspaceLink } from "./src/renderer/features/pages/workspace-link-routing.ts";
    import {
      createRowPagePropertyEditController,
      PropertyRow,
      RowPageProperties
    } from "./src/renderer/features/pages/RowPageProperties.tsx";
    import { SlashMenuContent } from "./src/renderer/features/pages/SlashMenu.tsx";
    import { Sidebar, SidebarPageContextMenuView } from "./src/renderer/components/Sidebar.tsx";
    import { ShortcutSettings } from "./src/renderer/components/ShortcutSettings.tsx";
    import { TabStrip } from "./src/renderer/components/TabStrip.tsx";
    import { WorkspaceSelector } from "./src/renderer/components/WorkspaceSelector.tsx";
    import { BackupButton } from "./src/renderer/features/backup/BackupButton.tsx";
    import { ManagementView, PluginDetail } from "./src/renderer/features/manage/ManagementView.tsx";
    import { SearchBox } from "./src/renderer/features/search/SearchBox.tsx";
    import { SearchAiSurface, searchAiHitSubtitle } from "./src/renderer/features/search/SearchAiSurface.tsx";
    import { GlobalSearchPanelContent } from "./src/renderer/features/search/GlobalSearchPanel.tsx";
    import { StartupLoadingScreen } from "./src/renderer/App.tsx";
    import { StartupPerformancePanel } from "./src/renderer/features/startup/StartupPerformancePanel.tsx";
    import { I18nValueProvider } from "./src/renderer/lib/i18n.ts";
    import {
      AuditResult,
      createNotionAuditRunController,
      NotionAuditPanel
    } from "./src/builtin-plugins/notion-import/NotionAuditPanel.tsx";
    import { NotionImportDialog, NotionImportPanel } from "./src/builtin-plugins/notion-import/NotionImportDialog.tsx";
    import { NotionImportSettings } from "./src/builtin-plugins/notion-import/index.tsx";
    import { LotionActionsProvider } from "./src/renderer/context/lotion-actions.tsx";
    import { pluginHost } from "./src/renderer/plugin-host/index.ts";
    import { PluginHost, PluginContextImpl, InMemoryPluginSettings } from "./src/shared/plugin-host/index.ts";
    import {
      createOptionMutationController,
      installDefaultFieldTypes,
      manifest as defaultFieldTypesManifest
    } from "./src/builtin-plugins/field-types-default/index.tsx";
    import { installKanbanView } from "./src/builtin-plugins/view-kanban/index.ts";

    export function renderStartupLoadingScreen() {
      return renderToStaticMarkup(
        React.createElement(StartupLoadingScreen, {
          title: "Loading test workspace",
          startup: {
            startedAt: performance.now() - 42,
            currentKey: "index",
            phases: [
              { key: "workspace", label: "Opening workspace", status: "done", ms: 12 },
              { key: "index", label: "Reading workspace index", status: "active" },
              { key: "navigation", label: "Restoring page", status: "pending" },
              { key: "paint", label: "Painting editor", status: "pending" }
            ]
          }
        })
      );
    }

    export function renderStartupPerformancePanel() {
      return renderToStaticMarkup(
        React.createElement(StartupPerformancePanel, {
          report: {
            capturedAt: "2026-07-27T18:00:00.000Z",
            totalMs: 2340,
            measuredPhaseMs: 2280,
            overheadMs: 60,
            phases: [
              { key: "workspace", label: "Opening workspace", status: "done", ms: 55 },
              { key: "index", label: "Reading workspace index", status: "done", ms: 2060 },
              { key: "navigation", label: "Restoring page", status: "done", ms: 120 },
              { key: "paint", label: "Painting editor", status: "done", ms: 45 }
            ],
            indexOperations: [
              { key: "workspaceIndex", status: "done", ms: 18, count: 43900, countKind: "entries" },
              { key: "favorites", status: "done", ms: 2, count: 6, countKind: "items" },
              { key: "recents", status: "done", ms: 3, count: 10, countKind: "items" },
              { key: "workspacePath", status: "done", ms: 4, count: 2, countKind: "items" }
            ],
            workspace: {
              name: "Real workspace",
              path: "/Users/test/Lotion",
              pages: 43320,
              databases: 12
            },
            cache: {
              status: "hit",
              reason: "source-signatures-match",
              path: "workspace-cache/fixture/startup.sqlite",
              bytes: 524288,
              validationMs: 10,
              readMs: 18,
              buildMs: 0,
              writeMs: 0
            }
          }
        })
      );
    }

    export function renderMissingEmbeddedViewDiagnosticCopy() {
      return missingEmbeddedViewDiagnosticCopy("问题列表");
    }

    export function cleanHeadingTextContract() {
      return {
        markdownLink: __testCleanHeadingText("Read [the guide](https://example.com/guide)"),
        importedDoubleBracketLink: __testCleanHeadingText("工作反思[[跳转]](https://app.notion.com/p/example?pvs=21)"),
        formattedHeading: __testCleanHeadingText("**Bold** and \`code\` ###")
      };
    }

    export function lotionToggleFenceContract() {
      const fence = "\`".repeat(3);
      const fourFence = "\`".repeat(4);
      const inlineTick = "\`";
      const bodyLines = [
        "Paragraph with **bold** and *italic* and " + inlineTick + "inline code" + inlineTick + " and ~~strike~~.",
        "",
        "# Toggle heading 1",
        "## Toggle heading 2",
        "> Toggle quote",
        "",
        "- Bullet item",
        "  - Nested bullet item",
        "1. Numbered item",
        "2. Second numbered item",
        "- [ ] Toggle todo unchecked",
        "- [x] Toggle todo checked",
        "",
        "| Name | Value |",
        "| --- | ---: |",
        "| Alpha | 1 |",
        "",
        "---",
        "",
        "![Toggle image](attachments/toggle.png)",
        "",
        "[Toggle link](https://example.com/toggle)",
        "",
        fence + "ts",
        "const value: number = 42;",
        fence,
        "",
        fence + "lotion-callout",
        "icon: !",
        "background: yellow",
        "---",
        "Nested callout content",
        fence,
        "",
        fence + "lotion-equation",
        "E = mc^2",
        fence,
        "",
        fence + "lotion-iframe",
        "url: https://example.com/embed",
        "height: 240",
        fence,
        "",
        fence + "lotion-view",
        "database: db_toggle",
        "view: view_default",
        fence,
        "",
        fence + "lotion-toc",
        fence,
        "",
        fourFence + "lotion-toggle",
        "summary: Nested child",
        "open: false",
        "---",
        "Nested child paragraph",
        "",
        fence + "js",
        "console.log('nested child');",
        fence,
        fourFence,
        "",
        "After nested toggle"
      ];
      const sourceLines = [
        fence + "lotion-toggle",
        "summary: GetBannerV2",
        "open: true",
        "---",
        ...bodyLines,
        fence
      ];
      const doc = Text.of(sourceLines);
      const firstInnerFenceClose = sourceLines.findIndex((line, index) => index > 4 && line === fence) + 1;
      const parsedSource = __testReadLotionToggleSource(doc, 1, "TRUNCATED", doc.line(firstInnerFenceClose).to);
      const parsedToggle = __testParseToggleBody(parsedSource.body);
      const renderedHtml = __testRenderToggleMarkdown(parsedToggle.markdown);
      const serialized = __testSerializeToggleFence("Edited toggle", parsedToggle.markdown, true);
      const tildeLines = [
        "~~~lotion-toggle",
        "summary: Tilde outer",
        "open: false",
        "---",
        "Tilde body before code",
        fence + "json",
        "{ \"ok\": true }",
        fence,
        "Tilde body after code",
        "~~~"
      ];
      const tildeDoc = Text.of(tildeLines);
      const tildeParsedSource = __testReadLotionToggleSource(tildeDoc, 1, "TRUNCATED", tildeDoc.line(8).to);
      const tildeToggle = __testParseToggleBody(tildeParsedSource.body);
      return {
        expectedTo: doc.line(sourceLines.length).to,
        parsedBody: parsedSource.body,
        parsedMarkdown: parsedToggle.markdown,
        parsedOpen: parsedToggle.open,
        parsedSummary: parsedToggle.summary,
        parsedTo: parsedSource.to,
        renderedHtml,
        serialized,
        serializedFirstLine: serialized.split("\n")[0],
        serializedLastLine: serialized.split("\n").at(-1),
        tilde: {
          expectedTo: tildeDoc.line(tildeLines.length).to,
          markdown: tildeToggle.markdown,
          open: tildeToggle.open,
          parsedTo: tildeParsedSource.to,
          summary: tildeToggle.summary
        }
      };
    }

    export function workspaceLinkRoutingContract() {
      const calls = [];
      const actions = {
        selectPage: (id) => calls.push(["selectPage", id]),
        openRowPageByFile: (databaseId, fileName) => calls.push(["openRowPageByFile", databaseId, fileName]),
        selectDatabase: (databaseId) => calls.push(["selectDatabase", databaseId])
      };
      const urls = {
        page: "databases/system/pages--db_pages/pages/Example--pg_example.md",
        rowPage: "databases/user/Tasks--db_tasks/pages/Task--row_abc.md",
        database: "databases/user/Tasks--db_tasks",
        external: "https://example.com/docs"
      };
      return {
        kinds: Object.fromEntries(Object.entries(urls).map(([key, value]) => [key, classifyLink(value)])),
        opened: {
          page: tryNavigateWorkspaceLink(urls.page, actions),
          rowPage: tryNavigateWorkspaceLink(urls.rowPage, actions),
          database: tryNavigateWorkspaceLink(urls.database, actions)
        },
        calls
      };
    }

    export function renderAdvancedSearchPanelInitial() {
      return renderToStaticMarkup(
        React.createElement(AdvancedSearchPanel, {
          ctx: makeAdvancedSearchPluginContext(),
          embedded: true
        })
      );
    }

    export function renderAdvancedSearchProgressCard() {
      return renderToStaticMarkup(
        React.createElement(AdvancedSearchProgressCard, {
          config: {
            provider: "ollama",
            baseUrl: "http://127.0.0.1:11434",
            model: "qwen3-embedding:0.6b",
            vectorStore: "json"
          },
          elapsedMs: 1450,
          progress: {
            phase: "embedding",
            current: 32,
            total: 64,
            message: "Embedding 32/64 changed chunks"
          }
        })
      );
    }

    export function renderLLMChatVisualContract() {
      return OPENAI_LLM_CHAT_VISUAL_CONTRACT;
    }

    export function renderGitHubBackupPanelInitial() {
      return renderToStaticMarkup(
        React.createElement(GitHubBackupPanel, {
          ctx: makeGitHubBackupPluginContext(),
          initialStatus: {
            state: "backed_up",
            message: "Backed up 3 changed files.",
            lastBackupAt: "2026-06-12T10:30:00.000Z",
            lastCommitSha: "abc1234",
            fileCount: 12
          },
          initialActivePage: makeGitHubBackupActivePage(),
          initialHistory: [
            {
              id: "lotion-backups/pages/weekly-review.md@abc1234",
              sha: "abc1234",
              message: "Lotion backup 2026-06-12",
              createdAt: "2026-06-12T10:30:00.000Z",
              path: "lotion-backups/pages/weekly-review.md",
              title: "Weekly Review",
              pageId: "pg_weekly"
            }
          ],
          initialPreview: {
            version: {
              id: "lotion-backups/pages/weekly-review.md@abc1234",
              sha: "abc1234",
              message: "Lotion backup 2026-06-12",
              createdAt: "2026-06-12T10:30:00.000Z",
              path: "lotion-backups/pages/weekly-review.md",
              title: "Weekly Review",
              pageId: "pg_weekly"
            },
            selectedMarkdown: "# Weekly Review\\nRestored body",
            currentMarkdown: "# Weekly Review\\nCurrent body",
            diff: [
              { type: "unchanged", text: "# Weekly Review" },
              { type: "removed", text: "Current body" },
              { type: "added", text: "Restored body" }
            ]
          }
        })
      );
    }

    export function renderGitHubBackupPanelFailure() {
      return renderToStaticMarkup(
        React.createElement(GitHubBackupPanel, {
          ctx: makeGitHubBackupPluginContext({
            provider: "github_api",
            repository: "",
            branch: "main",
            basePath: "lotion-integration-tests/renderer",
            token: ""
          }),
          initialStatus: {
            state: "failed",
            message: "GitHub token is required."
          },
          initialActivePage: null,
          initialHistory: [],
          initialPreview: null
        })
      );
    }

    export function renderGitHubBackupPanelHistoryEmpty() {
      return renderToStaticMarkup(
        React.createElement(GitHubBackupPanel, {
          ctx: makeGitHubBackupPluginContext(),
          initialStatus: {
            state: "history_empty",
            message: "This page has no backed-up versions yet."
          },
          initialActivePage: makeGitHubBackupActivePage(),
          initialHistory: [],
          initialPreview: null
        })
      );
    }

    export function renderGitSyncPanelConfigured() {
      return withRendererWindow(() =>
        renderToStaticMarkup(
          React.createElement(GitSyncSettingsPanel, {
            initialStatus: {
              installed: true,
              repoInitialized: true,
              enabled: true,
              clean: false,
              dirtyCount: 3,
              branch: "main",
              ahead: 2,
              behind: 1,
              remote: "git@github.com:owner/repo.git",
              lastCommit: "abc1234 Lotion backup",
              output: " M pages/weekly.md\\n?? attachments/note.png"
            },
            initialSettings: {
              remoteUrl: "git@github.com:owner/repo.git",
              branch: "main",
              sshKeyPath: "/Users/me/.ssh/id_ed25519",
              autoBackupCadence: "minutes_30",
              autoPushCadence: "after_backup",
              automationPaused: true,
              commitMessagePrefix: "Lotion backup",
              lastBackupAt: "2026-06-12T10:30:00.000Z",
              lastPushAt: "2026-06-12T10:35:00.000Z",
              lastError: "Previous push failed"
            },
            initialMessage: {
              success: true,
              message: "Backup created.",
              output: "Created commit abc1234"
            }
          })
        )
      );
    }

    export function renderGitSyncPanelDefaultSettings() {
      return withRendererWindow(() =>
        renderToStaticMarkup(
          React.createElement(GitSyncSettingsPanel, {
            initialStatus: {
              installed: false,
              repoInitialized: false,
              enabled: true,
              clean: true,
              dirtyCount: 0,
              branch: "",
              ahead: 0,
              behind: 0,
              remote: "",
              lastCommit: "",
              output: ""
            }
          })
        )
      );
    }

    export function renderGitSyncPanelStatusScenarios() {
      const settings = {
        remoteUrl: "git@github.com:owner/repo.git",
        branch: "main",
        sshKeyPath: "",
        autoBackupCadence: "off",
        autoPushCadence: "off",
        automationPaused: false,
        commitMessagePrefix: "Lotion backup",
        lastBackupAt: "",
        lastPushAt: "",
        lastError: ""
      };
      const baseStatus = {
        installed: true,
        repoInitialized: true,
        enabled: true,
        clean: true,
        dirtyCount: 0,
        branch: "main",
        ahead: 0,
        behind: 0,
        remote: "git@github.com:owner/repo.git",
        lastCommit: "abc1234 Lotion backup",
        output: "## main"
      };
      return withRendererWindow(() =>
        renderToStaticMarkup(
          React.createElement(
            "div",
            null,
            React.createElement(
              "section",
              { "data-testid": "git-sync-status-behind" },
              React.createElement(GitSyncSettingsPanel, {
                initialStatus: { ...baseStatus, behind: 2 },
                initialSettings: settings
              })
            ),
            React.createElement(
              "section",
              { "data-testid": "git-sync-status-diverged" },
              React.createElement(GitSyncSettingsPanel, {
                initialStatus: { ...baseStatus, ahead: 1, behind: 1 },
                initialSettings: settings
              })
            ),
            React.createElement(
              "section",
              { "data-testid": "git-sync-status-ahead" },
              React.createElement(GitSyncSettingsPanel, {
                initialStatus: { ...baseStatus, ahead: 3 },
                initialSettings: settings
              })
            ),
            React.createElement(
              "section",
              { "data-testid": "git-sync-status-dirty" },
              React.createElement(GitSyncSettingsPanel, {
                initialStatus: { ...baseStatus, clean: false, dirtyCount: 2, ahead: 4, behind: 5 },
                initialSettings: settings
              })
            )
          )
        )
      );
    }

    export function renderAppShellExpanded() {
      return renderAppShell(false);
    }

    export function renderAppShellCollapsed() {
      return renderAppShell(true);
    }

    function renderAppShell(collapsed) {
      const context = installRendererTestPlugin();
      try {
        return withRendererWindow(
          () =>
            renderToStaticMarkup(
              React.createElement(
                SettingsProvider,
                null,
                React.createElement(
                  DatabaseCacheValueProvider,
                  { value: makeManagementDatabaseCache() },
                  React.createElement(
                    LotionActionsProvider,
                    { value: makeNoopActions() },
                    React.createElement(
                      AppShell,
                      {
                        state: makeSidebarState(),
                        onOpenSearch: () => {},
                        onOpenSearchAi: () => {},
                        onReordered: () => {},
                        onSwitchTab: () => {},
                        onCloseTab: () => {},
                        onNewTab: () => {},
                        onReorderTabs: () => {},
                        onMoveTabToNewWindow: () => {}
                      },
                      React.createElement("section", { className: "renderer-main-fixture" }, "Renderer main content")
                    )
                  )
                )
              )
            ),
          [["lotion.sidebar.collapsed", collapsed ? "true" : "false"]]
        );
      } finally {
        context.disposeAll();
      }
    }

    export function renderRowPageProperties() {
      const registration = installDefaultFieldTypes(
        new PluginContextImpl(pluginHost, defaultFieldTypesManifest, new InMemoryPluginSettings())
      );
      try {
        return renderToStaticMarkup(
          React.createElement(
            LotionActionsProvider,
            { value: makeNoopActions() },
            React.createElement(RowPageProperties, {
              schema: makeRendererPropertiesSchema(),
              record: makeRendererPropertiesRecord(),
              onUpdateField: () => {},
              onUpdateFieldOptions: () => {},
              onSearchPropertyValue: () => {}
            })
          )
        );
      } finally {
        registration.dispose();
      }
    }

    export async function optionMutationContract() {
      const attempts = [];
      const states = [];
      let failNext = true;
      const controller = createOptionMutationController({
        operation: async (options) => {
          attempts.push(options.map((option) => option.name));
          if (failNext) {
            failNext = false;
            throw "raw option failure";
          }
        },
        onStateChange: (state) => {
          states.push({
            status: state.status,
            names: "input" in state ? state.input.map((option) => option.name) : [],
            ...("error" in state ? { error: state.error } : {})
          });
        }
      });
      const failedInput = [
        { id: "todo", name: "Todo", color: "gray" },
        { id: "done", name: "Done", color: "green" }
      ];
      const first = await controller.submit(failedInput);
      const competing = await controller.submit([{ id: "later", name: "Later" }]);
      const retryPromise = controller.retry();
      const duplicateRetry = await controller.retry();
      const retry = await retryPromise;

      failNext = true;
      await controller.submit([{ id: "todo", name: "Todo", color: "blue" }]);
      const discardAccepted = controller.discard();
      const duplicateDiscardIgnored = !controller.discard();
      return {
        attempts,
        states,
        first,
        competing,
        retry,
        duplicateRetry,
        discardAccepted,
        duplicateDiscardIgnored
      };
    }

    export async function pageLayoutMutationContract() {
      const attempts = [];
      const states = [];
      let pageACalls = 0;
      let releaseRetry;
      const controller = createPageLayoutMutationController({
        onStateChange: (state) => states.push(state)
      });
      const pageAFullWidthOperation = async (value) => {
        attempts.push(["page-a", "fullWidth", value]);
        pageACalls += 1;
        if (pageACalls === 1) throw "raw layout failure";
        await new Promise((resolve) => { releaseRetry = resolve; });
      };
      const pageBSmallTextOperation = async (value) => {
        attempts.push(["page-b", "smallText", value]);
      };
      const first = await controller.submit("fullWidth", true, pageAFullWidthOperation);
      const blockedAfterFailure = controller.isBlocked();
      const competing = await controller.submit("smallText", true, pageBSmallTextOperation);
      const retryPromise = controller.retry();
      const duplicateRetry = await controller.retry();
      releaseRetry();
      const retry = await retryPromise;

      await controller.submit("smallText", true, async (value) => {
        attempts.push(["page-a", "smallText", value]);
        throw new Error("discard layout failure");
      });
      const discarded = controller.discard();
      const duplicateDiscardIgnored = !controller.discard();

      let rejectStale;
      const stalePromise = controller.submit("fullWidth", false, async (value) => {
        attempts.push(["page-old", "fullWidth", value]);
        await new Promise((_, reject) => { rejectStale = reject; });
      });
      controller.reset();
      rejectStale(new Error("stale page layout failure"));
      const staleResult = await stalePromise;
      const retryAfterReset = await controller.retry();
      const currentResult = await controller.submit("smallText", false, pageBSmallTextOperation);

      return {
        attempts,
        states,
        first,
        blockedAfterFailure,
        competing,
        duplicateRetry,
        retry,
        discarded,
        duplicateDiscardIgnored,
        staleResult,
        retryAfterReset,
        currentResult
      };
    }

    export async function pageTitleMutationContract() {
      const attempts = [];
      const states = [];
      let pageACalls = 0;
      let releaseRetry;
      const controller = createPageTitleMutationController({
        onStateChange: (state) => states.push(state)
      });
      const pageAOperation = async (title) => {
        attempts.push(["page-a", title]);
        pageACalls += 1;
        if (pageACalls === 1) throw "raw title failure";
        await new Promise((resolve) => { releaseRetry = resolve; });
      };
      const pageBOperation = async (title) => {
        attempts.push(["page-b", title]);
      };
      const first = await controller.submit("Draft A", pageAOperation);
      const competing = await controller.submit("Wrong entity", pageBOperation);
      const retryPromise = controller.retry();
      const duplicateRetry = await controller.retry();
      releaseRetry();
      const retry = await retryPromise;

      await controller.submit("Discard me", async (title) => {
        attempts.push(["page-a", title]);
        throw new Error("discard title failure");
      });
      const discarded = controller.discard();
      const duplicateDiscardIgnored = !controller.discard();

      let rejectStale;
      const stalePromise = controller.submit("Old page pending", async (title) => {
        attempts.push(["page-old", title]);
        await new Promise((_, reject) => { rejectStale = reject; });
      });
      controller.reset();
      rejectStale(new Error("stale page failure"));
      const staleResult = await stalePromise;
      const retryAfterReset = await controller.retry();
      const currentResult = await controller.submit("Current page", pageBOperation);

      return {
        attempts,
        states,
        first,
        competing,
        duplicateRetry,
        retry,
        discarded,
        duplicateDiscardIgnored,
        staleResult,
        retryAfterReset,
        currentResult
      };
    }

    export async function pageTitleBlurContract() {
      const staleReactState = "Recovered page title";
      const domValue = "Discarded page title";
      const submitted = [];
      submitPageTitleBlurValue(domValue, {
        async submit(value, operation) {
          await operation(value);
          return "submitted";
        }
      }, async (value) => {
        submitted.push(value);
      });
      await Promise.resolve();
      return { staleReactState, domValue, submitted };
    }

    export async function coverOffsetMutationContract() {
      const attempts = [];
      const states = [];
      let coverACalls = 0;
      let releaseRetry;
      const controller = createCoverOffsetMutationController({
        onStateChange: (state) => states.push(state)
      });
      const coverAOperation = async (offset) => {
        attempts.push(["cover-a", offset]);
        coverACalls += 1;
        if (coverACalls === 1) throw "raw cover failure";
        await new Promise((resolve) => { releaseRetry = resolve; });
      };
      const coverBOperation = async (offset) => {
        attempts.push(["cover-b", offset]);
      };
      const first = await controller.submit(72, coverAOperation);
      const competing = await controller.submit(91, coverBOperation);
      const retryPromise = controller.retry();
      const duplicateRetry = await controller.retry();
      releaseRetry();
      const retry = await retryPromise;

      await controller.submit(18, async (offset) => {
        attempts.push(["cover-a", offset]);
        throw new Error("discard cover failure");
      });
      const discarded = controller.discard();
      const duplicateDiscardIgnored = !controller.discard();

      let rejectStale;
      const stalePromise = controller.submit(44, async (offset) => {
        attempts.push(["cover-old", offset]);
        await new Promise((_, reject) => { rejectStale = reject; });
      });
      controller.reset();
      rejectStale(new Error("stale cover failure"));
      const staleResult = await stalePromise;
      const retryAfterReset = await controller.retry();
      const currentResult = await controller.submit(33, coverBOperation);

      return {
        attempts,
        states,
        first,
        competing,
        duplicateRetry,
        retry,
        discarded,
        duplicateDiscardIgnored,
        staleResult,
        retryAfterReset,
        currentResult
      };
    }

    export function rowPropertyInteractionContract() {
      let managed = 0;
      const searched = [];
      let prevented = 0;
      let stopped = 0;
      const tree = PropertyRow({
        field: {
          id: "status",
          name: "Status",
          type: "select",
          options: [{ id: "done", name: "Done", color: "green" }]
        },
        value: "Done",
        record: { id: "row_1", status: "Done" },
        databaseId: "db_1",
        onChange: () => {},
        onOptionsChange: () => {},
        onManageField: () => { managed += 1; },
        onSearchPropertyValue: (value) => { searched.push(value); }
      });
      const nodes = [];
      const visit = (node) => {
        if (!node || typeof node !== "object") return;
        nodes.push(node);
        React.Children.forEach(node.props?.children, visit);
      };
      visit(tree);
      const event = {
        preventDefault: () => { prevented += 1; },
        stopPropagation: () => { stopped += 1; }
      };
      const manageButton = nodes.find((node) => node.props?.className === "row-property-settings");
      const searchButton = nodes.find((node) => node.props?.className?.includes("row-property-option-search-chip"));
      manageButton.props.onClick(event);
      searchButton.props.onClick(event);
      return { managed, searched, prevented, stopped };
    }

    export function renderRowPagePropertiesWithManagement() {
      return renderWithDefaultFieldTypes(
        React.createElement(
          LotionActionsProvider,
          { value: makeNoopActions() },
          React.createElement(RowPageProperties, {
            schema: makeRendererPropertiesSchema(),
            record: makeRendererPropertiesRecord(),
            onUpdateField: () => {},
            onUpdateFieldSettings: async () => {},
            onUpdateFieldOptions: () => {}
          })
        )
      );
    }

    export async function rowPagePropertyEditContract() {
      const states = [];
      const attempts = [];
      let discardedCount = 0;
      let failuresRemaining = 1;
      const controller = createRowPagePropertyEditController({
        operation: async (fieldId, value) => {
          attempts.push([fieldId, value]);
          if (failuresRemaining > 0) {
            failuresRemaining -= 1;
            throw "row property failure";
          }
        },
        onStateChange: (state) => states.push(state),
        onDiscard: () => { discardedCount += 1; }
      });
      const firstPromise = controller.enqueue("db", "row", "notes", "retry me");
      const laterPromise = controller.enqueue("db", "row", "empty_text", "queued");
      await new Promise((resolve) => setTimeout(resolve, 0));
      const retryAccepted = controller.retry();
      const duplicateRetryIgnored = !controller.retry();
      const first = await firstPromise;
      const later = await laterPromise;

      failuresRemaining = 1;
      const discardedPromise = controller.enqueue("db", "row", "notes", "discard me");
      await new Promise((resolve) => setTimeout(resolve, 0));
      const discardAccepted = controller.discard();
      const duplicateDiscardIgnored = !controller.discard();
      const discarded = await discardedPromise;
      return {
        states,
        attempts,
        retryAccepted,
        duplicateRetryIgnored,
        discardAccepted,
        duplicateDiscardIgnored,
        discardedCount,
        first,
        later,
        discarded
      };
    }

    export function renderPagePropertiesWithOriginalHtml() {
      return renderToStaticMarkup(
        React.createElement(
          LotionActionsProvider,
          { value: makeNoopActions() },
          React.createElement(PageProperties, {
            meta: {
              id: "pg_top_level",
              title: "Top Level Page",
              tags: ["import"],
              date: "2026-06-12",
              url: "https://example.com/source",
              originalNotionHtml: "attachments/original/top-level.html"
            },
            onChange: () => {}
          })
        )
      );
    }

    export function renderPageLayoutComposition() {
      const makeLayout = (fullWidth) => renderToStaticMarkup(
        React.createElement(PageLayout, {
          fullWidth,
          cover: React.createElement("div", { className: "layout-cover" }, "layout cover"),
          header: React.createElement("div", { className: "layout-header-content" }, "layout header"),
          properties: React.createElement("div", { className: "layout-properties" }, "layout properties"),
          overlay: React.createElement("div", { className: "layout-overlay" }, "layout overlay")
        }, React.createElement("main", { className: "layout-body" }, "layout body"))
      );
      return {
        standard: makeLayout(false),
        fullWidth: makeLayout(true)
      };
    }

    export function renderPageEditorEmptyPrompt() {
      return renderToStaticMarkup(
        React.createElement(
          DatabaseCacheValueProvider,
          { value: makeNoopDatabaseCache() },
          React.createElement(
            LotionActionsProvider,
            { value: makeNoopActions() },
            React.createElement(PageEditor, {
              page: makePageEditorDocument({ id: "pg_empty_shell", title: "Empty Shell", markdown: "" }),
              databases: makePageEditorDatabases(),
              pages: makePageEditorPages(),
              emptyTemplates: [
                { id: "tpl_daily", name: "Daily template", icon: "emoji:🌱", markdown: "Daily body" },
                { id: "tpl_work", name: "Work template", icon: "emoji:💼", markdown: "Work body" }
              ],
              onChange: () => {},
              onRename: () => {},
              onPickIcon: () => {},
              onCreateEmptyTemplate: () => {}
            })
          )
        )
      );
    }

    export function renderPageEditorBodyShell() {
      return renderToStaticMarkup(
        React.createElement(
          DatabaseCacheValueProvider,
          { value: makeNoopDatabaseCache() },
          React.createElement(
            LotionActionsProvider,
            { value: makeNoopActions() },
            React.createElement(PageEditor, {
              page: makePageEditorDocument({
                id: "pg_body_shell",
                title: "Writing Shell",
                markdown: "Body copy",
                fullWidth: true,
                icon: "emoji:📝"
              }),
              databases: makePageEditorDatabases(),
              pages: makePageEditorPages(),
              favorited: true,
              onChange: () => {},
              onRename: () => {},
              onPickIcon: () => {},
              onToggleFavorite: () => {},
              onOpenInNewWindow: () => {},
              onSetFullWidth: () => {}
            })
          )
        )
      );
    }

    export function renderPageEditorSecondaryChrome() {
      return renderToStaticMarkup(
        React.createElement(
          DatabaseCacheValueProvider,
          { value: makeNoopDatabaseCache() },
          React.createElement(
            LotionActionsProvider,
            { value: makeNoopActions() },
            React.createElement(PageEditor, {
              page: makePageEditorDocument({
                id: "pg_secondary_shell",
                title: "Secondary Shell",
                markdown: "Body with secondary chrome"
              }),
              databases: makePageEditorDatabases(),
              pages: makePageEditorPages(),
              propertiesSlot: React.createElement("div", { className: "renderer-secondary-properties" }, "Renderer source details"),
              initialViewState: {},
              onChange: () => {},
              onRename: () => {}
            })
          )
        )
      );
    }

    export function renderPageHistoryPanel() {
      return renderToStaticMarkup(
        React.createElement(PageHistoryPanel, {
          result: makePageHistoryResult(),
          preview: makePageHistoryPreview(),
          busy: false,
          onRefresh: () => {},
          onBackup: () => {},
          onPreview: () => {},
          onRestore: () => {}
        })
      );
    }

    export function renderPageBacklinksPanel() {
      return renderToStaticMarkup(
        React.createElement(PageBacklinks, {
          backlinks: [
            {
              type: "markdown",
              source: {
                entityId: "pg_source",
                kind: "page",
                title: "Source Page",
                icon: "emoji:📘",
                path: ["Workspace", "Notes", "Source Page"]
              },
              line: 12,
              excerpt: "See [target page here](databases/system/pages--db_pages/pages/Target--pg_target.md)."
            },
            {
              type: "property",
              source: {
                entityId: "row_task",
                kind: "row",
                databaseId: "db_tasks",
                rowId: "row_task",
                title: "Task Row",
                icon: "emoji:✅",
                path: ["Workspace", "Tasks", "Task Row"]
              },
              databaseName: "Tasks",
              fieldName: "Related",
              excerpt: "Target is linked from a relation field."
            },
            {
              type: "property",
              source: {
                entityId: "pg_long_backlink",
                kind: "page",
                title: "2fd622e5-6282-47b7-aada-19390aaae913 Investigation",
                path: [
                  "数据库",
                  "工作事项",
                  "Campaign Doesn't Show up in Banner",
                  "2fd622e5-6282-47b7-aada-19390aaae913 Investigation"
                ]
              },
              databaseName: "pages",
              fieldName: "Parent entity",
              excerpt: "2fd622e5-6282-47b7-aada-19390aaae913 Investigation"
            }
          ],
          onOpenEntity: () => {}
        })
      );
    }

    export function renderMarkdownPropertyLinks() {
      return renderToStaticMarkup(
        React.createElement(
          LotionActionsProvider,
          { value: makeNoopActions() },
          React.createElement(MarkdownPropertyLinks, {
            links: [
              { label: "Design note", href: "attachments/documents/design-note.pdf" },
              { label: "Source CSV", href: "attachments/original/source.csv" }
            ]
          })
        )
      );
    }

    export function renderWorkspaceLinkButton() {
      return renderToStaticMarkup(
        React.createElement(
          LotionActionsProvider,
          { value: makeNoopActions() },
          React.createElement(WorkspaceLinkButton, {
            href: "attachments/original/source-page.html",
            label: "Original Notion HTML"
          })
        )
      );
    }

    export function renderMixedMarkdownProperty() {
      const registration = installDefaultFieldTypes(
        new PluginContextImpl(pluginHost, defaultFieldTypesManifest, new InMemoryPluginSettings())
      );
      try {
        return renderToStaticMarkup(
          React.createElement(
            LotionActionsProvider,
            { value: makeNoopActions() },
            React.createElement(RowPageProperties, {
              schema: {
                id: "db_mixed_markdown",
                name: "Mixed Markdown",
                created_time: "2026-01-01T00:00:00.000Z",
                updated_time: "2026-01-01T00:00:00.000Z",
                defaultViewId: "view_default",
                fields: [
                  { id: "title", name: "Name", type: "text" },
                  { id: "mixed_markdown", name: "Mixed Link Note", type: "text", system: true }
                ]
              },
              record: {
                id: "row_mixed_markdown",
                title: "Mixed Markdown Row",
                mixed_markdown: "Before [Design note](attachments/documents/design-note.pdf) after"
              },
              onUpdateField: () => {},
              onUpdateFieldOptions: () => {}
            })
          )
        );
      } finally {
        registration.dispose();
      }
    }

    export function renderEditableFieldSettingsDialog() {
      return renderWithDefaultFieldTypes(
        React.createElement(FieldSettingsDialog, {
          field: { id: "notes", name: "Notes", type: "text" },
          wrap: true,
          onToggleWrap: () => {},
          onHide: () => {},
          onClose: () => {},
          onSave: async () => {}
        })
      );
    }

    export function renderInheritedDateFieldSettingsDialog() {
      return renderWithDefaultFieldTypes(
        React.createElement(FieldSettingsDialog, {
          field: { id: "due", name: "Due", type: "date" },
          onClose: () => {},
          onSave: async () => {}
        })
      );
    }

    export function fieldFormatOverridesContract() {
      return {
        inherited: fieldFormatOverrides("date", "", ""),
        explicit: fieldFormatOverrides("updated_time", "iso", "h24"),
        nonDate: fieldFormatOverrides("text", "full", "h12")
      };
    }

    export async function bulkRowActionContract() {
      const result = { bundle: {}, errors: [], createdRowIds: [] };
      const concurrentGuard = { current: false };
      const concurrentPending = [];
      const concurrentErrors = [];
      let operationCalls = 0;
      let releaseOperation;
      let successes = 0;
      const first = runBulkRowAction({
        guard: concurrentGuard,
        operation: () => {
          operationCalls += 1;
          return new Promise((resolve) => { releaseOperation = () => resolve(result); });
        },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value),
        onSuccess: () => { successes += 1; }
      });
      const secondStatus = await runBulkRowAction({
        guard: concurrentGuard,
        operation: async () => { operationCalls += 1; return result; },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value),
        onSuccess: () => { successes += 1; }
      });
      releaseOperation();
      const firstStatus = await first;

      const retryGuard = { current: false };
      const failurePending = [];
      const failureErrors = [];
      let failureSuccesses = 0;
      const failureStatus = await runBulkRowAction({
        guard: retryGuard,
        operation: async () => { throw "raw bulk failure"; },
        onError: (message) => failureErrors.push(message),
        onPendingChange: (value) => failurePending.push(value),
        onSuccess: () => { failureSuccesses += 1; }
      });
      const failure = {
        status: failureStatus,
        error: failureErrors.at(-1),
        pending: failurePending,
        successes: failureSuccesses,
        guardReset: retryGuard.current === false
      };

      const retryPending = [];
      const retryErrors = [];
      let retrySuccesses = 0;
      const retryStatus = await runBulkRowAction({
        guard: retryGuard,
        operation: async () => result,
        onError: (message) => retryErrors.push(message),
        onPendingChange: (value) => retryPending.push(value),
        onSuccess: () => { retrySuccesses += 1; }
      });

      return {
        concurrent: {
          operationCalls,
          firstStatus,
          secondStatus,
          pending: concurrentPending,
          errors: concurrentErrors,
          successes
        },
        failure,
        retry: {
          status: retryStatus,
          errors: retryErrors,
          pending: retryPending,
          successes: retrySuccesses
        },
        feedback: {
          success: bulkRowsResultFeedback(result, "Rows duplicated."),
          partial: bulkRowsResultFeedback({
            ...result,
            errors: [{ rowId: "missing", message: "Row not found." }]
          }, "Rows duplicated.")
        }
      };
    }

    export async function cellEditQueueContract() {
      const flush = () => new Promise((resolve) => setImmediate(resolve));
      const serialStates = [];
      const serialOrder = [];
      let active = 0;
      let maxConcurrent = 0;
      const releases = [];
      const serialQueue = createCellEditQueue({
        operation: (input) => {
          active += 1;
          maxConcurrent = Math.max(maxConcurrent, active);
          serialOrder.push(input.fieldId + ":" + input.value);
          return new Promise((resolve) => {
            releases.push(() => {
              active -= 1;
              resolve();
            });
          });
        },
        onStateChange: (state) => serialStates.push(state)
      });
      const firstPromise = serialQueue.enqueue({ databaseId: "db", rowId: "row", fieldId: "title", value: "A" });
      const duplicate = await serialQueue.enqueue({ databaseId: "db", rowId: "row", fieldId: "title", value: "A" });
      const secondPromise = serialQueue.enqueue({ databaseId: "db", rowId: "row", fieldId: "notes", value: "B" });
      const peakQueued = Math.max(...serialStates.map((state) => state.queuedCount));
      releases.shift()();
      await flush();
      releases.shift()();
      const [first, second] = await Promise.all([firstPromise, secondPromise]);
      await flush();

      const recoveryStates = [];
      const recoveryAttempts = [];
      let shouldFail = true;
      const recoveryQueue = createCellEditQueue({
        operation: async (input) => {
          recoveryAttempts.push(input.fieldId + ":" + input.value);
          if (shouldFail) {
            shouldFail = false;
            throw "raw cell failure";
          }
        },
        onStateChange: (state) => recoveryStates.push(state)
      });
      const failedPromise = recoveryQueue.enqueue({ databaseId: "db", rowId: "row", fieldId: "title", value: "failed" });
      await flush();
      const laterPromise = recoveryQueue.enqueue({ databaseId: "db", rowId: "row", fieldId: "notes", value: "queued" });
      const failure = recoveryQueue.getSnapshot();
      const retryAccepted = recoveryQueue.retry();
      const duplicateRetryIgnored = recoveryQueue.retry() === false;
      const [recoveredFirst, recoveredLater] = await Promise.all([failedPromise, laterPromise]);
      await flush();

      const discardAttempts = [];
      let discardFailure = true;
      const discardQueue = createCellEditQueue({
        operation: async (input) => {
          discardAttempts.push(input.fieldId + ":" + input.value);
          if (discardFailure) {
            discardFailure = false;
            throw new Error("discard this edit");
          }
        },
        onStateChange: () => {}
      });
      const discardedPromise = discardQueue.enqueue({ databaseId: "db", rowId: "row", fieldId: "title", value: "drop" });
      await flush();
      const keptPromise = discardQueue.enqueue({ databaseId: "db", rowId: "row", fieldId: "notes", value: "keep" });
      const discardAccepted = discardQueue.discard();
      const duplicateDiscardIgnored = discardQueue.discard() === false;
      const [discarded, kept] = await Promise.all([discardedPromise, keptPromise]);
      await flush();

      return {
        serial: {
          order: serialOrder,
          first,
          second,
          duplicate,
          peakQueued,
          maxConcurrent,
          final: serialQueue.getSnapshot()
        },
        recovery: {
          failure,
          retryAccepted,
          duplicateRetryIgnored,
          first: recoveredFirst,
          later: recoveredLater,
          attempts: recoveryAttempts,
          final: recoveryQueue.getSnapshot()
        },
        discard: {
          failed: discarded,
          later: kept,
          discardAccepted,
          duplicateDiscardIgnored,
          attempts: discardAttempts,
          final: discardQueue.getSnapshot()
        }
      };
    }

    export async function pagePropertyMutationContract() {
      const concurrentStates = [];
      const concurrentCalls = [];
      let release;
      const concurrent = createPagePropertyMutationController(
        async (input) => {
          concurrentCalls.push(input);
          await new Promise((resolve) => { release = resolve; });
        },
        (state) => concurrentStates.push(state)
      );
      const firstPromise = concurrent.submit({ tags: ["Work"] });
      const duplicate = await concurrent.submit({ url: "https://ignored.example" });
      release();
      const first = await firstPromise;

      const recoveryStates = [];
      const attempts = [];
      let fail = true;
      const recovery = createPagePropertyMutationController(
        async (input) => {
          attempts.push(input);
          if (fail) {
            fail = false;
            throw "raw page property failure";
          }
        },
        (state) => recoveryStates.push(state)
      );
      const failed = await recovery.submit({ date: "2026-08-01" });
      const failure = recoveryStates.at(-1);
      const retryPromise = recovery.retry();
      const duplicateRetry = await recovery.retry();
      const retry = await retryPromise;

      const dismissStates = [];
      const dismiss = createPagePropertyMutationController(
        async () => { throw new Error("dismiss page property failure"); },
        (state) => dismissStates.push(state)
      );
      const dismissFirst = await dismiss.submit({ url: "https://draft.example" });
      const dismissed = dismiss.dismiss();
      const duplicateDismiss = dismiss.dismiss();

      return {
        concurrent: { first, duplicate, calls: concurrentCalls, states: concurrentStates },
        recovery: {
          first: failed,
          retry,
          duplicateRetry,
          attempts,
          failure,
          final: recoveryStates.at(-1)
        },
        dismiss: {
          first: dismissFirst,
          dismissed,
          duplicateDismiss,
          final: dismissStates.at(-1)
        }
      };
    }

    export async function rowCreationContract() {
      const concurrentGuard = { current: false };
      const concurrentPending = [];
      const concurrentErrors = [];
      let operationCalls = 0;
      let releaseOperation;
      let successes = 0;
      const first = runRowCreation({
        guard: concurrentGuard,
        operation: () => {
          operationCalls += 1;
          return new Promise((resolve) => { releaseOperation = resolve; });
        },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value),
        onSuccess: () => { successes += 1; }
      });
      const secondStatus = await runRowCreation({
        guard: concurrentGuard,
        operation: async () => { operationCalls += 1; },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value),
        onSuccess: () => { successes += 1; }
      });
      releaseOperation();
      const firstStatus = await first;

      const retryGuard = { current: false };
      const failurePending = [];
      const failureErrors = [];
      let failureSuccesses = 0;
      const failureStatus = await runRowCreation({
        guard: retryGuard,
        operation: async () => { throw "raw row creation failure"; },
        onError: (message) => failureErrors.push(message),
        onPendingChange: (value) => failurePending.push(value),
        onSuccess: () => { failureSuccesses += 1; }
      });
      const failure = {
        status: failureStatus,
        error: failureErrors.at(-1),
        pending: failurePending,
        successes: failureSuccesses,
        guardReset: retryGuard.current === false
      };

      const retryPending = [];
      const retryErrors = [];
      let retrySuccesses = 0;
      const retryStatus = await runRowCreation({
        guard: retryGuard,
        operation: async () => {},
        onError: (message) => retryErrors.push(message),
        onPendingChange: (value) => retryPending.push(value),
        onSuccess: () => { retrySuccesses += 1; }
      });
      return {
        concurrent: {
          operationCalls,
          firstStatus,
          secondStatus,
          pending: concurrentPending,
          errors: concurrentErrors,
          successes
        },
        failure,
        retry: {
          status: retryStatus,
          errors: retryErrors,
          pending: retryPending,
          successes: retrySuccesses
        },
        blocked: {
          idle: rowCreationControlsBlocked(false, ""),
          pending: rowCreationControlsBlocked(true, ""),
          recovery: rowCreationControlsBlocked(false, "failed")
        }
      };
    }

    export async function fieldSettingsActionContract() {
      let closeCalls = 0;
      const dismissal = {
        pending: dismissFieldSettingsIfIdle({ current: true }, () => { closeCalls += 1; }),
        idle: dismissFieldSettingsIfIdle({ current: false }, () => { closeCalls += 1; }),
        closeCalls
      };

      const concurrentGuard = { current: false };
      const concurrentPending = [];
      const concurrentErrors = [];
      let operationCalls = 0;
      let releaseOperation;
      let successes = 0;
      const first = runFieldSettingsAction({
        guard: concurrentGuard,
        operation: () => {
          operationCalls += 1;
          return new Promise((resolve) => { releaseOperation = resolve; });
        },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value),
        onSuccess: () => { successes += 1; }
      });
      const secondStatus = await runFieldSettingsAction({
        guard: concurrentGuard,
        operation: async () => { operationCalls += 1; },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value),
        onSuccess: () => { successes += 1; }
      });
      releaseOperation();
      const firstStatus = await first;

      const retryGuard = { current: false };
      const failurePending = [];
      const failureErrors = [];
      let failureSuccesses = 0;
      const failureStatus = await runFieldSettingsAction({
        guard: retryGuard,
        operation: async () => { throw "raw field settings failure"; },
        onError: (message) => failureErrors.push(message),
        onPendingChange: (value) => failurePending.push(value),
        onSuccess: () => { failureSuccesses += 1; }
      });
      const failure = {
        status: failureStatus,
        error: failureErrors.at(-1),
        pending: failurePending,
        successes: failureSuccesses,
        guardReset: retryGuard.current === false
      };

      const retryPending = [];
      const retryErrors = [];
      let retrySuccesses = 0;
      const retryStatus = await runFieldSettingsAction({
        guard: retryGuard,
        operation: async () => {},
        onError: (message) => retryErrors.push(message),
        onPendingChange: (value) => retryPending.push(value),
        onSuccess: () => { retrySuccesses += 1; }
      });

      return {
        hydration: {
          failedSameField: shouldHydrateFieldSettingsDraft("field-a", "field-a", true),
          idleSameField: shouldHydrateFieldSettingsDraft("field-a", "field-a", false),
          switchedField: shouldHydrateFieldSettingsDraft("field-a", "field-b", true)
        },
        dismissal,
        concurrent: {
          operationCalls,
          firstStatus,
          secondStatus,
          pending: concurrentPending,
          errors: concurrentErrors,
          successes
        },
        failure,
        retry: {
          status: retryStatus,
          errors: retryErrors,
          pending: retryPending,
          successes: retrySuccesses
        }
      };
    }

    export function renderFormulaFieldSettingsDialog() {
      const fields = [
        { id: "id", name: "ID", type: "id", system: true },
        { id: "created_time", name: "Created time", type: "created_time", system: true },
        { id: "updated_time", name: "Updated time", type: "updated_time", system: true },
        { id: "sku", name: "SKU", type: "text" },
        { id: "quantity", name: "Quantity", type: "number" },
        { id: "unit_price", name: "Unit price", type: "number" },
        { id: "line_total", name: "Line total", type: "formula", formula: "=LOOKUP(FIELD(\"sku\"),\"sku\",\"unit_price\",1,3)*quantity" }
      ];
      return renderWithDefaultFieldTypes(
        React.createElement(FieldSettingsDialog, {
          field: fields.at(-1),
          fields,
          records: [{ id: "row_1", sku: "DESK", quantity: 2, unit_price: 149 }],
          onClose: () => {},
          onSave: async () => {}
        })
      );
    }

    export function renderSystemFieldSettingsDialog() {
      return renderWithDefaultFieldTypes(
        React.createElement(FieldSettingsDialog, {
          field: { id: "notion_original_html", name: "Original Notion HTML", type: "url", system: true },
          onClose: () => {},
          onSave: async () => {}
        })
      );
    }

    export function renderSelectFieldSettingsDialog() {
      return renderWithDefaultFieldTypes(
        React.createElement(FieldSettingsDialog, {
          field: {
            id: "status",
            name: "Status",
            type: "select",
            options: [
              { id: "opt_todo", name: "Todo", color: "yellow" },
              { id: "opt_done", name: "Done", color: "green" }
            ]
          },
          onClose: () => {},
          onSave: async () => {}
        })
      );
    }

    export function renderUrlCell() {
      return renderWithDefaultFieldTypes(
        React.createElement(Cell, {
          field: { id: "source_url", name: "URL", type: "url" },
          value: "https://example.com/research",
          wrap: false,
          record: { id: "row_url", title: "URL Row" },
          databaseId: "db_cells",
          onChange: () => {},
          onOptionsChange: () => {}
        })
      );
    }

    export function renderTitleCell() {
      return renderWithDefaultFieldTypes(
        React.createElement(Cell, {
          field: { id: "title", name: "Name", type: "text" },
          value: "Visible Title",
          wrap: false,
          record: { id: "row_title", title: "Visible Title", row_icon: "emoji:📝" },
          databaseId: "db_cells",
          onChange: () => {},
          onOptionsChange: () => {},
          onOpenRowPage: () => {}
        })
      );
    }

    export function renderFormulaCell() {
      return renderWithDefaultFieldTypes(
        React.createElement(Cell, {
          field: { id: "formula_total", name: "Formula Total", type: "formula" },
          value: "42",
          wrap: false,
          record: { id: "row_formula", title: "Formula Row" },
          databaseId: "db_cells",
          onChange: () => {},
          onOptionsChange: () => {}
        })
      );
    }

    export function renderFilterPopoverContent() {
      return renderToStaticMarkup(
        React.createElement(FilterPopoverContent, {
          fields: makePopoverFields(),
          view: {
            id: "view_filter",
            name: "Filtered",
            type: "table",
            filters: [
              { fieldId: "title", operator: "contains", value: "alpha" },
              { fieldId: "score", operator: "gt", value: 7 },
              { fieldId: "done", operator: "checked", value: true },
              { fieldId: "relation", operator: "contains", value: "row_42" }
            ]
          },
          anchor: { left: 6, top: 64 },
          onChange: async () => {}
        })
      );
    }

    export function renderFilterPopoverContentEmpty() {
      return renderToStaticMarkup(
        React.createElement(FilterPopoverContent, {
          fields: makePopoverFields(),
          view: { id: "view_filter_empty", name: "No filters", type: "table", filters: [] },
          anchor: { left: 20, top: 72 },
          onChange: async () => {}
        })
      );
    }

    export function renderSortPopoverContent() {
      return renderToStaticMarkup(
        React.createElement(SortPopoverContent, {
          fields: makePopoverFields(),
          view: {
            id: "view_sort",
            name: "Sorted",
            type: "table",
            sorts: [
              { fieldId: "title", direction: "asc" },
              { fieldId: "score", direction: "desc" }
            ]
          },
          anchor: { left: 6, top: 80 },
          onChange: async () => {}
        })
      );
    }

    export function renderSortPopoverContentEmpty() {
      return renderToStaticMarkup(
        React.createElement(SortPopoverContent, {
          fields: makePopoverFields(),
          view: { id: "view_sort_empty", name: "No sorts", type: "table", sorts: [] },
          anchor: { left: 20, top: 88 },
          onChange: async () => {}
        })
      );
    }

    export function renderSortPopoverContentDisabled() {
      const fields = makePopoverFields().slice(0, 2);
      return renderToStaticMarkup(
        React.createElement(SortPopoverContent, {
          fields,
          view: {
            id: "view_sort_disabled",
            name: "All sorted",
            type: "table",
            sorts: [
              { fieldId: "title", direction: "asc" },
              { fieldId: "score", direction: "desc" }
            ]
          },
          anchor: { left: 20, top: 96 },
          onChange: async () => {}
        })
      );
    }

    function withSearchLocale(locale, child) {
      return React.createElement(I18nValueProvider, {
        value: { locale, t: (key) => key, setLocale() {} }
      }, child);
    }

    export function renderGlobalSearchPanelContentRecent() {
      return renderToStaticMarkup(
        withSearchLocale("zh", React.createElement(GlobalSearchPanelContent, {
          pattern: "",
          trimmedPattern: "",
          loading: false,
          flatItems: [...makeRecentSearchItems(), ...makeTagSearchItems(), ...makeDefaultCommandSearchItems()],
          filteredItemsLength: 6,
          totalSearchHitCount: 0,
          resultTruncated: false,
          hasMore: false,
          activeIndex: 1,
          activeMatchFilter: "all",
          activeSortMode: "relevance",
          commandHitsLength: 2,
          tagHitsLength: 1,
          typeCounts: makeSearchTypeCounts(),
          onPatternChange: () => {},
          onKeyDown: () => {},
          onSelectMatchFilter: () => {},
          onSelectSortMode: () => {},
          onActivateItem: () => {},
          onHoverItem: () => {},
          onLoadMore: () => {},
          onBackdropClick: () => {}
        }))
      );
    }

    export function renderGlobalSearchPanelContentResults() {
      return renderToStaticMarkup(
        withSearchLocale("zh", React.createElement(GlobalSearchPanelContent, {
          pattern: "uber",
          trimmedPattern: "uber",
          loading: false,
          flatItems: makeSearchResultItems(),
          filteredItemsLength: 24,
          totalSearchHitCount: 3,
          resultTruncated: true,
          hasMore: true,
          activeIndex: 0,
          activeMatchFilter: "all",
          activeSortMode: "relevance",
          commandHitsLength: 21,
          tagHitsLength: 0,
          typeCounts: makeSearchTypeCounts({ title: 1, content: 1, reference: 0, database: 1 }),
          onPatternChange: () => {},
          onKeyDown: () => {},
          onSelectMatchFilter: () => {},
          onSelectSortMode: () => {},
          onActivateItem: () => {},
          onHoverItem: () => {},
          onLoadMore: () => {},
          onBackdropClick: () => {}
        }))
      );
    }

    export function renderGlobalSearchPanelContentLoading() {
      return renderToStaticMarkup(
        withSearchLocale("zh", React.createElement(GlobalSearchPanelContent, {
          pattern: "uber",
          trimmedPattern: "uber",
          loading: true,
          flatItems: [],
          filteredItemsLength: 0,
          totalSearchHitCount: 0,
          resultTruncated: false,
          hasMore: false,
          activeIndex: 0,
          activeMatchFilter: "all",
          activeSortMode: "relevance",
          commandHitsLength: 0,
          tagHitsLength: 0,
          typeCounts: makeSearchTypeCounts(),
          onPatternChange: () => {},
          onKeyDown: () => {},
          onSelectMatchFilter: () => {},
          onSelectSortMode: () => {},
          onActivateItem: () => {},
          onHoverItem: () => {},
          onLoadMore: () => {},
          onBackdropClick: () => {}
        }))
      );
    }

    export function renderGlobalSearchPanelContentEmpty() {
      return renderToStaticMarkup(
        withSearchLocale("zh", React.createElement(GlobalSearchPanelContent, {
          pattern: "missing",
          trimmedPattern: "missing",
          loading: false,
          flatItems: [],
          filteredItemsLength: 0,
          totalSearchHitCount: 0,
          resultTruncated: false,
          hasMore: false,
          activeIndex: 0,
          activeMatchFilter: "all",
          activeSortMode: "relevance",
          commandHitsLength: 0,
          tagHitsLength: 0,
          typeCounts: makeSearchTypeCounts(),
          onPatternChange: () => {},
          onKeyDown: () => {},
          onSelectMatchFilter: () => {},
          onSelectSortMode: () => {},
          onActivateItem: () => {},
          onHoverItem: () => {},
          onLoadMore: () => {},
          onBackdropClick: () => {}
        }))
      );
    }

    export function renderGlobalSearchPanelContentEnglish() {
      return renderToStaticMarkup(
        withSearchLocale("en", React.createElement(GlobalSearchPanelContent, {
          pattern: "open",
          trimmedPattern: "open",
          loading: false,
          flatItems: makeSearchResultItems().slice(0, 2),
          filteredItemsLength: 2,
          totalSearchHitCount: 0,
          resultTruncated: false,
          hasMore: false,
          activeIndex: 0,
          activeMatchFilter: "all",
          activeSortMode: "relevance",
          commandHitsLength: 2,
          tagHitsLength: 0,
          typeCounts: makeSearchTypeCounts(),
          onPatternChange: () => {},
          onKeyDown: () => {},
          onSelectMatchFilter: () => {},
          onSelectSortMode: () => {},
          onActivateItem: () => {},
          onHoverItem: () => {},
          onLoadMore: () => {},
          onBackdropClick: () => {}
        }))
      );
    }

    export function renderSearchAiSurface() {
      return withRendererWindow(
        () =>
          renderToStaticMarkup(
            React.createElement(
              LotionActionsProvider,
              { value: makeNoopActions() },
              React.createElement(SearchAiSurface, { onClose: () => {} })
            )
          )
      );
    }

    export function searchAiSubtitleContract() {
      return {
        database: searchAiHitSubtitle({
          kind: "database",
          databaseId: "db_kb",
          databaseName: "Knowledge Base",
          entityPath: "Research / Knowledge Base",
          path: "databases/user/Knowledge_Base--db_kb/schema.json",
          line: 1,
          text: "",
          ranges: []
        }),
        row: searchAiHitSubtitle({
          kind: "row",
          databaseId: "db_kb",
          databaseName: "Knowledge Base",
          rowId: "row_orchard",
          rowTitle: "Semantic Orchard",
          pageFile: null,
          path: "databases/user/Knowledge_Base--db_kb/data.csv",
          line: 2,
          text: "",
          ranges: []
        }),
        rowPage: searchAiHitSubtitle({
          kind: "rowPage",
          databaseId: "db_kb",
          databaseName: "Knowledge Base",
          rowTitle: "Semantic Orchard",
          pageFile: "Semantic_Orchard--row_orchard.md",
          entityPath: "Research / Semantic Orchard",
          path: "databases/user/Knowledge_Base--db_kb/pages/Semantic_Orchard--row_orchard.md",
          line: 1,
          text: "",
          ranges: []
        }),
        databaseBackedPage: searchAiHitSubtitle({
          kind: "page",
          pageId: "row_orchard",
          title: "Semantic Orchard",
          databaseId: "db_kb",
          databaseName: "Knowledge Base",
          path: "databases/user/Knowledge_Base--db_kb/data.csv",
          line: 2,
          text: "",
          ranges: []
        }),
        databasePage: searchAiHitSubtitle({
          kind: "page",
          pageId: "pg_notes",
          title: "Notes",
          databaseId: "db_kb",
          databaseName: "Knowledge Base",
          entityPath: "Research / Notes",
          path: "attachments/notes.txt",
          line: 1,
          text: "",
          ranges: []
        }),
        workspacePage: searchAiHitSubtitle({
          kind: "page",
          pageId: "pg_home",
          title: "Home",
          entityPath: "Research / Home",
          path: "databases/system/pages--db_pages/pages/Home--pg_home.md",
          line: 1,
          text: "",
          ranges: []
        }),
        internalWorkspacePage: searchAiHitSubtitle({
          kind: "page",
          pageId: "pg_home",
          title: "Home",
          entityPath: "databases/system/pages--db_pages/pages/Home--pg_home.md",
          path: "databases/system/pages--db_pages/pages/Home--pg_home.md",
          line: 1,
          text: "",
          ranges: []
        })
      };
    }

    export function renderViewSettingsDialog() {
      return renderWithDefaultFieldTypes(
        React.createElement(ViewSettingsDialog, {
          view: {
            id: "view_kanban",
            name: "Team board",
            type: "kanban_plus",
            visibleFieldIds: ["title", "status", "notes"],
            fieldOrder: ["status", "title", "notes", "hidden"],
            sorts: [{ fieldId: "title", direction: "asc" }],
            filters: [{ fieldId: "status", operator: "contains", value: "Doing" }],
            defaultTemplateId: "tpl_daily",
            pageSize: 50,
            config: {
              groupField: "status",
              density: "compact",
              showEmpty: true,
              cardLimit: 20,
              note: "Pinned board note"
            }
          },
          fields: [
            { id: "title", name: "Name", type: "text" },
            { id: "status", name: "Status", type: "select", options: [{ id: "doing", name: "Doing", color: "blue" }] },
            { id: "notes", name: "Notes", type: "text" },
            { id: "hidden", name: "Hidden Internal", type: "text", hidden: true }
          ],
          templates: [
            { id: "tpl_daily", name: "Daily template", values: { title: "Daily" } },
            { id: "tpl_blank", name: "Blank template", values: { title: "Blank" } }
          ],
          viewProviders: [
            {
              type: "kanban_plus",
              label: "Kanban Plus",
              icon: "🧩",
              configSchema: {
                groupField: { type: "field-ref", label: "Group field", fieldKind: "select" },
                density: {
                  type: "select",
                  label: "Board density",
                  default: "comfortable",
                  options: [
                    { value: "comfortable", label: "Comfortable" },
                    { value: "compact", label: "Compact" }
                  ]
                },
                showEmpty: { type: "boolean", label: "Show empty groups", default: true },
                cardLimit: { type: "number", label: "Card limit", default: 20, min: 1, max: 100 },
                note: { type: "text", label: "Board note", default: "Pinned board note" }
              },
              render() {}
            }
          ],
          canDelete: true,
          isDefault: false,
          onClose: () => {},
          onSave: async () => {},
          onDuplicate: async () => {},
          onDelete: async () => {},
          onSetDefault: async () => {}
        })
      );
    }

    export function renderRowTemplateDialog() {
      return renderWithDefaultFieldTypes(
        React.createElement(RowTemplateDialog, {
          schema: {
            id: "db_templates",
            name: "Template Database",
            created_time: "2026-01-01T00:00:00.000Z",
            updated_time: "2026-01-01T00:00:00.000Z",
            defaultViewId: "view_default",
            fields: [
              { id: "title", name: "Name", type: "text" },
              { id: "score", name: "Score", type: "number" },
              { id: "due", name: "Due", type: "date" },
              { id: "done", name: "Done", type: "checkbox" },
              { id: "status", name: "Status", type: "select", options: [{ id: "doing", name: "Doing", color: "blue" }] },
              { id: "system", name: "System Field", type: "text", system: true },
              { id: "hidden", name: "Hidden Field", type: "text", hidden: true },
              { id: "formula", name: "Formula Field", type: "formula" },
              { id: "rollup", name: "Rollup Field", type: "rollup" }
            ],
            templates: [
              {
                id: "tpl_daily",
                name: "Daily review",
                values: {
                  title: "Daily title",
                  score: 7,
                  due: "2026-06-12",
                  done: true,
                  status: "Doing"
                },
                markdown: "Daily body note",
                fullWidth: true
              }
            ]
          },
          onClose: () => {},
          onSave: async () => {},
          onDelete: async () => {}
        })
      );
    }

    export function renderSlashMenuContent() {
      return renderToStaticMarkup(
        React.createElement(SlashMenuContent, {
          style: { left: 12, top: 24 },
          items: makeSlashMenuCommands(),
          active: 1,
          onHover: () => {},
          onPick: () => {}
        })
      );
    }

    export function renderSlashMenuContentZh() {
      return renderToStaticMarkup(
        React.createElement(I18nValueProvider, {
          value: { locale: "zh", setLocale: () => {}, t: (key) => key }
        }, React.createElement(SlashMenuContent, {
          style: { left: 12, top: 24 },
          items: makeSlashMenuCommands(),
          active: 1,
          onHover: () => {},
          onPick: () => {}
        }))
      );
    }

    export function renderSlashMenuContentEmpty() {
      return renderToStaticMarkup(
        React.createElement(SlashMenuContent, {
          style: { left: 16, top: 32 },
          items: [],
          active: 0,
          onHover: () => {},
          onPick: () => {}
        })
      );
    }

    export function renderSlashMenuContentEmptyZh() {
      return renderToStaticMarkup(
        React.createElement(I18nValueProvider, {
          value: { locale: "zh", setLocale: () => {}, t: (key) => key }
        }, React.createElement(SlashMenuContent, {
          style: { left: 16, top: 32 },
          items: [],
          active: 0,
          onHover: () => {},
          onPick: () => {}
        }))
      );
    }

    export function renderWidgetMarkdownFormatting() {
      return __testRenderWidgetMarkdown([
        "> **从现在开始，承诺要留意一切触动你的事情。记下一切激励你的事情。那就是你的控制面板。那些按钮控制着你整个个人动力系统。  ",
        "> **",
        "",
        "> *斜体触发  ",
        "> *",
        "",
        '\`inline code\` [link](https://example.com) <span data-lotion-bg="yellow">highlight</span>'
      ].join(String.fromCharCode(10)));
    }

    export function renderTabStrip() {
      return renderToStaticMarkup(
        React.createElement(
          DatabaseCacheValueProvider,
          { value: makeTabStripDatabaseCache() },
          React.createElement(TabStrip, {
            tabs: [
              { id: "tab_page", item: { type: "page", id: "pg_home" } },
              { id: "tab_database", item: { type: "database", id: "db_daily" } },
              { id: "tab_row", item: { type: "row_page", databaseId: "db_daily", rowId: "row_today", title: "Fallback row title" } },
              { id: "tab_manage", item: { type: "manage", kind: "pages" } },
              { id: "tab_blank" },
              { id: "tab_startup", item: { type: "startup", returnTabId: "tab_row" } }
            ],
            activeIndex: 2,
            state: makeTabStripState(),
            onSwitch: () => {},
            onClose: () => {},
            onNew: () => {},
            onReorder: () => {},
            onMoveToNewWindow: () => {}
          })
        )
      );
    }

    export function renderBackupButton() {
      return renderToStaticMarkup(React.createElement(BackupButton));
    }

    export function renderSearchBox() {
      return renderToStaticMarkup(React.createElement(SearchBox, { onOpen: () => {} }));
    }

    export function renderSidebarShell() {
      const context = installRendererTestPlugin();
      try {
        return withRendererWindow(() =>
          renderToStaticMarkup(
            React.createElement(
              SettingsProvider,
              null,
              React.createElement(
                DatabaseCacheValueProvider,
                { value: makeManagementDatabaseCache() },
                React.createElement(
                  LotionActionsProvider,
                  { value: makeNoopActions() },
                  React.createElement(Sidebar, {
                    state: makeSidebarState(),
                    onOpenSearch: () => {},
                    onReordered: () => {}
                  })
                )
              )
            )
          )
        );
      } finally {
        context.disposeAll();
      }
    }

    export function renderSidebarPageContextMenu() {
      const page = makeSidebarState().pages.find((item) => item.id === "pg_plan");
      return renderToStaticMarkup(
        React.createElement(
          SettingsProvider,
          null,
          React.createElement(SidebarPageContextMenuView, {
            page,
            left: 12,
            top: 24,
            onOpen: () => {},
            onCreateChild: () => {},
            onDelete: () => {}
          })
        )
      );
    }

    export function renderShortcutSettings() {
      return withRendererWindow(() =>
        renderToStaticMarkup(
          React.createElement(
            SettingsProvider,
            null,
            React.createElement(ShortcutSettings)
          )
        )
      );
    }

    export function renderStandaloneDatabaseHeader() {
      return renderToStaticMarkup(
        React.createElement(StandaloneDatabaseHeader, {
          bundle: makeDatabaseChromeBundle(),
          onPickIcon: () => {},
          onPickCover: () => {},
          onClearCover: () => {},
          onCommitCoverOffset: () => {},
          onOpenInNewWindow: () => {}
        })
      );
    }

    export function renderEmbeddedDatabaseHeader() {
      const bundle = makeDatabaseChromeBundle();
      return renderToStaticMarkup(
        React.createElement(EmbeddedDatabaseHeader, {
          bundle,
          title: "Inline Tasks",
          activeView: bundle.views[0],
          activeViewTypeLabel: "Table",
          viewActions: React.createElement("div", { "data-testid": "embedded-actions" }, "Toolbar actions"),
          refreshing: false,
          onOpen: () => {},
          onRefresh: () => {},
          onOpenSettings: () => {}
        })
      );
    }

    export function renderEmbeddedViewRendererCached() {
      return renderEmbeddedViewRenderer({ databaseId: "db_chrome", viewId: "view_all", cached: true });
    }

    export function renderEmbeddedViewRendererLoading() {
      return renderEmbeddedViewRenderer({ databaseId: "db_missing", viewId: "view_missing", cached: false });
    }

    function renderEmbeddedViewRenderer({ databaseId, viewId, cached }) {
      const registration = installDefaultFieldTypes(
        new PluginContextImpl(pluginHost, defaultFieldTypesManifest, new InMemoryPluginSettings())
      );
      try {
        return withRendererWindow(() =>
          renderToStaticMarkup(
            React.createElement(
              SettingsProvider,
              null,
              React.createElement(
                DatabaseCacheValueProvider,
                { value: makeEmbeddedViewDatabaseCache(cached) },
                React.createElement(
                  LotionActionsProvider,
                  { value: makeNoopActions() },
                  React.createElement(EmbeddedViewRenderer, { databaseId, viewId })
                )
              )
            )
          )
        );
      } finally {
        registration.dispose();
      }
    }

    export function renderDatabaseViewTabsBar() {
      const bundle = makeDatabaseChromeBundle();
      const pluginProvider = { type: "kanban_plus", label: "Kanban Plus", icon: "🧩", render() {} };
      return renderToStaticMarkup(
        React.createElement(DatabaseViewTabsBar, {
          views: bundle.views,
          activeView: bundle.views[0],
          embedded: false,
          viewActions: React.createElement("div", { "data-testid": "tabs-actions" }, "Table toolbar"),
          getProvider: (type) => type === "kanban_plus" ? pluginProvider : undefined,
          onSelectView: () => {},
          onCreateView: () => {},
          onReorderViews: async () => {},
          onOpenViewMenu: () => {}
        })
      );
    }

    export async function viewOrderMutationContract() {
      const concurrentGuard = { current: false };
      const concurrentPending = [];
      const concurrentErrors = [];
      let operationCalls = 0;
      let releaseOperation;
      let successes = 0;
      const first = runViewOrderMutation({
        guard: concurrentGuard,
        operation: () => {
          operationCalls += 1;
          return new Promise((resolve) => { releaseOperation = resolve; });
        },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value),
        onSuccess: () => { successes += 1; }
      });
      const secondStatus = await runViewOrderMutation({
        guard: concurrentGuard,
        operation: async () => { operationCalls += 1; },
        onError: (message) => concurrentErrors.push(message),
        onPendingChange: (value) => concurrentPending.push(value),
        onSuccess: () => { successes += 1; }
      });
      releaseOperation();
      const firstStatus = await first;

      const retryGuard = { current: false };
      const failurePending = [];
      const failureErrors = [];
      let failureSuccesses = 0;
      const failureStatus = await runViewOrderMutation({
        guard: retryGuard,
        operation: async () => { throw "raw view reorder failure"; },
        onError: (message) => failureErrors.push(message),
        onPendingChange: (value) => failurePending.push(value),
        onSuccess: () => { failureSuccesses += 1; }
      });

      const retryPending = [];
      const retryErrors = [];
      let retrySuccesses = 0;
      const retryStatus = await runViewOrderMutation({
        guard: retryGuard,
        operation: async () => {},
        onError: (message) => retryErrors.push(message),
        onPendingChange: (value) => retryPending.push(value),
        onSuccess: () => { retrySuccesses += 1; }
      });
      let typedError = "";
      await runViewOrderMutation({
        guard: { current: false },
        operation: async () => { throw new Error("typed view reorder failure"); },
        onError: (message) => { typedError = message; },
        onPendingChange: () => {},
        onSuccess: () => {}
      });

      return {
        concurrent: {
          operationCalls,
          firstStatus,
          secondStatus,
          pending: concurrentPending,
          errors: concurrentErrors,
          successes
        },
        failure: {
          status: failureStatus,
          error: failureErrors.at(-1),
          pending: failurePending,
          successes: failureSuccesses,
          guardReset: retryGuard.current === false
        },
        retry: {
          status: retryStatus,
          errors: retryErrors,
          pending: retryPending,
          successes: retrySuccesses
        },
        blocked: {
          idle: viewOrderControlsBlocked(false, false),
          pending: viewOrderControlsBlocked(true, false),
          recovery: viewOrderControlsBlocked(false, true)
        },
        typedError
      };
    }

    export function renderFieldTypeIcons() {
      return renderToStaticMarkup(
        React.createElement(
          "div",
          null,
          React.createElement("span", { "data-testid": "field-title" }, React.createElement(FieldTypeIcon, { type: "text", isTitle: true })),
          React.createElement("span", { "data-testid": "field-text" }, React.createElement(FieldTypeIcon, { type: "text" })),
          React.createElement("span", { "data-testid": "field-number" }, React.createElement(FieldTypeIcon, { type: "number" })),
          React.createElement("span", { "data-testid": "field-formula" }, React.createElement(FieldTypeIcon, { type: "formula" })),
          React.createElement("span", { "data-testid": "field-id" }, React.createElement(FieldTypeIcon, { type: "id" })),
          React.createElement("span", { "data-testid": "field-select" }, React.createElement(FieldTypeIcon, { type: "select" })),
          React.createElement("span", { "data-testid": "field-multi" }, React.createElement(FieldTypeIcon, { type: "multi_select" })),
          React.createElement("span", { "data-testid": "field-date" }, React.createElement(FieldTypeIcon, { type: "date" })),
          React.createElement("span", { "data-testid": "field-url" }, React.createElement(FieldTypeIcon, { type: "url" })),
          React.createElement("span", { "data-testid": "field-checkbox" }, React.createElement(FieldTypeIcon, { type: "checkbox" })),
          React.createElement("span", { "data-testid": "field-created" }, React.createElement(FieldTypeIcon, { type: "created_time" })),
          React.createElement("span", { "data-testid": "field-unknown" }, React.createElement(FieldTypeIcon, { type: "future_type" }))
        )
      );
    }

    export async function renderKanbanProviderVisual() {
      let provider;
      const registration = installKanbanView({
        views: {
          register(nextProvider) {
            provider = nextProvider;
            return { dispose() {} };
          }
        }
      });
      const previousDocument = globalThis.document;
      globalThis.document = {
        createElement(tagName) {
          return new RendererTestElement(tagName);
        }
      };
      try {
        const container = new RendererTestElement("div");
        const bundle = {
          schema: {
            id: "db_kanban_visual",
            fields: [
              { id: "title", name: "Name", type: "text", system: false, hidden: false },
              {
                id: "status",
                name: "Status",
                type: "select",
                system: false,
                hidden: false,
                options: [
                  { id: "todo", name: "Todo", color: "blue" },
                  { id: "done", name: "Done", color: "green" }
                ]
              },
              { id: "owner", name: "Owner", type: "text", system: false, hidden: false },
              {
                id: "tags",
                name: "Tags",
                type: "multi_select",
                system: false,
                hidden: false,
                options: [
                  { id: "done_tag", name: "Done", color: "green" },
                  { id: "focus_tag", name: "Focus", color: "blue" }
                ]
              }
            ]
          },
          records: [
            { id: "row_todo", title: "Design visual system", status: "Todo", owner: "Ada", tags: "Focus" },
            { id: "row_done", title: "Tokenize plugin UI", status: "Done", owner: "Grace", tags: "Done" }
          ]
        };
        let openedRowId = "";
        let addCalls = 0;
        const addInputs = [];
        const workspace = {
          addRow: async (_databaseId, initialValues) => {
            addCalls += 1;
            addInputs.push(initialValues);
            if (addCalls === 1) throw "raw Kanban row failure";
            return bundle;
          },
          updateCell: async () => bundle
        };
        provider.render({
          bundle,
          view: { id: "view_kanban", type: "kanban", name: "Kanban", config: { groupBy: "status" } },
          container,
          openRow: (rowId) => { openedRowId = rowId; },
          workspace
        });
        const firstColumn = container.querySelector(".kanban-col");
        container.querySelector(".kanban-card")?.listeners.click?.[0]?.({});
        const dragover = firstColumn?.listeners.dragover?.[0];
        if (dragover) {
          dragover({
            preventDefault() {},
            dataTransfer: { dropEffect: "" }
          });
        }
        const addButton = firstColumn?.querySelector(".kanban-add-card");
        addButton?.listeners.click?.[0]?.({});
        addButton?.listeners.click?.[0]?.({});
        await Promise.resolve();
        await Promise.resolve();
        const feedback = firstColumn?.querySelector(".kanban-add-card-error");
        const error = feedback?.children[0]?.textContent ?? "";
        const duplicateSubmitSuppressed = addCalls === 1;
        const addDisabledDuringRecovery = addButton?.disabled === true;
        feedback?.children[1]?.listeners.click?.[0]?.({});
        await Promise.resolve();
        await Promise.resolve();
        return {
          html: container.toHtml(),
          dropOutline: firstColumn?.style.outline ?? "",
          groupPillStyle: container.querySelector(".kanban-groupbar")?.children[1]?.style.cssText ?? "",
          cardStyle: container.querySelector(".kanban-card")?.style.cssText ?? "",
          openedRowId,
          rowCreationRecovery: {
            addCalls,
            duplicateSubmitSuppressed,
            error,
            addDisabledDuringRecovery,
            retryClearedError: feedback?.hidden === true,
            initialValues: addInputs[0]
          }
        };
      } finally {
        registration.dispose();
        if (previousDocument === undefined) {
          delete globalThis.document;
        } else {
          globalThis.document = previousDocument;
        }
      }
    }

    export function renderDefaultFieldProviders() {
      const host = new PluginHost({
        workspace: makeNoopWorkspace(),
        ui: {
          notify: () => {},
          confirm: async () => true,
          openUrl: async () => {},
          openEntity: () => {}
        }
      });
      const registration = installDefaultFieldTypes(
        new PluginContextImpl(host, defaultFieldTypesManifest, new InMemoryPluginSettings())
      );
      try {
        const cases = [
          { type: "text", value: "Wrapped note", field: { wrap: true } },
          { type: "person", value: "Ada Lovelace" },
          { type: "number", value: 42.5 },
          { type: "select", value: "Done", field: { options: makeDefaultOptions() } },
          { type: "multi_select", value: "Work;Life", field: { options: makeDefaultOptions() } },
          { type: "date", value: "2026-06-12", field: { dateFormat: "YYYY/MM/DD" } },
          { type: "url", value: "https://example.com/note" },
          {
            type: "entity_ref",
            value: JSON.stringify([
              { kind: "page", entityId: "pg_linked", titleSnapshot: "Linked Page" },
              { kind: "database", entityId: "db_linked", titleSnapshot: "Linked Database" }
            ])
          },
          { type: "checkbox", value: true },
          { type: "formula", value: "SUM(A1:A3)" },
          { type: "rollup", value: 7 }
        ];
        return renderToStaticMarkup(
          React.createElement(
            "div",
            { "data-testid": "default-field-provider-grid" },
            cases.map((item) => React.createElement(
              "section",
              {
                key: item.type,
                className: "default-provider-case",
                "data-testid": "provider-" + item.type
              },
              React.createElement("h4", null, item.type),
              renderDefaultFieldProvider(host, item.type, item.value, item.field)
            ))
          )
        );
      } finally {
        registration.dispose();
      }
    }

    export function renderViewTypeIcons() {
      return renderToStaticMarkup(
        React.createElement(
          "div",
          null,
          React.createElement("span", { "data-testid": "view-table" }, React.createElement(ViewTypeIcon, { type: "table" })),
          React.createElement("span", { "data-testid": "view-list" }, React.createElement(ViewTypeIcon, { type: "list" })),
          React.createElement("span", { "data-testid": "view-calendar" }, React.createElement(ViewTypeIcon, { type: "calendar" })),
          React.createElement("span", { "data-testid": "view-gallery" }, React.createElement(ViewTypeIcon, { type: "gallery" })),
          React.createElement("span", { "data-testid": "view-kanban" }, React.createElement(ViewTypeIcon, { type: "kanban" })),
          React.createElement("span", { "data-testid": "view-provider" }, React.createElement(ViewTypeIcon, { type: "kanban_plus", providerIcon: "🧩" }))
        )
      );
    }

    export function renderEntityIcons() {
      return renderToStaticMarkup(
        React.createElement(
          "div",
          null,
          React.createElement("span", { "data-testid": "entity-page" }, React.createElement(EntityIcon, { kind: "page", size: 18, className: "custom-entity" })),
          React.createElement("span", { "data-testid": "entity-database" }, React.createElement(EntityIcon, { kind: "database", size: 18 })),
          React.createElement("span", { "data-testid": "entity-row" }, React.createElement(EntityIcon, { kind: "row_page", size: 18 })),
          React.createElement("span", { "data-testid": "entity-workspace" }, React.createElement(EntityIcon, { kind: "workspace", size: 18 })),
          React.createElement("span", { "data-testid": "entity-emoji" }, React.createElement(EntityIcon, { kind: "page", icon: "emoji:📌", size: 18 })),
          React.createElement("span", { "data-testid": "entity-image" }, React.createElement(EntityIcon, { kind: "page", icon: "attachments/icons/Page Icon.png", size: 20 }))
        )
      );
    }

    export function renderWorkspaceSelector() {
      return renderToStaticMarkup(
        React.createElement(WorkspaceSelector, {
          currentName: "Import Notion",
          currentIcon: "emoji:🟩",
          onImportNotion: () => {},
          onWorkspaceIconChanged: () => {}
        })
      );
    }

    export function renderCoverArea() {
      return renderToStaticMarkup(
        React.createElement(CoverArea, {
          src: "attachments/covers/Daily Review.png",
          offset: 35,
          onChangeImage: () => {},
          onClear: () => {},
          onCommitOffset: () => {}
        })
      );
    }

    export function renderDesignSystemLab() {
      return renderToStaticMarkup(
        React.createElement(SettingsProvider, null, React.createElement(DesignSystemLab))
      );
    }

    export function renderDatabaseProperties() {
      return renderWithDefaultFieldTypes(
        React.createElement(DatabaseProperties, {
          tags: ["finance", "import"],
          onChangeTags: () => {}
        })
      );
    }

    export function renderManagementDatabasesView() {
      return renderToStaticMarkup(
        React.createElement(
          LotionActionsProvider,
          { value: makeNoopActions() },
          React.createElement(ManagementView, {
            kind: "databases",
            pages: makeManagementPages(),
            databases: makeManagementDatabases(),
            recents: makeManagementRecents()
          })
        )
      );
    }

    export function renderManagementPagesView() {
      return renderToStaticMarkup(
        React.createElement(
          LotionActionsProvider,
          { value: makeNoopActions() },
          React.createElement(ManagementView, {
            kind: "pages",
            pages: makeManagementPages(),
            databases: makeManagementDatabases(),
            recents: makeManagementRecents()
          })
        )
      );
    }

    export function renderManagementRecentView() {
      return renderToStaticMarkup(
        React.createElement(
          DatabaseCacheValueProvider,
          { value: makeManagementDatabaseCache() },
          React.createElement(
            LotionActionsProvider,
            { value: makeNoopActions() },
            React.createElement(ManagementView, {
              kind: "recent",
              pages: makeManagementPages(),
              databases: makeManagementDatabases(),
              recents: makeManagementRecents()
            })
          )
        )
      );
    }

    export function renderManagementFavoritesView() {
      return renderToStaticMarkup(
        React.createElement(
          DatabaseCacheValueProvider,
          { value: makeManagementDatabaseCache() },
          React.createElement(
            LotionActionsProvider,
            { value: makeNoopActions() },
            React.createElement(ManagementView, {
              kind: "favorites",
              pages: makeManagementPages(),
              databases: makeManagementDatabases(),
              favorites: makeManagementFavorites(),
              recents: makeManagementRecents()
            })
          )
        )
      );
    }

    export function renderManagementTagView() {
      return renderToStaticMarkup(
        React.createElement(
          LotionActionsProvider,
          { value: makeNoopActions() },
          React.createElement(ManagementView, {
            kind: "tag:Focus",
            pages: makeManagementPages(),
            databases: makeManagementDatabases(),
            recents: makeManagementRecents()
          })
        )
      );
    }

    export function renderMenuPrimitives() {
      return renderToStaticMarkup(
        React.createElement(
          MenuSection,
          { label: "Choose scope" },
          React.createElement(MenuItem, {
            label: "View settings",
            description: "Only affects this view",
            submenu: true,
            onSelect: () => {}
          }),
          React.createElement(MenuItem, {
            label: "Edit properties",
            disabledReason: "System database structure is managed by Lotion.",
            onSelect: () => {}
          })
        )
      );
    }

    export function renderManagementPluginsView() {
      const context = installRendererTestPlugin();
      try {
        return renderToStaticMarkup(
          React.createElement(
            LotionActionsProvider,
            { value: makeNoopActions() },
            React.createElement(ManagementView, {
              kind: "plugins",
              pages: makeManagementPages(),
              databases: makeManagementDatabases(),
              recents: makeManagementRecents()
            })
          )
        );
      } finally {
        context.disposeAll();
      }
    }

    export function renderManagementPluginDetailOverview() {
      const context = installRendererTestPlugin();
      try {
        const inspection = pluginHost.inspect();
        const plugin = inspection.plugins.find((candidate) => candidate.id === "renderer-test-plugin");
        return renderToStaticMarkup(
          React.createElement(PluginDetail, {
            plugin,
            inspection,
            onBack: () => {},
            initialPanel: "overview"
          })
        );
      } finally {
        context.disposeAll();
      }
    }

    export function renderManagementPluginDetailSettings() {
      const context = installRendererTestPlugin();
      try {
        const inspection = pluginHost.inspect();
        const plugin = inspection.plugins.find((candidate) => candidate.id === "renderer-test-plugin");
        return renderToStaticMarkup(
          React.createElement(PluginDetail, {
            plugin,
            inspection,
            onBack: () => {},
            initialPanel: "settings"
          })
        );
      } finally {
        context.disposeAll();
      }
    }

    export function renderManagementSettingsCenter() {
      const contexts = installRendererSettingsCenterTestPlugins();
      try {
        return renderToStaticMarkup(
          React.createElement(
            SettingsProvider,
            null,
            React.createElement(
              LotionActionsProvider,
              { value: makeNoopActions() },
              React.createElement(ManagementView, {
                kind: "settings",
                pages: makeManagementPages(),
                databases: makeManagementDatabases(),
                recents: makeManagementRecents(),
                settingsOpenRequest: { section: "search-ai", requestId: 1 }
              })
            )
          )
        );
      } finally {
        for (const context of contexts) context.disposeAll();
      }
    }

    export function renderManagementGeneralSettingsCenter() {
      return renderToStaticMarkup(
        React.createElement(
          SettingsProvider,
          null,
          React.createElement(
            LotionActionsProvider,
            { value: makeNoopActions() },
            React.createElement(ManagementView, {
              kind: "settings",
              pages: makeManagementPages(),
              databases: makeManagementDatabases(),
              recents: makeManagementRecents(),
              settingsOpenRequest: { section: "general", requestId: 2 }
            })
          )
        )
      );
    }

    export function renderNotionAuditPanelInitial() {
      return renderToStaticMarkup(React.createElement(NotionAuditPanel));
    }

    export async function notionAuditRunContract() {
      const controller = createNotionAuditRunController();
      const calls = [];
      let resolveFirst;
      const firstResult = makeNotionPassingAuditResult();
      const first = controller.run(() => {
        calls.push("first");
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      });
      const runningDuringFirst = controller.isRunning();
      const competing = await controller.run(async () => {
        calls.push("competing");
        return makeNotionAuditResult();
      });
      resolveFirst(firstResult);
      const completed = await first;
      const runningAfterFirst = controller.isRunning();
      const failed = await controller.run(async () => {
        calls.push("failure");
        throw "audit unavailable";
      });
      const retry = await controller.run(async () => {
        calls.push("retry");
        return firstResult;
      });
      return {
        calls,
        runningDuringFirst,
        competing,
        completed,
        runningAfterFirst,
        failed,
        retry,
        runningAfterRetry: controller.isRunning()
      };
    }

    export function renderNotionAuditResult() {
      return renderToStaticMarkup(
        React.createElement(AuditResult, {
          result: makeNotionAuditResult(),
          resultRef: { current: null }
        })
      );
    }

    export function renderNotionAuditPassingResult() {
      return renderToStaticMarkup(
        React.createElement(AuditResult, {
          result: makeNotionPassingAuditResult(),
          resultRef: { current: null }
        })
      );
    }

    export function renderNotionImportPanelPick() {
      return renderToStaticMarkup(React.createElement(NotionImportPanel, { embedded: true }));
    }

    export function renderNotionImportDialogPick() {
      return renderToStaticMarkup(React.createElement(NotionImportDialog, { onClose: () => {} }));
    }

    export function renderNotionImportSettingsWithReport() {
      return withRendererWindow(() =>
        renderToStaticMarkup(
          React.createElement(NotionImportSettings, {
            initialLatestReport: {
              id: "pg_import_report",
              title: "Import report 2026-06-12",
              created_time: "2026-06-12T12:00:00.000Z",
              updated_time: "2026-06-12T12:05:00.000Z"
            }
          })
        )
      );
    }

    export function renderListBody() {
      return renderToStaticMarkup(
        React.createElement(ListBody, {
          fields: makeAlternateViewFields(),
          records: makeAlternateViewRecords(),
          onOpenRow: () => {}
        })
      );
    }

    export function renderGalleryBody() {
      return renderToStaticMarkup(
        React.createElement(GalleryBody, {
          fields: makeAlternateViewVisibleFields(),
          records: makeAlternateViewRecords(),
          view: { id: "view_gallery", name: "Gallery", type: "gallery", coverFieldId: "cover_url" },
          onOpenRow: () => {}
        })
      );
    }

    export function renderGalleryBodyEmpty() {
      return renderToStaticMarkup(
        React.createElement(GalleryBody, {
          fields: makeAlternateViewVisibleFields(),
          records: [],
          view: { id: "view_gallery", name: "Gallery", type: "gallery", coverFieldId: "cover_url" },
          onOpenRow: () => {}
        })
      );
    }

    export function renderCalendarBody() {
      const now = new Date();
      const currentMonthDate = new Date(now.getFullYear(), now.getMonth(), 12);
      const outsideMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 12);
      const records = [
        {
          id: "row_calendar",
          title: "Calendar task",
          row_icon: "emoji:📅",
          due: currentMonthDate.toISOString().slice(0, 10)
        },
        {
          id: "row_outside",
          title: "Outside month task",
          due: outsideMonthDate.toISOString().slice(0, 10)
        }
      ];
      return renderToStaticMarkup(
        React.createElement(CalendarBody, {
          fields: makeAlternateViewFields(),
          records,
          view: { id: "view_calendar", name: "Calendar", type: "calendar", dateFieldId: "due" },
          onOpenRow: () => {}
        })
      );
    }

    export function renderDatabaseTemplatePicker() {
      return renderToStaticMarkup(
        React.createElement(DatabaseTemplatePicker, {
          onPick: () => {},
          onClose: () => {}
        })
      );
    }

    export function renderOptionPills() {
      return renderToStaticMarkup(
        React.createElement(
          "div",
          null,
          React.createElement(OptionPill, { option: { id: "done", name: "Done", color: "green" } }),
          React.createElement(OptionPill, { option: { id: "muted", name: "Muted task", color: "blue" }, muted: true }),
          React.createElement(OptionPill, { option: { id: "fallback", name: "Fallback", color: "unknown" } })
        )
      );
    }

    export function renderDatabaseTableGridEmbedded() {
      return renderToStaticMarkup(makeDatabaseTableGridElement({ embedded: true, hiddenEmbeddedRows: false }));
    }

    export function renderDatabaseTableGridStandalone() {
      return renderToStaticMarkup(makeDatabaseTableGridElement({ embedded: false, hiddenEmbeddedRows: false, addRowDisabled: true }));
    }

    export function renderDatabaseTableGridHiddenRows() {
      return renderToStaticMarkup(makeDatabaseTableGridElement({ embedded: true, hiddenEmbeddedRows: true }));
    }

    function renderWithDefaultFieldTypes(element) {
      const registration = installDefaultFieldTypes(
        new PluginContextImpl(pluginHost, defaultFieldTypesManifest, new InMemoryPluginSettings())
      );
      try {
        return renderToStaticMarkup(element);
      } finally {
        registration.dispose();
      }
    }

    function installRendererTestPlugin() {
      const manifest = {
        id: "renderer-test-plugin",
        name: "Renderer Test Plugin",
        version: "0.1.0",
        author: "Lotion Tests",
        description: "Fixture plugin for renderer management coverage",
        permissions: ["workspace.read", "workspace.write"]
      };
      const context = new PluginContextImpl(pluginHost, manifest, new InMemoryPluginSettings());
      context.fields.register({
        type: "plugin-renderer-test.text",
        label: "Renderer text",
        render(value) {
          return String(value ?? "");
        }
      });
      context.views.register({
        type: "plugin-renderer-test.board",
        label: "Renderer board",
        icon: "🧩",
        render() {}
      });
      context.commands.register({
        id: "renderer-test.command",
        title: "Renderer command",
        category: "Tests",
        run() {}
      });
      context.sidebar.register({
        id: "renderer-test.sidebar",
        title: "Renderer sidebar",
        icon: "🧪",
        onClick() {}
      });
      context.pageActions.register({
        id: "renderer-test.page-action",
        title: "Renderer page action",
        icon: "✦",
        run() {}
      });
      context.settingsTabs.register({
        id: "renderer-test.settings",
        title: "Renderer settings",
        render(el) {
          el.textContent = "Renderer settings body";
        }
      });
      return context;
    }

    function installRendererSettingsCenterTestPlugins() {
      const fixtures = [
        {
          id: "advanced-search",
          name: "Advanced Search",
          tabId: "advanced-search.settings",
          title: "Advanced Search",
          body: "Renderer semantic provider"
        },
        {
          id: "llm-openai",
          name: "LLM Providers",
          tabId: "llm-openai.settings",
          title: "LLM Providers",
          body: "Renderer model picker"
        },
        {
          id: "git-sync",
          name: "Git Sync",
          tabId: "git-sync.settings",
          title: "Git Sync",
          body: "Renderer remote repository"
        },
        {
          id: "github-backup",
          name: "GitHub Backup",
          tabId: "github-backup.settings",
          title: "GitHub Backup",
          body: "Renderer backup repository"
        },
        {
          id: "notion-import",
          name: "Notion Import",
          tabId: "notion-import.settings",
          title: "Notion Import",
          body: "Renderer import source"
        }
      ];
      return fixtures.map((fixture) => {
        const context = new PluginContextImpl(pluginHost, {
          id: fixture.id,
          name: fixture.name,
          version: "0.0.0",
          author: "Lotion Tests",
          description: "Renderer settings center fixture",
          permissions: ["workspace.read"]
        }, new InMemoryPluginSettings());
        context.settingsTabs.register({
          id: fixture.tabId,
          title: fixture.title,
          render(el) {
            el.textContent = fixture.body;
          }
        });
        return context;
      });
    }

    function makeNotionAuditResult() {
      return {
        summary: {
          sourceRoots: ["/notion/Export-A", "/notion/Export-B"],
          workspaceRoot: "/workspaces/Import Notion",
          sourceCsvs: 5,
          sourceHtmls: 8,
          auditedCsvs: 3,
          auditedHtmls: 2,
          workspaceDatabases: 11,
          workspaceRows: 42,
          workspaceImportedDatabases: 2,
          workspaceImportedRows: 7,
          issues: 1,
          warnings: 2
        },
        issueKinds: {
          "missing-row": 1
        },
        warningKinds: {
          "truncated-preview": 2
        },
        issues: [
          {
            kind: "missing-row",
            source: "/notion/Export-A/Tasks.csv",
            message: "Missing row body"
          }
        ],
        warnings: [
          {
            kind: "truncated-preview",
            source: "/notion/Export-A/Long.html",
            message: "Preview was truncated"
          }
        ]
      };
    }

    function makeNotionPassingAuditResult() {
      return {
        summary: {
          sourceRoots: ["/notion/Clean Export"],
          workspaceRoot: "/workspaces/Clean Import",
          sourceCsvs: 4,
          sourceHtmls: 3,
          auditedCsvs: 4,
          auditedHtmls: 3,
          workspaceDatabases: 5,
          workspaceRows: 120,
          workspaceImportedDatabases: 5,
          workspaceImportedRows: 120,
          issues: 0,
          warnings: 0
        },
        issueKinds: {},
        warningKinds: {},
        issues: [],
        warnings: []
      };
    }

    function makeRendererPropertiesSchema() {
      return {
        id: "db_renderer_props",
        name: "Renderer Properties",
        created_time: "2026-01-01T00:00:00.000Z",
        updated_time: "2026-01-01T00:00:00.000Z",
        defaultViewId: "view_default",
        fields: [
          { id: "id", name: "ID", type: "id", hidden: true },
          { id: "title", name: "Name", type: "text" },
          { id: "hidden_bookkeeping", name: "Hidden Bookkeeping", type: "text", hidden: true },
          { id: "notion_original_html", name: "Original Notion HTML", type: "url", system: true },
          { id: "notion_original_csv", name: "Original Notion CSV", type: "url", system: true },
          { id: "memo", name: "memo", type: "text" },
          { id: "status", name: "Status", type: "select", options: [
            { id: "status_todo", name: "Todo", color: "gray" },
            { id: "status_done", name: "Done", color: "green" }
          ] },
          { id: "tags", name: "Tags", type: "multi_select", options: [
            { id: "tag_focus", name: "Focus", color: "blue" },
            { id: "tag_bug", name: "Bug", color: "yellow" }
          ] },
          { id: "due", name: "Due Date", type: "date" },
          { id: "done", name: "Done", type: "checkbox" },
          { id: "formula_total", name: "Formula Total", type: "formula" },
          { id: "created_time", name: "Created time", type: "created_time", system: true },
          { id: "mixed_markdown", name: "Mixed Link Note", type: "text", system: true }
        ]
      };
    }

    function makeRendererPropertiesRecord() {
      return {
        id: "row_renderer_props",
        title: "Visible row title should stay in the page title",
        hidden_bookkeeping: "should not render",
        notion_original_html: "attachments/original/source-page.html",
        notion_original_csv: "attachments/original/source-db.csv",
        memo: "Editable memo",
        status: "Done",
        tags: "Focus;Bug",
        due: "2026-06-12",
        done: true,
        formula_total: "42",
        created_time: "2026-01-01T00:00:00.000Z",
        mixed_markdown: "Before [Design note](attachments/documents/design-note.pdf) after"
      };
    }

    function makePopoverFields() {
      return [
        { id: "title", name: "Name", type: "text" },
        { id: "score", name: "Score", type: "number" },
        { id: "done", name: "Done", type: "checkbox" },
        { id: "due", name: "Due", type: "date" },
        { id: "relation", name: "Related", type: "entity_ref" }
      ];
    }

    function makeRecentSearchItems() {
      return [
        {
          type: "recent",
          recentHit: {
            recent: { type: "page", id: "pg_recent", at: "2026-06-12T00:00:00.000Z" },
            title: "Recent Page",
            subtitle: "页面 · Workspace",
            kind: "page",
            icon: "emoji:📄"
          }
        },
        {
          type: "recent",
          recentHit: {
            recent: { type: "database", id: "db_recent", at: "2026-06-12T00:00:00.000Z" },
            title: "Recent Database",
            subtitle: "数据库 · Workspace / Data",
            kind: "database",
            icon: "emoji:🗃️"
          }
        },
        {
          type: "recent",
          recentHit: {
            recent: { type: "row_page", databaseId: "db_recent", rowId: "row_recent", title: "Recent Row Page", icon: "emoji:🧾", at: "2026-06-12T00:00:00.000Z" },
            title: "Recent Row Page",
            subtitle: "页面 · Recent Database",
            kind: "row_page",
            icon: "emoji:🧾"
          }
        }
      ];
    }

    function makeTagSearchItems() {
      return [
        {
          type: "tag",
          tagHit: {
            tag: "Focus",
            title: "#Focus",
            pageCount: 1,
            databaseCount: 1,
            count: 2,
            score: 0
          }
        }
      ];
    }

    function makeDefaultCommandSearchItems() {
      return [
        {
          type: "command",
          commandHit: {
            command: {
              id: "lotion.new-page",
              title: "新建页面",
              category: "Lotion",
              run() {}
            },
            sourceName: "内置",
            score: 0
          }
        },
        {
          type: "command",
          commandHit: {
            command: {
              id: "lotion.open-sidebar-settings",
              title: "打开侧栏设置",
              category: "Lotion",
              run() {}
            },
            sourceName: "内置",
            shortcutLabel: "⌘,",
            score: 0
          }
        }
      ];
    }

    function makeSearchResultItems() {
      return [
        {
          type: "command",
          commandHit: {
            command: {
              id: "llm.open",
              title: "Open LLM Chat",
              category: "LLM",
              run() {}
            },
            sourceName: "LLM plugin",
            score: 90
          }
        },
        {
          type: "command",
          commandHit: {
            command: {
              id: "llm.ask-selection",
              title: "Ask LLM about selection",
              category: "LLM",
              run() {}
            },
            sourceName: "LLM plugin",
            score: 89
          }
        },
        {
          type: "command",
          commandHit: {
            command: {
              id: "advanced-search.open",
              title: "Open Advanced Search",
              category: "Search",
              run() {}
            },
            sourceName: "Advanced Search",
            score: 88
          }
        },
        {
          type: "command",
          commandHit: {
            command: {
              id: "github-backup.open",
              title: "Open GitHub Backup",
              category: "Sync",
              run() {}
            },
            sourceName: "GitHub Backup",
            score: 86
          }
        },
        {
          type: "command",
          commandHit: {
            command: {
              id: "git-sync.open",
              title: "Open Git Sync",
              category: "Sync",
              run() {}
            },
            sourceName: "Git Sync",
            score: 85
          }
        },
        {
          type: "command",
          commandHit: {
            command: {
              id: "git-sync.fetch-status",
              title: "Fetch Git remote status",
              category: "Sync",
              run() {}
            },
            sourceName: "Git Sync",
            score: 84.5
          }
        },
        {
          type: "command",
          commandHit: {
            command: {
              id: "git-sync.init-repository",
              title: "Initialize Git repo",
              category: "Sync",
              run() {}
            },
            sourceName: "Git Sync",
            score: 84.45
          }
        },
        {
          type: "command",
          commandHit: {
            command: {
              id: "git-sync.test-remote",
              title: "Test Git remote access",
              category: "Sync",
              run() {}
            },
            sourceName: "Git Sync",
            score: 84.42
          }
        },
        {
          type: "command",
          commandHit: {
            command: {
              id: "git-sync.pull",
              title: "Pull Git remote",
              category: "Sync",
              run() {}
            },
            sourceName: "Git Sync",
            score: 84.4
          }
        },
        {
          type: "command",
          commandHit: {
            command: {
              id: "git-sync.push",
              title: "Push Git remote",
              category: "Sync",
              run() {}
            },
            sourceName: "Git Sync",
            score: 84.3
          }
        },
        {
          type: "command",
          commandHit: {
            command: {
              id: "git-sync.squash-preflight",
              title: "Check Git squash safety",
              category: "Sync",
              run() {}
            },
            sourceName: "Git Sync",
            score: 84
          }
        },
        {
          type: "command",
          commandHit: {
            command: {
              id: "lotion.open-pages",
              title: "打开所有页面",
              category: "Lotion",
              run() {}
            },
            sourceName: "内置",
            score: 80
          }
        },
        {
          type: "command",
          commandHit: {
            command: {
              id: "lotion.open-recent",
              title: "打开最近访问",
              category: "Lotion",
              run() {}
            },
            sourceName: "内置",
            score: 75
          }
        },
        {
          type: "command",
          commandHit: {
            command: {
              id: "lotion.open-sidebar-settings",
              title: "打开侧栏设置",
              category: "Lotion",
              run() {}
            },
            sourceName: "内置",
            score: 74
          }
        },
        {
          type: "command",
          commandHit: {
            command: {
              id: "lotion.toggle-vim-mode",
              title: "切换 Vim 模式",
              category: "Lotion",
              run() {}
            },
            sourceName: "内置",
            score: 73.5
          }
        },
        {
          type: "command",
          commandHit: {
            command: {
              id: "lotion.toggle-raw-markdown",
              title: "切换原文模式",
              category: "Lotion",
              run() {}
            },
            sourceName: "内置",
            score: 73
          }
        },
        {
          type: "command",
          commandHit: {
            command: {
              id: "lotion.toggle-embed-source",
              title: "切换嵌入源码显示",
              category: "Lotion",
              run() {}
            },
            sourceName: "内置",
            score: 72
          }
        },
        {
          type: "command",
          commandHit: {
            command: {
              id: "lotion.toggle-favorite",
              title: "收藏/取消收藏当前页面",
              category: "Lotion",
              run() {}
            },
            sourceName: "内置",
            score: 70
          }
        },
        {
          type: "command",
          commandHit: {
            command: {
              id: "lotion.toggle-full-width",
              title: "切换当前页面全宽",
              category: "Lotion",
              run() {}
            },
            sourceName: "内置",
            score: 60
          }
        },
        {
          type: "command",
          commandHit: {
            command: {
              id: "lotion.toggle-small-text",
              title: "切换当前页面小字号",
              category: "Lotion",
              run() {}
            },
            sourceName: "内置",
            score: 50
          }
        },
        {
          type: "command",
          commandHit: {
            command: {
              id: "lotion.open-current-in-new-window",
              title: "在新窗口打开当前项目",
              category: "Lotion",
              run() {}
            },
            sourceName: "内置",
            score: 45
          }
        },
        {
          type: "hit",
          hit: {
            kind: "database",
            databaseId: "db_daily",
            databaseName: "每日习惯",
            path: "databases/user/每日习惯/schema.json",
            line: 1,
            text: "Database: 每日习惯",
            ranges: [{ start: 10, end: 22 }],
            icon: "emoji:🗃️",
            entityPath: "晨间日记 / 每日习惯",
            matchType: "database",
            matchTypes: ["database"]
          }
        },
        {
          type: "hit",
          hit: {
            kind: "row",
            databaseId: "db_daily",
            databaseName: "每日计划",
            rowId: "row_uber",
            rowTitle: "2023/04/28 [Uber] Account Research",
            pageFile: null,
            path: "databases/user/每日计划/data.csv",
            line: 42,
            text: "Name: Uber Account Research",
            ranges: [{ start: 6, end: 10 }],
            icon: "emoji:🚜",
            entityPath: "晨间日记 / 每日计划 / Uber",
            matchType: "title",
            matchTypes: ["title", "content"]
          }
        }
      ];
    }

    function makeSearchTypeCounts(overrides = {}) {
      return { title: 0, content: 0, reference: 0, database: 0, ...overrides };
    }

    function makePageEditorDocument({ id, title, markdown, fullWidth = false, icon = "emoji:📄" }) {
      return {
        meta: {
          id,
          title,
          icon,
          created_time: "2026-06-12T00:00:00.000Z",
          updated_time: "2026-06-12T00:00:00.000Z",
          fullWidth,
          path: ["Workspace", title],
          parentId: "pg_workspace",
          parentKind: "page"
        },
        markdown
      };
    }

    function makePageEditorPages() {
      return [
        {
          id: "pg_workspace",
          title: "Workspace",
          icon: "emoji:🏠",
          created_time: "2026-06-12T00:00:00.000Z",
          updated_time: "2026-06-12T00:00:00.000Z",
          path: ["Workspace"]
        }
      ];
    }

    function makePageEditorDatabases() {
      return [
        {
          id: "db_page_editor",
          name: "Page Editor Database",
          icon: "emoji:🗃️",
          path: ["Workspace", "Page Editor Database"]
        }
      ];
    }

    function makeTabStripState() {
      return {
        pages: [
          {
            id: "pg_home",
            title: "Home Page",
            icon: "emoji:🏠",
            created_time: "2026-06-12T00:00:00.000Z",
            updated_time: "2026-06-12T00:00:00.000Z",
            path: ["Workspace", "Home Page"]
          }
        ],
        databases: [
          {
            id: "db_daily",
            name: "Daily Habits",
            icon: "emoji:📊",
            path: ["Workspace", "Daily Habits"]
          }
        ],
        activeRowPage: {
          databaseId: "db_daily",
          rowId: "row_today",
          title: "2026/06/12 Review"
        }
      };
    }

    function makeTabStripDatabaseCache() {
      return {
        ...makeNoopDatabaseCache(),
        getBundle: (id) => id === "db_daily" ? {
          schema: {
            id: "db_daily",
            name: "Daily Habits",
            created_time: "2026-06-12T00:00:00.000Z",
            updated_time: "2026-06-12T00:00:00.000Z",
            defaultViewId: "view_default",
            fields: [{ id: "title", name: "Name", type: "text" }]
          },
          records: [{ id: "row_today", title: "Bundle row title" }],
          views: [{ id: "view_default", name: "All", type: "table", visibleFieldIds: ["title"] }]
        } : undefined
      };
    }

    function makeManagementPages() {
      return [
        {
          id: "pg_weekly",
          title: "Weekly Review",
          icon: "emoji:📘",
          created_time: "2026-06-11T09:00:00",
          updated_time: "2026-06-12T09:30:00",
          path: ["Workspace", "Weekly Review"],
          tags: ["Focus"]
        },
        {
          id: "pg_plan",
          title: "Project Plan",
          icon: "emoji:🧭",
          created_time: "2026-06-10T08:00:00",
          updated_time: "2026-06-11T16:45:00",
          path: ["Workspace", "Project Plan"]
        }
      ];
    }

    function makeManagementDatabases() {
      return [
        {
          id: "db_projects",
          name: "Content Projects",
          icon: "emoji:🗂️",
          path: ["Workspace", "Archive", "Content Projects"],
          fieldCount: 5,
          rowCount: 7,
          tags: ["Focus"]
        },
        {
          id: "db_daily",
          name: "Daily Habits",
          icon: "emoji:🗃️",
          path: ["Workspace", "Daily Habits"],
          fieldCount: 3,
          rowCount: 1
        }
      ];
    }

    function makeManagementRecents() {
      return [
        { type: "page", id: "pg_weekly", at: "2026-06-12T12:15:00", count: 2 },
        { type: "database", id: "db_daily", at: "2026-06-12T11:00:00", count: 1 },
        {
          type: "row_page",
          databaseId: "db_daily",
          rowId: "row_daily",
          title: "Fallback daily row",
          icon: "emoji:🚜",
          at: "2026-06-12T10:45:00",
          count: 1
        }
      ];
    }

    function makeManagementFavorites() {
      return [
        { type: "page", id: "pg_plan" },
        { type: "row_page", databaseId: "db_daily", rowId: "row_daily" }
      ];
    }

    function makeSidebarState() {
      const pages = [
        {
          id: "pg_weekly",
          title: "Weekly Review",
          icon: "emoji:📘",
          created_time: "2026-06-11T09:00:00",
          updated_time: "2026-06-12T09:30:00",
          path: ["Renderer Workspace", "Weekly Review"],
          tags: ["reflection"]
        },
        {
          id: "pg_plan",
          title: "Project Plan",
          icon: "emoji:🧭",
          created_time: "2026-06-10T08:00:00",
          updated_time: "2026-06-11T16:45:00",
          path: ["Renderer Workspace", "Project Plan"],
          tags: ["import"]
        },
        {
          id: "pg_plan_child",
          title: "Project Plan Child",
          icon: "emoji:🧩",
          created_time: "2026-06-10T08:30:00",
          updated_time: "2026-06-11T17:00:00",
          path: ["Renderer Workspace", "Project Plan", "Project Plan Child"],
          parentId: "pg_plan",
          parentKind: "page",
          tags: []
        }
      ];
      const databases = [
        {
          id: "db_projects",
          name: "Content Projects",
          icon: "emoji:🗂️",
          path: ["Renderer Workspace", "Archive", "Content Projects"],
          fieldCount: 5,
          rowCount: 7,
          tags: ["import"]
        },
        {
          id: "db_daily",
          name: "Daily Habits",
          icon: "emoji:🗃️",
          path: ["Renderer Workspace", "Daily Habits"],
          fieldCount: 3,
          rowCount: 1,
          tags: []
        }
      ];
      return {
        manifest: {
          name: "Renderer Workspace",
          icon: "emoji:🧪",
          systemDatabases: ["pages", "workspaces"]
        },
        pages,
        databases,
        favorites: [
          { type: "page", id: "pg_plan" },
          { type: "row_page", databaseId: "db_daily", rowId: "row_daily" }
        ],
        recents: makeManagementRecents(),
        activeItem: { type: "database", id: "db_daily" },
        pagesTree: {
          topLevelPages: pages,
          databases: [
            {
              databaseId: "db_daily",
              fileNames: ["2026_06_23_Review--row_daily.md"]
            }
          ]
        },
        searchQuery: "",
        isLoading: false,
        tabs: [{ id: "tab_0", item: { type: "database", id: "db_daily" } }],
        activeTabIndex: 0
      };
    }

    function withRendererWindow(render, extraEntries = []) {
      const previousWindow = globalThis.window;
      const storage = new Map([
        ["lotion.settings.sidebarTags", JSON.stringify(["database", "page", "import"])],
        ["lotion.locale", "en"],
        ...extraEntries
      ]);
      globalThis.window = {
        innerWidth: 1200,
        innerHeight: 800,
        localStorage: {
          getItem: (key) => storage.get(key) ?? null,
          setItem: (key, value) => storage.set(key, String(value)),
          removeItem: (key) => storage.delete(key)
        },
        addEventListener() {},
        removeEventListener() {},
        confirm: () => true,
        location: { reload() {} },
        lotion: {
          git: { backupNow: async () => ({ ok: true, message: "Backed up" }) },
          workspace: {
            listRecent: async () => [],
            open: async () => {},
            openPicker: async () => null,
            forget: async () => {}
          },
          icons: {
            setForWorkspace: async () => ({ iconPath: null }),
            clearForWorkspace: async () => {}
          }
        }
      };
      try {
        return render();
      } finally {
        if (previousWindow === undefined) {
          delete globalThis.window;
        } else {
          globalThis.window = previousWindow;
        }
      }
    }

    function makeManagementDatabaseCache() {
      return {
        ...makeNoopDatabaseCache(),
        getBundle: (id) => id === "db_daily" ? {
          schema: {
            id: "db_daily",
            name: "Daily Habits",
            created_time: "2026-06-12T00:00:00.000Z",
            updated_time: "2026-06-12T00:00:00.000Z",
            defaultViewId: "view_default",
            fields: [{ id: "title", name: "Name", type: "text" }]
          },
          records: [
            {
              id: "row_daily",
              title: "2026/06/23 Review",
              row_icon: "emoji:🚜"
            }
          ],
          views: [{ id: "view_default", name: "All", type: "table", visibleFieldIds: ["title"] }]
        } : undefined
      };
    }

    function makeNoopDatabaseCache() {
      const emptyBundle = {
        schema: {
          id: "db_empty",
          name: "Empty",
          created_time: "2026-06-12T00:00:00.000Z",
          updated_time: "2026-06-12T00:00:00.000Z",
          defaultViewId: "view_default",
          fields: [{ id: "title", name: "Name", type: "text" }]
        },
        records: [],
        views: [{ id: "view_default", name: "All", type: "table", visibleFieldIds: ["title"] }]
      };
      const resolveBundle = async () => emptyBundle;
      return {
        getBundle: () => undefined,
        loadBundle: resolveBundle,
        invalidate: () => {},
        createDatabase: resolveBundle,
        updateMeta: resolveBundle,
        updateCell: resolveBundle,
        updateField: resolveBundle,
        addField: resolveBundle,
        addRow: resolveBundle,
        deleteRow: resolveBundle,
        saveTemplate: resolveBundle,
        deleteTemplate: resolveBundle,
        createView: resolveBundle,
        duplicateView: resolveBundle,
        updateView: resolveBundle,
        patchView: async () => ({ ok: true, bundle: emptyBundle, view: emptyBundle.views[0] }),
        mutateView: resolveBundle,
        getViewMutationState: () => ({ status: "idle" }),
        deleteView: resolveBundle,
        setDefaultView: resolveBundle,
        openRowPage: async () => ({}),
        openRowPageByFile: async () => ({}),
        updateRowPage: async () => ({}),
        setRowPageFullWidth: async () => ({}),
        setRowPageSmallText: async () => ({})
      };
    }

    function renderDefaultFieldProvider(host, type, value, fieldPatch = {}) {
      const provider = host.fields.get(type);
      if (!provider || typeof provider.renderReact !== "function") {
        throw new Error("Missing default React field provider: " + type);
      }
      const field = {
        id: "field_" + type,
        name: type,
        type,
        ...fieldPatch
      };
      return provider.renderReact(value, {
        field,
        record: { id: "row_fixture", title: "Fixture row" },
        databaseId: "db_fixture",
        placeholder: "Empty",
        wrap: Boolean(fieldPatch.wrap),
        commit: () => {},
        onOptionsChange: () => {}
      });
    }

    class RendererTestElement {
      constructor(tagName) {
        this.tagName = tagName;
        this.children = [];
        this.className = "";
        this.textContent = "";
        this.type = "";
        this.draggable = false;
        this.disabled = false;
        this.dataset = {};
        this.listeners = {};
        this.style = new RendererTestStyle();
      }

      get classList() {
        return {
          add: (className) => {
            const classes = new Set(this.className.split(/\s+/).filter(Boolean));
            classes.add(className);
            this.className = Array.from(classes).join(" ");
          },
          remove: (className) => {
            const classes = new Set(this.className.split(/\s+/).filter(Boolean));
            classes.delete(className);
            this.className = Array.from(classes).join(" ");
          }
        };
      }

      get childElementCount() {
        return this.children.length;
      }

      append(...nodes) {
        for (const node of nodes) this.appendChild(node);
      }

      appendChild(node) {
        this.children.push(node);
        return node;
      }

      replaceChildren(...nodes) {
        this.children = [];
        this.textContent = "";
        this.append(...nodes);
      }

      addEventListener(type, listener) {
        this.listeners[type] ??= [];
        this.listeners[type].push(listener);
      }

      querySelector(selector) {
        return this.querySelectorAll(selector)[0] ?? null;
      }

      querySelectorAll(selector) {
        if (!selector.startsWith(".")) return [];
        const className = selector.slice(1);
        const matches = [];
        this.walk((element) => {
          if (element.className.split(/\s+/).includes(className)) matches.push(element);
        });
        return matches;
      }

      walk(visitor) {
        visitor(this);
        for (const child of this.children) child.walk?.(visitor);
      }

      toHtml() {
        const attrs = [];
        if (this.className) attrs.push(["class", this.className]);
        if (this.type) attrs.push(["type", this.type]);
        if (this.draggable) attrs.push(["draggable", "true"]);
        if (this.disabled) attrs.push(["disabled", ""]);
        const style = this.style.toString();
        if (style) attrs.push(["style", style]);
        for (const [key, value] of Object.entries(this.dataset)) {
          const dataKey = "data-" + key.replace(/[A-Z]/g, (letter) => "-" + letter.toLowerCase());
          attrs.push([dataKey, String(value)]);
        }
        const attrText = attrs
          .map(([key, value]) => value === "" ? key : key + "=\"" + escapeRendererTestHtml(value) + "\"")
          .join(" ");
        const children = [
          escapeRendererTestHtml(this.textContent),
          ...this.children.map((child) => child.toHtml())
        ].join("");
        return "<" + this.tagName + (attrText ? " " + attrText : "") + ">" + children + "</" + this.tagName + ">";
      }
    }

    class RendererTestStyle {
      constructor() {
        this.cssText = "";
        this.outline = "";
        this.outlineOffset = "";
        this.opacity = "";
        this.cursor = "";
      }

      toString() {
        return [
          this.cssText,
          this.outline ? "outline: " + this.outline : "",
          this.outlineOffset ? "outline-offset: " + this.outlineOffset : "",
          this.opacity ? "opacity: " + this.opacity : "",
          this.cursor ? "cursor: " + this.cursor : ""
        ].filter(Boolean).join(";");
      }
    }

    function escapeRendererTestHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    function makeDefaultOptions() {
      return [
        { id: "opt_done", name: "Done", color: "green" },
        { id: "opt_work", name: "Work", color: "yellow" },
        { id: "opt_life", name: "Life", color: "blue" }
      ];
    }

    function makeNoopWorkspace() {
      return {
        listPages: async () => [],
        getPage: async () => {
          throw new Error("not used in static render");
        },
        createPage: async () => {
          throw new Error("not used in static render");
        },
        updatePage: async () => {
          throw new Error("not used in static render");
        },
        deletePage: async () => {},
        listDatabases: async () => [],
        getDatabase: async () => {
          throw new Error("not used in static render");
        },
        createDatabase: async () => {
          throw new Error("not used in static render");
        },
        updateDatabase: async () => {
          throw new Error("not used in static render");
        },
        updateCell: async () => {
          throw new Error("not used in static render");
        },
        addRow: async () => {
          throw new Error("not used in static render");
        },
        getRowPage: async () => {
          throw new Error("not used in static render");
        },
        updateRowPage: async () => {
          throw new Error("not used in static render");
        },
        search: async () => []
      };
    }

    function makeEmbeddedViewDatabaseCache(cached) {
      const bundle = makeDatabaseChromeBundle();
      return {
        ...makeNoopDatabaseCache(),
        getBundle: (id) => cached && id === bundle.schema.id ? bundle : undefined,
        loadBundle: async (id) => {
          if (id === bundle.schema.id) return bundle;
          throw new Error("missing embedded database");
        }
      };
    }

    function makeAdvancedSearchPluginContext() {
      return {
        storage: {
          readJson: async () => undefined,
          writeJson: async () => {}
        },
        workspace: {
          listPages: async () => [],
          getPage: async () => { throw new Error("not used in static render"); },
          listDatabases: async () => [],
          getDatabase: async () => { throw new Error("not used in static render"); },
          getRowPage: async () => { throw new Error("not used in static render"); }
        },
        ui: {
          openEntity: () => {}
        }
      };
    }

    function makePageHistoryResult() {
      return {
        state: "ready",
        message: "2 local Git versions found.",
        path: "databases/system/pages--db_pages/pages/History_Page--pg_history.md",
        pageId: "pg_history",
        title: "History Page",
        versions: [
          {
            id: "databases/system/pages--db_pages/pages/History_Page--pg_history.md@abc1234",
            sha: "abc1234",
            shortSha: "abc1234",
            message: "Renderer history backup",
            createdAt: "2026-06-12T10:30:00.000Z",
            path: "databases/system/pages--db_pages/pages/History_Page--pg_history.md",
            pageId: "pg_history",
            title: "History Page"
          },
          {
            id: "databases/system/pages--db_pages/pages/History_Page--pg_history.md@def5678",
            sha: "def5678",
            shortSha: "def5678",
            message: "Previous renderer backup",
            createdAt: "2026-06-12T09:15:00.000Z",
            path: "databases/system/pages--db_pages/pages/History_Page--pg_history.md",
            pageId: "pg_history",
            title: "History Page"
          }
        ]
      };
    }

    function makePageHistoryPreview() {
      const result = makePageHistoryResult();
      return {
        version: result.versions[0],
        selectedMarkdown: "# History Page\\nRestored history body",
        currentMarkdown: "# History Page\\nCurrent history body",
        diff: [
          { type: "same", text: "# History Page" },
          { type: "removed", text: "Current history body" },
          { type: "added", text: "Restored history body" }
        ]
      };
    }

    function makeGitHubBackupPluginContext(overrides = {}) {
      const settings = {
        provider: "local_mock",
        repository: "owner/repo",
        branch: "main",
        basePath: "lotion-integration-tests/renderer",
        token: "",
        ...overrides
      };
      return {
        settings: {
          get: () => settings,
          set: async () => {}
        },
        storage: {
          readJson: async () => undefined,
          writeJson: async () => {}
        },
        workspace: {
          activePage: async () => makeGitHubBackupActivePage(),
          listPages: async () => [makeGitHubBackupActivePage().meta],
          getPage: async () => makeGitHubBackupActivePage(),
          listDatabases: async () => [],
          getDatabase: async () => {
            throw new Error("not used in static render");
          },
          getRowPage: async () => {
            throw new Error("not used in static render");
          },
          updatePage: async () => makeGitHubBackupActivePage()
        },
        ui: {
          confirm: async () => true,
          notify: () => {},
          openEntity: () => {}
        }
      };
    }

    function makeGitHubBackupActivePage() {
      return {
        meta: {
          id: "pg_weekly",
          title: "Weekly Review",
          icon: "emoji:📘",
          created_time: "2026-06-12T09:00:00.000Z",
          updated_time: "2026-06-12T10:00:00.000Z",
          path: ["Renderer Workspace", "Weekly Review"]
        },
        markdown: "# Weekly Review\\nCurrent body"
      };
    }

    function makeSlashMenuCommands() {
      return [
        { id: "text", label: "Text", group: "Basic", hint: "Plain paragraph", iconId: "text", run: () => {} },
        { id: "heading_1", label: "Heading 1", group: "Basic", hint: "Large section title", iconId: "h1", run: () => {} },
        { id: "highlight", label: "Highlight", group: "Basic", hint: "Yellow background", iconId: "highlight", run: () => {} },
        { id: "callout", label: "Callout", group: "Blocks", hint: "Emphasized note", iconId: "callout", run: () => {} },
        { id: "database", label: "Database", group: "Data", hint: "Inline table", iconId: "database", run: () => {} }
      ];
    }

    function makeDatabaseChromeBundle() {
      return {
        schema: {
          id: "db_chrome",
          name: "Project Tracker",
          icon: "emoji:📊",
          path: ["Workspace", "Operations", "Project Tracker"],
          created_time: "2026-01-01T00:00:00.000Z",
          updated_time: "2026-01-02T00:00:00.000Z",
          defaultViewId: "view_all",
          fields: [
            { id: "id", name: "ID", type: "id", hidden: true },
            { id: "title", name: "Name", type: "text" },
            { id: "status", name: "Status", type: "select" },
            { id: "due", name: "Due", type: "date" },
            { id: "hidden_notes", name: "Hidden Notes", type: "text", hidden: true }
          ]
        },
        records: [
          { id: "row_one", title: "First task", status: "Doing", due: "2026-06-12" },
          { id: "row_two", title: "Second task", status: "Done", due: "2026-06-13" }
        ],
        views: [
          {
            id: "view_all",
            name: "All rows",
            type: "table",
            visibleFieldIds: ["title", "status", "due"],
            fieldOrder: ["title", "status", "due"],
            filters: [],
            sorts: []
          },
          {
            id: "view_gallery",
            name: "Gallery wall",
            type: "gallery",
            visibleFieldIds: ["title", "status"],
            fieldOrder: ["title", "status"],
            filters: [],
            sorts: []
          },
          {
            id: "view_kanban",
            name: "Kanban board",
            type: "kanban_plus",
            visibleFieldIds: ["title", "status"],
            fieldOrder: ["title", "status"],
            filters: [],
            sorts: []
          }
        ]
      };
    }

    function makeAlternateViewFields() {
      return [
        { id: "id", name: "ID", type: "id", hidden: true },
        { id: "title", name: "Name", type: "text" },
        { id: "status", name: "Status", type: "select" },
        { id: "due", name: "Due", type: "date" },
        { id: "done", name: "Done", type: "checkbox" },
        { id: "cover_url", name: "Cover URL", type: "url" },
        { id: "hidden_notes", name: "Hidden Notes", type: "text", hidden: true }
      ];
    }

    function makeAlternateViewVisibleFields() {
      return makeAlternateViewFields().filter((field) => !field.hidden && field.id !== "id" && field.id !== "cover_url");
    }

    function makeAlternateViewRecords() {
      return [
        {
          id: "row_alpha",
          title: "Alpha task",
          row_icon: "emoji:🧾",
          status: "Doing",
          due: "2026-06-12",
          done: true,
          cover_url: "attachment://covers/alpha.png",
          cover_offset: 30,
          hidden_notes: "should not render"
        },
        {
          id: "row_beta",
          title: "",
          row_icon: "emoji:🖼️",
          status: "Done",
          due: "2026-06-13",
          done: false,
          cover_url: "",
          hidden_notes: "also hidden"
        }
      ];
    }

    function makeDatabaseTableGridElement({ embedded, hiddenEmbeddedRows, addRowDisabled = false }) {
      const fields = makeAlternateViewVisibleFields().slice(0, 2);
      const records = makeAlternateViewRecords();
      return React.createElement(DatabaseTableGrid, {
        embedded,
        fields,
        tableRecords: records,
        visibleRecords: records,
        startIndex: 5,
        endIndex: records.length,
        topSpacerHeight: 32,
        bottomSpacerHeight: 48,
        renderedTableWidth: 720,
        scrollLeft: 24,
        hiddenEmbeddedRows,
        tableScrollRef: React.createRef(),
        rowNodesRef: { current: new Map() },
        onAddRow: () => {},
        addRowDisabled,
        renderColGroup: () => React.createElement(
          "colgroup",
          null,
          React.createElement("col", { key: "row-num" }),
          fields.map((field) => React.createElement("col", { key: field.id }))
        ),
        renderHead: () => React.createElement(
          "thead",
          null,
          React.createElement(
            "tr",
            null,
            fields.map((field) => React.createElement("th", { key: field.id }, field.name))
          )
        ),
        renderCell: (record, field) => React.createElement("span", null, "Cell:" + String(record[field.id] ?? "") + "/" + field.name),
        getRowNumber: (record) => record.id === "row_alpha" ? 9 : 2,
        renderRowActions: (record) => React.createElement("button", { type: "button" }, "Action:" + String(record.id)),
        addRowLabel: "+ New"
      });
    }

    function makeNoopActions() {
      return {
        selectPage() {},
        selectDatabase() {},
        openManage() {},
        openRowPage() {},
        openRowPageByFile() {},
        createPage() {},
        createDatabase() {},
        async deletePage() {},
        async toggleFavoriteCurrent() {},
        async toggleFullWidthCurrent() {},
        async toggleSmallTextCurrent() {},
        openActiveInNewWindow() {},
        goBack() {},
        goForward() {},
        canBack: false,
        canForward: false
      };
    }
  `;
}
