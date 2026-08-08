# Task Queue

Mode: continuous

Purpose: keep Lotion's Notion-core parity work moving one task at a time without
re-brainstorming priorities every turn.

## Operating Loop

1. Pick the first `ready` queue item. User-reported bugs are always highest
   priority and should be placed before non-user-reported ready work once the
   current WIP is safely completed or paused.
2. Move or copy the detailed task into `tasks/wip/` when implementation starts.
3. Keep edits scoped to that item unless a small prerequisite is required.
4. Add or update tests for changed behavior. Every completed item must add or
   update a focused UI test for the affected user-visible behavior, or document
   why the item is truly non-UI and which lower-level test covers it.
5. Run the listed gates before calling the item done, including the focused UI
   gate added or updated for the item.
6. Move the task to `tasks/done/` after verification.
7. Create one task-scoped commit containing only that queue item's code, tests,
   artifacts, and task-documentation changes.
8. Push the commit to the current branch's tracked remote and verify the remote
   contains `HEAD`.
9. Continue to the next `ready` item only after the push succeeds, unless
   blocked by a product decision, failing tests that cannot be fixed in-scope,
   or a required external action.

## Stop Conditions

- A product decision is needed and the queue item explicitly says
  `needs discussion`.
- A required command is blocked by permissions or missing local state.
- A test or benchmark exposes a wider regression that needs its own task.
- The task-scoped commit or push fails. Preserve the work and report the exact
  blocker; do not start the next queue item.
- The user asks to pause, change priority, inspect manually, commit, or push.

## Required Baseline Gates

- `npm run typecheck`
- `npm run test:fixtures`
- `npm run test:latency`

Use `npm run build` for UI or package-surface changes. Use focused tests first
when a task names them. Each queue item should name a focused UI smoke,
benchmark, or renderer regression gate unless the work has no user-visible UI
surface.

## Queue

| Order | Status | Item | Source | Required Gates |
| --- | --- | --- | --- | --- |
| 1 | done | Page embedded view picker and settings | `tasks/done/page-embedded-view-picker-and-settings.md` | `typecheck`, `test:fixtures`, `test:latency`, `build`, Electron smoke |
| 2 | done | Frontend architecture boundaries | `tasks/done/frontend-architecture-boundaries.md` | `typecheck`, `test:fixtures`, `test:latency`, Electron screenshots |
| 3 | done | Slash menu and insert blocks | `tasks/done/slash-menu-and-insert-blocks.md` | `typecheck`, `test:fixtures`, focused editor tests, Electron smoke |
| 4 | done | CodeMirror live preview writing surface | `tasks/done/codemirror-live-preview-writing-surface.md` | `typecheck`, `test:fixtures`, `test:latency`, editor latency benchmark |
| 5 | done | Page hierarchy and sidebar tree | `tasks/done/page-hierarchy-and-sidebar-tree.md` | `typecheck`, `test:fixtures`, `test:links`, search/navigation tests |
| 6 | done | Database view management and row-page polish | `tasks/done/database-view-management-and-row-page-polish.md` | `typecheck`, `test:fixtures`, `test:latency`, database tests |
| 7 | done | Database table body boundaries | `tasks/done/database-table-body-boundaries.md` | `typecheck`, `test:fixtures`, `test:latency` |
| 8 | done | Relation field schema foundation | `tasks/done/relation-field-schema-foundation.md` | `typecheck`, package-core database tests, `test:fixtures`, `test:latency` |
| 9 | done | Relation cell rendering | `tasks/done/relation-cell-rendering.md` | `typecheck`, `test:fixtures`, `test:latency`, UI build |
| 10 | done | Relation field settings | `tasks/done/relation-field-settings.md` | `typecheck`, `test:fixtures`, `test:latency`, UI build |
| 11 | done | Rollup field schema foundation | `tasks/done/rollup-field-schema-foundation.md` | `typecheck`, package-core database tests, `test:fixtures`, `test:latency` |
| 12 | done | Rollup read computation | `tasks/done/rollup-read-computation.md` | `typecheck`, package-core database tests, `test:fixtures`, `test:latency` |
| 13 | done | Relation target database picker | `tasks/done/relation-target-database-picker.md` | `typecheck`, `test:fixtures`, `test:latency`, UI build |
| 14 | done | Rollup relation field picker | `tasks/done/rollup-relation-field-picker.md` | `typecheck`, `test:fixtures`, `test:latency`, UI build |
| 15 | done | Rollup target field picker | `tasks/done/rollup-target-field-picker.md` | `typecheck`, `test:fixtures`, `test:latency`, UI build |
| 16 | done | Rollup target validation | `tasks/done/rollup-target-validation.md` | `typecheck`, `test:fixtures`, `test:latency` |
| 17 | done | Shared rollup helper and benchmark | `tasks/done/shared-rollup-helper-and-benchmark.md` | `typecheck`, package-core database tests, `test:latency` |
| 18 | done | List database view | `tasks/done/list-database-view.md` | `typecheck`, `test:fixtures`, `test:latency`, UI build |
| 19 | done | Relation, rollup, and richer views follow-ups | `tasks/done/relation-rollup-richer-views-first-pass.md` | `typecheck`, formula/database tests, `test:latency` |
| 20 | done | LLM active page context | `tasks/done/llm-active-page-context.md` | `typecheck`, package/plugin tests, mocked provider tests |
| 21 | done | LLM Ask command active-page prompt | `tasks/done/llm-ask-active-page-prompt.md` | `typecheck`, package/plugin tests, mocked provider tests |
| 22 | done | LLM page drafting command | `tasks/done/llm-page-drafting-command.md` | `typecheck`, package/plugin tests, mocked provider tests |
| 23 | done | Git status foundation | `tasks/done/git-status-foundation.md` | `typecheck`, git service tests |
| 24 | done | Git sync plugin status page | `tasks/done/git-sync-plugin-status-page.md` | `typecheck`, git service tests, plugin UI smoke |
| 25 | done | Git sync local settings storage | `tasks/done/git-sync-local-settings-storage.md` | `typecheck`, git service tests |
| 26 | done | Git sync settings UI | `tasks/done/git-sync-settings-ui.md` | `typecheck`, git service tests, plugin UI smoke |
| 27 | done | Git sync remote setup actions | `tasks/done/git-sync-remote-setup-actions.md` | `typecheck`, git service tests, plugin UI smoke |
| 28 | done | Git sync remote access test | `tasks/done/git-sync-remote-access-test.md` | `typecheck`, git service tests, plugin UI smoke |
| 29 | done | Git sync manual push action | `tasks/done/git-sync-manual-push-action.md` | `typecheck`, git service tests, plugin UI smoke |
| 30 | done | Git sync fetch status action | `tasks/done/git-sync-fetch-status-action.md` | `typecheck`, git service tests, plugin UI smoke |
| 31 | done | Git sync manual pull action | `tasks/done/git-sync-manual-pull-action.md` | `typecheck`, git service tests, plugin UI smoke |
| 32 | done | Git sync operation history | `tasks/done/git-sync-operation-history.md` | `typecheck`, git service tests, plugin UI smoke |
| 33 | done | Git sync SSH key picker | `tasks/done/git-sync-ssh-key-picker.md` | `typecheck`, plugin UI smoke |
| 34 | done | Git sync commit message prefix | `tasks/done/git-sync-commit-message-prefix.md` | `typecheck`, git service tests |
| 35 | done | Git sync auto backup scheduler | `tasks/done/git-sync-auto-backup-scheduler.md` | `typecheck`, git service tests |
| 36 | done | Git sync minute cadence options | `tasks/done/git-sync-minute-cadence-options.md` | `typecheck`, git service tests, plugin UI smoke |
| 37 | done | Git sync auto push scheduler | `tasks/done/git-sync-auto-push-scheduler.md` | `typecheck`, git service tests, plugin UI smoke |
| 38 | done | Git sync pause automatic sync | `tasks/done/git-sync-pause-automatic-sync.md` | `typecheck`, git service tests, plugin UI smoke |
| 39 | done | Git sync initialize repository action | `tasks/done/git-sync-initialize-repository-action.md` | `typecheck`, git service tests, plugin UI smoke |
| 40 | done | Notion import audit visible summary | `tasks/done/notion-import-audit-visible-summary.md` | `typecheck`, `test:fixtures`, `test:latency`, audit tests |
| 41 | done | Notion import focused regression cases | `tasks/done/notion-import-focused-regression-cases.md` | `typecheck`, import regression tests |
| 42 | done | Notion import large dataset regression runner | `tasks/done/notion-import-large-dataset-regression-runner.md` | `typecheck`, regression runner smoke |
| 43 | done | Notion Import plugin UI smoke script | `tasks/done/notion-import-plugin-ui-smoke-script.md` | UI smoke |
| 44 | done | Page open latency benchmark | `tasks/done/page-open-latency-benchmark.md` | benchmark smoke |
| 45 | done | Search service latency benchmark | `tasks/done/search-service-latency-benchmark.md` | benchmark smoke |
| 46 | done | Search popup UI latency benchmark | `tasks/done/search-popup-ui-latency-benchmark.md` | UI benchmark smoke |
| 47 | done | Cell edit commit latency benchmark | `tasks/done/cell-edit-commit-latency-benchmark.md` | benchmark smoke |
| 48 | done | Embedded database first render latency benchmark | `tasks/done/embedded-database-first-render-latency-benchmark.md` | UI benchmark smoke |
| 49 | done | Editor scroll latency benchmark | `tasks/done/editor-scroll-latency-benchmark.md` | UI benchmark smoke |
| 50 | done | Sidebar file-tree navigation smoke | `tasks/done/sidebar-file-tree-navigation-smoke.md` | UI smoke |
| 51 | done | Database row-page navigation smoke | `tasks/done/database-row-page-navigation-smoke.md` | UI smoke |
| 52 | done | Source and attachment link smoke | `tasks/done/source-and-attachment-link-smoke.md` | UI smoke |
| 53 | done | Image lightbox smoke | `tasks/done/image-lightbox-smoke.md` | UI smoke |
| 54 | done | UI smoke suite | `tasks/done/ui-smoke-suite.md` | UI smoke |
| 55 | done | Testing docs for smoke and benchmarks | `tasks/done/testing-docs-for-smoke-and-benchmarks.md` | `git diff --check` |
| 56 | done | Deterministic Notion Import UI smoke | `tasks/done/deterministic-notion-import-ui-smoke.md` | UI smoke |
| 57 | done | UI smoke temp workspace cleanup | `tasks/done/ui-smoke-temp-workspace-cleanup.md` | UI smoke |
| 58 | done | Markdown preview link regression smoke | `tasks/done/markdown-preview-link-regression-smoke.md` | UI smoke |
| 59 | done | Plugin manager detail smoke | `tasks/done/plugin-manager-detail-smoke.md` | UI smoke |
| 60 | done | URL field open smoke | `tasks/done/url-field-open-smoke.md` | UI smoke |
| 61 | done | Shell open dry-run smoke hook | `tasks/done/shell-open-dry-run-smoke-hook.md` | UI smoke |
| 62 | done | Source attachment open dry-run smoke | `tasks/done/source-attachment-open-dry-run-smoke.md` | UI smoke |
| 63 | done | Document shell dry-run UI smoke | `tasks/done/document-shell-dry-run-ui-smoke.md` | `git diff --check` |
| 64 | done | Search popup backend latency guard | `tasks/done/search-popup-backend-latency-guard.md` | UI smoke |
| 65 | done | Page path slash title smoke | `tasks/done/page-path-slash-title-smoke.md` | UI smoke |
| 66 | done | Row page tab title smoke | `tasks/done/row-page-tab-title-smoke.md` | UI smoke |
| 67 | done | Search result title label smoke | `tasks/done/search-result-title-label-smoke.md` | UI smoke |
| 68 | done | Search result filter smoke | `tasks/done/search-result-filter-smoke.md` | UI smoke |
| 69 | done | Deterministic search popup UI fixture | `tasks/done/deterministic-search-popup-ui-fixture.md` | UI smoke |
| 70 | done | Search result icon smoke | `tasks/done/search-result-icon-smoke.md` | UI smoke |
| 71 | done | Search result navigation smoke | `tasks/done/search-result-navigation-smoke.md` | UI smoke |
| 72 | done | Page breadcrumb parent navigation smoke | `tasks/done/page-breadcrumb-parent-navigation-smoke.md` | UI smoke |
| 73 | done | Row page entity-ref property navigation | `tasks/done/row-page-entity-ref-property-navigation.md` | UI smoke |
| 74 | done | Sidebar entity icon smoke | `tasks/done/sidebar-entity-icon-smoke.md` | UI smoke |
| 75 | done | Sidebar row-page recent icon smoke | `tasks/done/sidebar-row-page-recent-icon-smoke.md` | UI smoke |
| 76 | done | Raw markdown toggle stability smoke | `tasks/done/raw-markdown-toggle-stability-smoke.md` | UI smoke |
| 77 | done | Raw markdown smoke setting restore | `tasks/done/raw-markdown-smoke-setting-restore.md` | UI smoke |
| 78 | done | Notion audit imported mapping summary | `tasks/done/notion-audit-imported-mapping-summary.md` | audit tests, UI smoke |
| 79 | done | Notion audit path open smoke | `tasks/done/notion-audit-path-open-smoke.md` | UI smoke |
| 80 | done | Plugin manager detail host smoke clarity | `tasks/done/plugin-manager-detail-host-smoke-clarity.md` | UI smoke |
| 81 | done | Markdown decoded URL single click target | `tasks/done/markdown-decoded-url-single-click-target.md` | UI smoke |
| 82 | done | Window pop-out tab smoke | `tasks/done/window-popout-tab-smoke.md` | UI smoke |
| 83 | done | Page menu open-new-window smoke | `tasks/done/page-menu-open-new-window-smoke.md` | UI smoke |
| 84 | done | Database header open-new-window smoke | `tasks/done/database-header-open-new-window-smoke.md` | UI smoke |
| 85 | done | Database row template UI smoke | `tasks/done/database-row-template-ui-smoke.md` | UI smoke |
| 86 | done | Database row template manager UI smoke | `tasks/done/database-row-template-manager-ui-smoke.md` | UI smoke |
| 87 | done | Database view default template UI smoke | `tasks/done/database-view-default-template-ui-smoke.md` | UI smoke |
| 88 | done | Row page empty template prompt UI smoke | `tasks/done/row-page-empty-template-prompt-ui-smoke.md` | UI smoke, typecheck |
| 89 | done | Database template delete clears view default test | `tasks/done/database-template-delete-clears-view-default-test.md` | customer API test |
| 90 | done | Database template delete UI smoke | `tasks/done/database-template-delete-ui-smoke.md` | UI smoke |
| 91 | done | Database view create rename UI smoke | `tasks/done/database-view-create-rename-ui-smoke.md` | UI smoke |
| 92 | done | Database view delete UI and API | `tasks/done/database-view-delete-ui-and-api.md` | typecheck, customer API test, UI smoke |
| 93 | done | Database view set default UI and API | `tasks/done/database-view-set-default-ui-and-api.md` | typecheck, customer API test, UI smoke |
| 94 | done | Database last view delete disabled smoke | `tasks/done/database-last-view-delete-disabled-smoke.md` | UI smoke |
| 95 | done | Database default view reopen smoke | `tasks/done/database-default-view-reopen-smoke.md` | UI smoke |
| 96 | done | Database view duplicate UI and API | `tasks/done/database-view-duplicate-ui-and-api.md` | typecheck, customer API test, UI smoke, fast tests |
| 97 | done | Database column summary UI smoke | `tasks/done/database-column-summary-ui-smoke.md` | UI smoke, diff check |
| 98 | done | Embedded table page size UI smoke | `tasks/done/embedded-table-page-size-ui-smoke.md` | UI smoke, diff check |
| 99 | done | Editor scroll smoke performance regression | `tasks/done/editor-scroll-smoke-performance-regression.md` | editor scroll smoke, UI smoke, diff check |
| 100 | done | Database view sort and filter settings UI smoke | `tasks/done/database-view-sort-filter-settings-ui-smoke.md` | UI smoke, diff check |
| 101 | done | Database toolbar sort and filter popover UI smoke | `tasks/done/database-toolbar-sort-filter-popover-ui-smoke.md` | UI smoke, typecheck, diff check |
| 102 | done | Database view field visibility and order UI smoke | `tasks/done/database-view-field-visibility-order-ui-smoke.md` | UI smoke, diff check |
| 103 | done | Database select option cell dropdown UI smoke | `tasks/done/database-select-option-cell-dropdown-ui-smoke.md` | UI smoke, diff check |
| 104 | done | Database multi-select option cell dropdown UI smoke | `tasks/done/database-multiselect-option-cell-dropdown-ui-smoke.md` | UI smoke, diff check |
| 105 | done | Database view type switch UI smoke | `tasks/done/database-view-type-switch-ui-smoke.md` | UI smoke, diff check |
| 106 | done | Refresh task planning docs after queue progress | `tasks/done/refresh-task-planning-docs-after-queue-progress.md` | diff check |
| 107 | done | Database gallery and calendar view type smoke | `tasks/done/database-gallery-calendar-view-type-smoke.md` | UI smoke, diff check |
| 108 | done | Calendar view date field setting UI smoke | `tasks/done/calendar-view-date-field-setting-ui-smoke.md` | UI smoke, diff check |
| 109 | done | Gallery view cover field setting UI smoke | `tasks/done/gallery-view-cover-field-setting-ui-smoke.md` | UI smoke, typecheck, diff check |
| 110 | done | Gallery view URL cover rendering smoke | `tasks/done/gallery-view-url-cover-rendering-smoke.md` | UI smoke, typecheck, diff check |
| 111 | done | Calendar view hidden date field rendering smoke | `tasks/done/calendar-view-hidden-date-field-rendering-smoke.md` | UI smoke, typecheck, diff check |
| 112 | done | Option dropdown viewport clamp smoke | `tasks/done/option-dropdown-viewport-clamp-smoke.md` | UI smoke, typecheck, diff check |
| 113 | done | Remove unused local option dropdown fork | `tasks/done/remove-unused-local-option-dropdown-fork.md` | typecheck, diff check |
| 114 | done | Duplicate view preserves gallery calendar settings smoke | `tasks/done/duplicate-view-preserves-gallery-calendar-settings-smoke.md` | UI smoke, typecheck, diff check |
| 115 | done | Normalize done task status headers | `tasks/done/normalize-done-task-status-headers.md` | diff check |
| 116 | done | Refresh parity docs after queue item 115 | `tasks/done/refresh-parity-docs-after-queue-item-115.md` | diff check |
| 117 | done | Move popover positioning helper to renderer lib | `tasks/done/move-popover-positioning-helper-to-renderer-lib.md` | UI smoke, typecheck, diff check |
| 118 | done | Built-in plugin feature import boundary check | `tasks/done/builtin-plugin-feature-import-boundary-check.md` | file boundary test, diff check |
| 119 | done | Calendar month navigation smoke | `tasks/done/calendar-month-navigation-smoke.md` | UI smoke, diff check |
| 120 | done | Calendar today button smoke | `tasks/done/calendar-today-button-smoke.md` | UI smoke, diff check |
| 121 | done | Calendar today cell highlight | `tasks/done/calendar-today-cell-highlight.md` | UI smoke, typecheck, diff check |
| 122 | done | Calendar overflow row count smoke | `tasks/done/calendar-overflow-row-count-smoke.md` | UI smoke, diff check |
| 123 | done | Calendar overflow inline expand | `tasks/done/calendar-overflow-inline-expand.md` | UI smoke, typecheck, diff check |
| 124 | done | Calendar overflow reset on navigation | `tasks/done/calendar-overflow-reset-on-navigation.md` | UI smoke, typecheck, diff check |
| 125 | done | Gallery card row icon rendering | `tasks/done/gallery-card-row-icon-rendering.md` | UI smoke, typecheck, diff check |
| 126 | done | Calendar row icon rendering | `tasks/done/calendar-row-icon-rendering.md` | UI smoke, typecheck, diff check |
| 127 | done | Gallery empty state smoke | `tasks/done/gallery-empty-state-smoke.md` | UI smoke, typecheck, diff check |
| 128 | done | Full UI smoke after gallery calendar polish | `tasks/done/full-ui-smoke-after-gallery-calendar-polish.md` | full UI smoke, diff check |
| 129 | done | Refresh parity docs after queue item 128 | `tasks/done/refresh-parity-docs-after-queue-item-128.md` | diff check |
| 130 | done | Gallery date caption formatting | `tasks/done/gallery-date-caption-formatting.md` | UI smoke, typecheck, diff check |
| 131 | done | Calendar row open navigation smoke | `tasks/done/calendar-row-open-navigation-smoke.md` | UI smoke, diff check |
| 132 | done | Gallery card open navigation smoke | `tasks/done/gallery-card-open-navigation-smoke.md` | UI smoke, diff check |
| 133 | done | Gallery default row icon smoke | `tasks/done/gallery-default-row-icon-smoke.md` | UI smoke, diff check |
| 134 | done | Calendar default row icon smoke | `tasks/done/calendar-default-row-icon-smoke.md` | UI smoke, diff check |
| 135 | done | Calendar overflow row open smoke | `tasks/done/calendar-overflow-row-open-smoke.md` | UI smoke, diff check |
| 136 | done | Full UI smoke after gallery calendar navigation polish | `tasks/done/full-ui-smoke-after-gallery-calendar-navigation-polish.md` | full UI smoke, diff check |
| 137 | done | Refresh parity docs after queue item 136 | `tasks/done/refresh-parity-docs-after-queue-item-136.md` | diff check |
| 138 | done | Renderer plugin notify toast surface | `tasks/done/renderer-plugin-notify-toast-surface.md` | plugin UI smoke, typecheck, diff check |
| 139 | done | Plugin manager extension point titles | `tasks/done/plugin-manager-extension-point-titles.md` | plugin UI smoke, typecheck, diff check |
| 140 | done | Plugin manager permission summary | `tasks/done/plugin-manager-permission-summary.md` | plugin UI smoke, typecheck, diff check |
| 141 | done | Plugin commands in global search | `tasks/done/plugin-commands-in-global-search.md` | plugin UI smoke, typecheck, diff check |
| 142 | done | Command search label polish | `tasks/done/command-search-label-polish.md` | plugin UI smoke, typecheck, diff check |
| 143 | done | Command search keyboard activation smoke | `tasks/done/command-search-keyboard-activation-smoke.md` | plugin UI smoke, typecheck, diff check |
| 144 | done | Refresh parity docs after queue item 143 | `tasks/done/refresh-parity-docs-after-queue-item-143.md` | diff check |
| 145 | done | Command filter in global search | `tasks/done/command-filter-in-global-search.md` | plugin UI smoke, typecheck, diff check |
| 146 | done | List empty state smoke | `tasks/done/list-empty-state-smoke.md` | database template UI smoke, diff check |
| 147 | done | List row icon and open smoke | `tasks/done/list-row-icon-and-open-smoke.md` | database template UI smoke, diff check |
| 148 | done | List date property formatting smoke | `tasks/done/list-date-property-formatting-smoke.md` | database template UI smoke, diff check |
| 149 | done | Full UI smoke after command and list polish | `tasks/done/full-ui-smoke-after-command-and-list-polish.md` | full UI smoke, diff check |
| 150 | done | Refresh parity docs after queue item 149 | `tasks/done/refresh-parity-docs-after-queue-item-149.md` | diff check |
| 151 | done | Plugin attachment workspace API | `tasks/done/plugin-attachment-workspace-api.md` | customer API test, typecheck, diff check |
| 152 | done | Refresh parity docs after queue item 151 | `tasks/done/refresh-parity-docs-after-queue-item-151.md` | diff check |
| 153 | done | Plugin page delete workspace API | `tasks/done/plugin-page-delete-workspace-api.md` | customer API test, typecheck, diff check |
| 154 | done | Refresh parity docs after queue item 153 | `tasks/done/refresh-parity-docs-after-queue-item-153.md` | diff check |
| 155 | done | Plugin field delete workspace API | `tasks/done/plugin-field-delete-workspace-api.md` | customer API test, typecheck, diff check |
| 156 | done | Refresh parity docs after queue item 155 | `tasks/done/refresh-parity-docs-after-queue-item-155.md` | diff check |
| 157 | done | Plugin manager source drilldown | `tasks/done/plugin-manager-source-drilldown.md` | plugin UI smoke, typecheck, diff check |
| 158 | done | Refresh parity docs after queue item 157 | `tasks/done/refresh-parity-docs-after-queue-item-157.md` | diff check |
| 159 | done | Plugin manager provider source drilldown smoke | `tasks/done/plugin-manager-provider-source-drilldown-smoke.md` | plugin UI smoke, diff check |
| 160 | done | Refresh parity docs after queue item 159 | `tasks/done/refresh-parity-docs-after-queue-item-159.md` | diff check |
| 161 | done | Global search filter count badge polish | `tasks/done/global-search-filter-count-badge-polish.md` | plugin UI smoke, typecheck, diff check |
| 162 | done | Refresh parity docs after queue item 161 | `tasks/done/refresh-parity-docs-after-queue-item-161.md` | diff check |
| 163 | done | Plugin database delete workspace API | `tasks/done/plugin-database-delete-workspace-api.md` | customer API test, typecheck, diff check |
| 164 | done | Entity backlinks workspace API foundation | `tasks/done/entity-backlinks-workspace-api-foundation.md` | customer API test, typecheck, diff check |
| 165 | done | Page backlinks panel first pass | `tasks/done/page-backlinks-panel-first-pass.md` | typecheck, diff check |
| 166 | done | Page backlinks panel UI smoke | `tasks/done/page-backlinks-panel-ui-smoke.md` | page backlinks UI smoke, diff check |
| 167 | done | Refresh parity docs after backlinks panel | `tasks/done/refresh-parity-docs-after-backlinks-panel.md` | diff check |
| 168 | done | Backlink excerpt preview | `tasks/done/backlink-excerpt-preview.md` | page backlinks UI smoke, typecheck, diff check |
| 169 | done | Backlink count badge | `tasks/done/backlink-count-badge.md` | page backlinks UI smoke, typecheck, diff check |
| 170 | done | Backlink source path display | `tasks/done/backlink-source-path-display.md` | page backlinks UI smoke, typecheck, diff check |
| 171 | done | Refresh parity docs after backlink panel polish | `tasks/done/refresh-parity-docs-after-backlink-panel-polish.md` | diff check |
| 172 | done | Backlink source type chip | `tasks/done/backlink-source-type-chip.md` | page backlinks UI smoke, typecheck, diff check |
| 173 | done | Backlink property field context smoke | `tasks/done/backlink-property-field-context-smoke.md` | page backlinks UI smoke, typecheck, diff check |
| 174 | done | Backlink property row click smoke | `tasks/done/backlink-property-row-click-smoke.md` | page backlinks UI smoke, typecheck, diff check |
| 175 | done | Refresh parity docs after backlink property smokes | `tasks/done/refresh-parity-docs-after-backlink-property-smokes.md` | diff check |
| 176 | done | Backlink property excerpt labels | `tasks/done/backlink-property-excerpt-labels.md` | customer API test, page backlinks UI smoke, typecheck, diff check |
| 177 | done | Backlink duplicate source collapse | `tasks/done/backlink-duplicate-source-collapse.md` | customer API test, page backlinks UI smoke, typecheck, diff check |
| 178 | done | Refresh parity docs after backlink duplicate collapse | `tasks/done/refresh-parity-docs-after-backlink-duplicate-collapse.md` | diff check |
| 179 | done | CSV parser no-quote fast path | `tasks/done/csv-parser-no-quote-fast-path.md` | package core test, typecheck, latency gate, diff check |
| 180 | done | Refresh performance roadmap after CSV fast path | `tasks/done/refresh-performance-roadmap-after-csv-fast-path.md` | diff check |
| 181 | done | View-query benchmark CSV parser parity | `tasks/done/view-query-benchmark-csv-parser-parity.md` | latency gate, diff check |
| 182 | done | CSV read latency guard | `tasks/done/csv-read-latency-guard.md` | csv read latency gate, diff check |
| 183 | done | Refresh large-database baseline wording | `tasks/done/refresh-large-database-baseline-wording.md` | diff check |
| 184 | done | Clarify CSV parsing rule after fast path | `tasks/done/clarify-csv-parsing-rule-after-fast-path.md` | diff check |
| 185 | done | Refresh testing docs for CSV read latency guard | `tasks/done/refresh-testing-docs-for-csv-read-latency.md` | diff check |
| 186 | done | Normalize recent done task status headers | `tasks/done/normalize-recent-done-task-status-headers.md` | diff check |
| 187 | done | Refresh latency benchmark backlog wording | `tasks/done/refresh-latency-benchmark-backlog-wording.md` | diff check |
| 188 | done | Notion audit missing original CSV regression | `tasks/done/notion-audit-missing-original-csv-regression.md` | import service test, diff check |
| 189 | done | Notion audit database original CSV link regression | `tasks/done/notion-audit-database-original-csv-link-regression.md` | typecheck, import service test, diff check |
| 190 | done | Notion audit broken database original CSV path regression | `tasks/done/notion-audit-broken-database-original-csv-path-regression.md` | import service test, diff check |
| 191 | done | Notion audit broken row original HTML path regression | `tasks/done/notion-audit-broken-row-original-html-path-regression.md` | import service test, diff check |
| 192 | done | Notion audit original HTML resource link regression | `tasks/done/notion-audit-original-html-resource-link-regression.md` | typecheck, import service test, diff check |
| 193 | done | Document original HTML resource audit coverage | `tasks/done/document-original-html-resource-audit-coverage.md` | diff check |
| 194 | done | Notion audit HTML body text mismatch regression | `tasks/done/notion-audit-html-body-text-mismatch-regression.md` | import service test, diff check |
| 195 | done | Notion audit missing body file regression | `tasks/done/notion-audit-missing-body-file-regression.md` | import service test, diff check |
| 196 | done | Notion audit empty body file regression | `tasks/done/notion-audit-empty-body-file-regression.md` | import service test, diff check |
| 197 | done | Notion audit missing body path regression | `tasks/done/notion-audit-missing-body-path-regression.md` | import service test, diff check |
| 198 | done | Normalize imported number cell values | `tasks/done/normalize-imported-number-cell-values.md` | typecheck, import service test, diff check |
| 199 | done | Notion audit noncanonical number cells | `tasks/done/notion-audit-noncanonical-number-cells.md` | typecheck, import service test, diff check |
| 200 | done | Notion audit invalid URL cells | `tasks/done/notion-audit-invalid-url-cells.md` | typecheck, import service test, diff check |
| 201 | done | Notion audit select option cells | `tasks/done/notion-audit-select-option-cells.md` | typecheck, import service test, diff check |
| 202 | done | Notion audit invalid date cells | `tasks/done/notion-audit-invalid-date-cells.md` | typecheck, import service test, diff check |
| 203 | done | Notion audit missing entity ref target | `tasks/done/notion-audit-missing-entity-ref-target.md` | import service test, diff check |
| 204 | done | Notion audit unstructured entity ref cells | `tasks/done/notion-audit-unstructured-entity-ref-cells.md` | import service test, diff check |
| 205 | done | Notion audit database path mismatch | `tasks/done/notion-audit-database-path-mismatch.md` | import service test, diff check |
| 206 | done | Notion audit duplicate database paths | `tasks/done/notion-audit-duplicate-database-paths.md` | import service test, diff check |
| 207 | done | Skip unclaimed system-only row HTML | `tasks/done/skip-unclaimed-system-only-row-html.md` | import service test, diff check |
| 208 | done | Refresh Asset Tracker pitfall after system-only row skip | `tasks/done/refresh-asset-tracker-pitfall-after-system-only-row-skip.md` | diff check |
| 209 | done | Notion audit checkbox cells | `tasks/done/notion-audit-checkbox-cells.md` | typecheck, import service test, diff check |
| 210 | done | Refresh Notion import field type docs | `tasks/done/refresh-notion-import-field-type-docs.md` | diff check |
| 211 | done | Refresh Notion import icon docs | `tasks/done/refresh-notion-import-icon-docs.md` | diff check |
| 212 | done | Markdown export page icon import | `tasks/done/markdown-export-page-icon-import.md` | typecheck, import service test, diff check |
| 213 | done | Markdown export database links open views | `tasks/done/markdown-export-database-links-open-views.md` | typecheck, import service test, diff check |
| 214 | done | Markdown export phantom database wrapper skip | `tasks/done/markdown-export-phantom-database-wrapper-skip.md` | typecheck, import service test, diff check |
| 215 | done | CSV-only Notion import field type inference | `tasks/done/csv-only-notion-import-field-type-inference.md` | typecheck, import service test, diff check |
| 216 | done | Refresh Notion import system time docs | `tasks/done/refresh-notion-import-system-time-docs.md` | diff check |
| 217 | done | Notion import page cover image metadata | `tasks/done/notion-import-page-cover-image-metadata.md` | typecheck, import service test, diff check |
| 218 | done | Markdown link label escape preview | `tasks/done/markdown-link-label-escape-preview.md` | typecheck, markdown preview UI smoke, diff check |
| 219 | done | Notion import underline live preview | `tasks/done/notion-import-underline-live-preview.md` | typecheck, notion HTML test, markdown preview UI smoke, diff check |
| 220 | done | Notion import option color regression | `tasks/done/notion-import-option-color-regression.md` | typecheck, import service test, diff check |
| 221 | done | Notion import highlight live preview | `tasks/done/notion-import-highlight-live-preview.md` | typecheck, notion HTML test, markdown preview UI smoke, diff check |
| 222 | done | Indify iframe preview smoke and docs | `tasks/done/indify-iframe-preview-smoke-and-docs.md` | markdown preview UI smoke, diff check |
| 223 | done | Attachment media preview smoke | `tasks/done/attachment-media-preview-smoke.md` | source attachments UI smoke, diff check |
| 224 | done | Notion import inline text color preview | `tasks/done/notion-import-inline-text-color-preview.md` | typecheck, notion HTML test, markdown preview UI smoke, diff check |
| 225 | done | Notion import toggle block preview | `tasks/done/notion-import-toggle-block-preview.md` | typecheck, notion HTML test, markdown preview UI smoke, diff check |
| 226 | done | Toggle preview edit source affordance | `tasks/done/toggle-preview-edit-source-affordance.md` | typecheck, markdown preview UI smoke, diff check |
| 227 | done | Notion import equation preview | `tasks/done/notion-import-equation-preview.md` | typecheck, notion HTML test, markdown preview UI smoke, diff check |
| 228 | done | Notion import person field type | `tasks/done/notion-import-person-field-type.md` | typecheck, import service test, diff check |
| 229 | done | Notion import paragraph block colors | `tasks/done/notion-import-paragraph-block-colors.md` | typecheck, notion HTML test, diff check |
| 230 | done | Notion import heading block colors | `tasks/done/notion-import-heading-block-colors.md` | typecheck, notion HTML test, diff check |
| 231 | done | Notion import highlight color fidelity | `tasks/done/notion-import-highlight-color-fidelity.md` | typecheck, notion HTML test, diff check |
| 232 | done | Refresh parity docs after import fidelity passes | `tasks/done/refresh-parity-docs-after-import-fidelity-passes.md` | diff check |
| 233 | done | Notion import callout background color | `tasks/done/notion-import-callout-background-color.md` | typecheck, notion HTML test, markdown preview UI smoke, diff check |
| 234 | done | Notion import quote block colors | `tasks/done/notion-import-quote-block-colors.md` | typecheck, notion HTML test, diff check |
| 235 | done | Notion import list item block colors | `tasks/done/notion-import-list-item-block-colors.md` | typecheck, notion HTML test, markdown preview UI smoke, diff check |
| 236 | done | Notion import nested list color regression | `tasks/done/notion-import-nested-list-color-regression.md` | notion HTML test, diff check |
| 237 | done | Refresh Notion block color pitfalls | `tasks/done/refresh-notion-block-color-pitfalls.md` | diff check |
| 238 | done | Refresh parity status after block color passes | `tasks/done/refresh-parity-status-after-block-color-passes.md` | diff check |
| 239 | done | Renderer plugin page move workspace API | `tasks/done/renderer-plugin-page-move-workspace-api.md` | typecheck, customer API test, diff check |
| 240 | done | Renderer plugin modal and context menu primitives | `tasks/done/renderer-plugin-modal-context-menu-primitives.md` | typecheck, diff check |
| 241 | done | Search quick switcher recent defaults | `tasks/done/search-quick-switcher-recent-defaults.md` | typecheck, diff check |
| 242 | done | Search result opens at matching markdown line | `tasks/done/search-result-opens-at-matching-markdown-line.md` | typecheck, diff check |
| 243 | done | Cmd-click links in raw markdown mode | `tasks/done/raw-markdown-cmd-click-links.md` | typecheck, markdown preview smoke, diff check |
| 244 | done | Back and forward target tooltips | `tasks/done/back-forward-target-tooltips.md` | typecheck, sidebar navigation smoke, diff check |
| 245 | done | Search jump-to-line UI smoke | `tasks/done/search-jump-to-line-ui-smoke.md` | search UI smoke, diff check |
| 246 | done | Collapse inactive callout source blocks | `tasks/done/collapse-inactive-callout-source-blocks.md` | typecheck, markdown preview smoke, diff check |
| 247 | done | Align callout preview with page content | `tasks/done/align-callout-preview-with-page-content.md` | typecheck, markdown preview smoke, diff check |
| 248 | done | Resolve imported database collection placeholders | `tasks/done/resolve-imported-database-collection-placeholders.md` | typecheck, notion HTML converter test, notion import service test, diff check |
| 249 | done | Polish row property date and read-only import fields | `tasks/done/polish-row-property-date-readonly-fields.md` | typecheck, manual Electron UI smoke, diff check |
| 250 | done | Highlight URL file paths in database cells | `tasks/done/highlight-url-file-paths-in-database-cells.md` | typecheck, URL field UI smoke assertion, diff check |
| 251 | done | Sort imported database columns by content richness | `tasks/done/sort-imported-database-columns-by-content-richness.md` | typecheck, notion import service test, diff check |
| 252 | done | Configure sidebar sections by selected tags | `tasks/done/configure-sidebar-sections-by-selected-tags.md` | typecheck, diff check, manual Electron UI smoke |
| 253 | done | Make embedded table load-more affordance clearer | `tasks/done/make-embedded-table-load-more-affordance-clearer.md` | typecheck, diff check |
| 254 | done | Surface LLM chat window in the frontend | `tasks/done/surface-llm-chat-window-in-frontend.md` | typecheck, package core test, manual Electron UI smoke, diff check |
| 255 | done | Row page property field management and editable values | `tasks/done/row-page-property-field-management-and-editable-values.md` | typecheck, build, manual Electron UI smoke, diff check |
| 256 | done | Recover page titles from existing Markdown files | `tasks/done/recover-page-titles-from-existing-markdown-files.md` | typecheck, package core test, temp workspace recovery dry-run, diff check |
| 257 | done | Align row page property controls | `tasks/done/align-row-page-property-controls.md` | typecheck, manual Electron UI smoke, diff check |
| 258 | done | Row page property alignment regression smoke | `tasks/done/row-page-property-alignment-regression-smoke.md` | typecheck, row-page navigation UI smoke, build, diff check |
| 259 | done | Row page property font-size consistency | `tasks/done/row-page-property-font-size-consistency.md` | typecheck, row-page navigation UI smoke, diff check |
| 260 | done | Row property option pill font-size consistency | `tasks/done/row-property-option-pill-font-size-consistency.md` | typecheck, row-page navigation UI smoke, diff check |
| 261 | done | Sidebar quick-create page and database actions | `tasks/done/sidebar-quick-create-page-database-actions.md` | typecheck, sidebar navigation UI smoke, diff check |
| 262 | done | Notion-like sidebar new page icon | `tasks/done/notion-like-sidebar-new-page-icon.md` | typecheck, sidebar navigation UI smoke, diff check |
| 263 | done | Sidebar quick-create chooser and recents | `tasks/done/sidebar-quick-create-chooser-and-recents.md` | typecheck, sidebar navigation UI smoke, diff check |
| 264 | done | Keep editable URL fields editable | `tasks/done/keep-editable-url-fields-editable.md` | typecheck, URL field UI smoke, diff check |
| 265 | done | Image preview edit-source hover affordance | `tasks/done/image-preview-edit-source-hover-affordance.md` | typecheck, markdown preview UI smoke, diff check |
| 266 | done | Hide image source again after editing focus leaves | `tasks/done/hide-image-source-after-edit-focus-leaves.md` | typecheck, markdown preview UI smoke, diff check |
| 267 | done | Sidebar page context menu actions | `tasks/done/sidebar-page-context-menu-actions.md` | typecheck, sidebar navigation UI smoke, diff check |
| 268 | done | Debounce global search input rendering | `tasks/done/debounce-global-search-input-rendering.md` | typecheck, search UI smoke, diff check |
| 269 | done | Prevent URL cell display overlap | `tasks/done/prevent-url-cell-display-overlap.md` | typecheck, URL field UI smoke, diff check |
| 270 | done | Default database view column richness order | `tasks/done/default-database-view-column-richness-order.md` | typecheck, package core test, notion import service test, embedded view UI smoke, diff check |
| 271 | done | Direct table cell editing from rendered tables | `tasks/done/direct-table-cell-editing-from-rendered-tables.md` | typecheck, markdown preview UI smoke, row-page navigation UI smoke, diff check |
| 272 | done | Restore HTML strikethrough preview rendering | `tasks/done/restore-html-strikethrough-preview-rendering.md` | typecheck, markdown preview UI smoke, diff check |
| 273 | done | Render imported single-tilde strikethrough | `tasks/done/render-imported-single-tilde-strikethrough.md` | typecheck, markdown preview UI smoke, diff check |
| 274 | done | Restore bold and italic preview rendering | `tasks/done/restore-bold-italic-preview-rendering.md` | typecheck, markdown preview UI smoke, diff check |
| 275 | done | Add coded LLM Chat UI regression coverage | `tasks/done/add-coded-llm-chat-ui-regression-coverage.md` | typecheck, LLM Chat UI smoke, diff check |
| 276 | done | Add coded sidebar section settings regression coverage | `tasks/done/add-coded-sidebar-section-settings-regression-coverage.md` | typecheck, sidebar settings UI smoke, diff check |
| 277 | done | Normalize existing default view column richness order | `tasks/done/normalize-existing-default-view-column-richness-order.md` | typecheck, package core test, embedded view UI smoke, diff check |
| 278 | done | Add coded row-page property management regression coverage | `tasks/done/add-coded-row-page-property-management-regression-coverage.md` | typecheck, row-page navigation UI smoke, diff check |
| 279 | done | Add coded embedded table load-more affordance regression coverage | `tasks/done/add-coded-embedded-table-load-more-affordance-regression-coverage.md` | typecheck, embedded view UI smoke, diff check |
| 280 | done | Add coded new-page editing regression coverage | `tasks/done/add-coded-new-page-editing-regression-coverage.md` | typecheck, sidebar navigation UI smoke, diff check |
| 281 | done | Add coded LLM Chat interaction UI regression coverage | `tasks/done/add-coded-llm-chat-interaction-ui-regression-coverage.md` | typecheck, LLM Chat UI smoke, package core test, diff check |
| 282 | done | Add coded search quick-switcher recent defaults regression coverage | `tasks/done/add-coded-search-quick-switcher-recent-defaults-regression-coverage.md` | typecheck, search title UI smoke, diff check |
| 283 | done | LLM Chat permissions, history, and model picker polish | `tasks/done/llm-chat-permissions-history-and-model-picker-polish.md` | typecheck, LLM Chat UI smoke, package core test, diff check |
| 284 | done | Production frontend UI test foundation | `tasks/done/production-frontend-ui-test-foundation.md` | typecheck, editor regression UI harness suite, diff check |
| 285 | done | Advanced search and local vector index | `tasks/done/advanced-search-local-vector-index.md` | typecheck, package-core advanced search tests, advanced search UI smoke, diff check |
| 286 | done | GitHub-backed page history and workspace backup | `tasks/done/github-backed-page-history-and-workspace-backup.md` | typecheck, mocked GitHub service tests, GitHub backup UI smoke, diff check |
| 287 | done | Row-page property visual regression first slice | `tasks/done/row-page-property-visual-regression-first-slice.md` | typecheck, row-page navigation UI smoke, diff check |
| 288 | done | Notion import audit UI harness multiviewport | `tasks/done/notion-import-audit-ui-harness-multiviewport.md` | typecheck, notion import UI smoke, diff check |
| 289 | done | Advanced search plugin cost guard | `tasks/done/advanced-search-plugin-cost-guard.md` | package-core advanced search guard, diff check |
| 290 | done | Markdown preview multiviewport emphasis regression | `tasks/done/markdown-preview-multiviewport-emphasis-regression.md` | typecheck, markdown preview harness UI smoke, diff check |
| 291 | done | Editor selection replacement regression | `tasks/done/editor-selection-replacement-regression.md` | typecheck, editor regression UI smoke, diff check |
| 292 | done | Navigation history markdown anchor regression | `tasks/done/navigation-history-markdown-anchor-regression.md` | typecheck, navigation anchor UI smoke, diff check |
| 293 | done | Markdown table direct editing harness regression | `tasks/done/markdown-table-direct-editing-harness-regression.md` | typecheck, markdown preview harness UI smoke, diff check |
| 294 | done | Sidebar navigation shared harness migration | `tasks/done/sidebar-navigation-shared-harness-migration.md` | typecheck, sidebar navigation UI smoke, diff check |
| 295 | done | Search title shared harness migration | `tasks/done/search-title-shared-harness-migration.md` | typecheck, search title UI smoke, diff check |
| 296 | done | Search latency shared harness migration | `tasks/done/search-latency-shared-harness-migration.md` | typecheck, search UI smoke, diff check |
| 297 | done | LLM chat shared harness migration | `tasks/done/llm-chat-shared-harness-migration.md` | typecheck, LLM chat UI smoke, diff check |
| 298 | done | Plugin manager shared harness migration | `tasks/done/plugin-manager-shared-harness-migration.md` | typecheck, plugin manager UI smoke, diff check |
| 299 | done | Sidebar settings shared harness migration | `tasks/done/sidebar-settings-shared-harness-migration.md` | typecheck, sidebar settings UI smoke, diff check |
| 300 | done | URL field shared harness migration | `tasks/done/url-field-shared-harness-migration.md` | typecheck, URL field UI smoke, diff check |
| 301 | done | Image lightbox shared harness migration | `tasks/done/image-lightbox-shared-harness-migration.md` | typecheck, image lightbox UI smoke, diff check |
| 302 | done | Page path slash shared harness migration | `tasks/done/page-path-slash-shared-harness-migration.md` | typecheck, page path slash UI smoke, diff check |
| 303 | done | Source attachments shared harness migration | `tasks/done/source-attachments-shared-harness-migration.md` | typecheck, source attachments UI smoke, diff check |
| 304 | done | Page backlinks shared harness migration | `tasks/done/page-backlinks-shared-harness-migration.md` | typecheck, page backlinks UI smoke, diff check |
| 305 | done | Editor scroll shared harness migration | `tasks/done/editor-scroll-shared-harness-migration.md` | typecheck, editor scroll UI smoke, diff check |
| 306 | done | Window popout shared harness migration | `tasks/done/window-popout-shared-harness-migration.md` | typecheck, window popout UI smoke, diff check |
| 307 | done | Embedded view shared harness migration | `tasks/done/embedded-view-shared-harness-migration.md` | typecheck, embedded view UI smoke, diff check |
| 308 | done | Markdown preview broad smoke shared harness migration | `tasks/done/markdown-preview-broad-smoke-shared-harness-migration.md` | typecheck, markdown preview UI smoke, diff check |
| 309 | done | Database template shared harness migration | `tasks/done/database-template-shared-harness-migration.md` | typecheck, database template UI smoke, diff check |
| 310 | done | UI suite runner shared harness lifecycle | `tasks/done/ui-suite-runner-shared-harness-lifecycle.md` | typecheck, representative UI smoke, diff check |
| 311 | done | UI harness failure artifact diagnostics | `tasks/done/ui-harness-failure-artifact-diagnostics.md` | typecheck, UI harness artifact test, representative UI smoke, diff check |
| 312 | done | Editor line-merge backspace regression | `tasks/done/editor-line-merge-backspace-regression.md` | typecheck, editor regression UI smoke, diff check |
| 313 | done | Editor page-switch focus restoration | `tasks/done/editor-page-switch-focus-restoration.md` | typecheck, editor regression UI smoke, diff check |
| 314 | done | Renderer component row-property regression | `tasks/done/renderer-component-row-property-regression.md` | typecheck, renderer component test, diff check |
| 315 | done | Include renderer component regressions in fast gate | `tasks/done/include-renderer-component-regressions-in-fast-gate.md` | renderer component test, fast test, diff check |
| 316 | done | Renderer component property link regression | `tasks/done/renderer-component-property-link-regression.md` | renderer component test, typecheck, diff check |
| 317 | done | Renderer component field settings dialog regression | `tasks/done/renderer-component-field-settings-dialog-regression.md` | renderer component test, typecheck, diff check |
| 318 | done | Renderer component row property settings affordance | `tasks/done/renderer-component-row-property-settings-affordance.md` | renderer component test, typecheck, diff check |
| 319 | done | Renderer component database cell regression | `tasks/done/renderer-component-database-cell-regression.md` | renderer component test, typecheck, diff check |
| 320 | done | Renderer component view settings dialog regression | `tasks/done/renderer-component-view-settings-dialog-regression.md` | renderer component test, typecheck, diff check |
| 321 | done | Renderer component row template dialog regression | `tasks/done/renderer-component-row-template-dialog-regression.md` | renderer component test, typecheck, diff check |
| 322 | done | Renderer component database chrome regression | `tasks/done/renderer-component-database-chrome-regression.md` | renderer component test, typecheck, diff check |
| 323 | done | Renderer component database alternate views regression | `tasks/done/renderer-component-database-alternate-views-regression.md` | renderer component test, typecheck, diff check |
| 324 | done | Renderer component database template picker regression | `tasks/done/renderer-component-database-template-picker-regression.md` | renderer component test, typecheck, diff check |
| 325 | done | Renderer component database table grid regression | `tasks/done/renderer-component-database-table-grid-regression.md` | renderer component test, typecheck, diff check |
| 326 | done | Renderer component database popover regression | `tasks/done/renderer-component-database-popover-regression.md` | renderer component test, typecheck, diff check |
| 327 | done | Renderer component global search panel regression | `tasks/done/renderer-component-global-search-panel-regression.md` | renderer component test, typecheck, diff check |
| 328 | done | Renderer component icon primitive regression | `tasks/done/renderer-component-icon-primitive-regression.md` | renderer component test, typecheck, diff check |
| 329 | done | Renderer component slash menu regression | `tasks/done/renderer-component-slash-menu-regression.md` | renderer component test, typecheck, diff check |
| 330 | done | Renderer component page editor shell regression | `tasks/done/renderer-component-page-editor-shell-regression.md` | renderer component test, typecheck, diff check |
| 331 | done | Renderer component page backlinks regression | `tasks/done/renderer-component-page-backlinks-regression.md` | renderer component test, typecheck, diff check |
| 332 | done | Renderer component page cover area regression | `tasks/done/renderer-component-page-cover-area-regression.md` | renderer component test, typecheck, diff check |
| 333 | done | Renderer component tab strip regression | `tasks/done/renderer-component-tab-strip-regression.md` | renderer component test, typecheck, diff check |
| 334 | done | Renderer component management view regression | `tasks/done/renderer-component-management-view-regression.md` | renderer component test, typecheck, diff check |
| 335 | done | Renderer component management databases view regression | `tasks/done/renderer-component-management-databases-view-regression.md` | renderer component test, typecheck, diff check |
| 336 | done | Renderer component workspace selector regression | `tasks/done/renderer-component-workspace-selector-regression.md` | renderer component test, typecheck, diff check |
| 337 | done | Renderer component backup button regression | `tasks/done/renderer-component-backup-button-regression.md` | renderer component test, typecheck, diff check |
| 338 | done | Renderer component sidebar search box regression | `tasks/done/renderer-component-sidebar-search-box-regression.md` | renderer component test, typecheck, diff check |
| 339 | done | Renderer component Notion import panel regression | `tasks/done/renderer-component-notion-import-panel-regression.md` | renderer component test, typecheck, diff check |
| 340 | done | Renderer component Notion import modal regression | `tasks/done/renderer-component-notion-import-modal-regression.md` | renderer component test, typecheck, diff check |
| 341 | done | Renderer component plugin manager regression | `tasks/done/renderer-component-plugin-manager-regression.md` | renderer component test, typecheck, diff check |
| 342 | done | Renderer component Notion audit panel regression | `tasks/done/renderer-component-notion-audit-panel-regression.md` | renderer component test, typecheck, diff check |
| 343 | done | Renderer component Notion audit result regression | `tasks/done/renderer-component-notion-audit-result-regression.md` | renderer component test, typecheck, diff check |
| 344 | done | Renderer component sidebar shell regression | `tasks/done/renderer-component-sidebar-shell-regression.md` | renderer component test, typecheck, diff check |
| 345 | done | Renderer component app shell regression | `tasks/done/renderer-component-app-shell-regression.md` | renderer component test, typecheck, diff check |
| 346 | done | Renderer component embedded view renderer regression | `tasks/done/renderer-component-embedded-view-renderer-regression.md` | renderer component test, typecheck, diff check |
| 347 | done | Renderer component advanced search panel regression | `tasks/done/renderer-component-advanced-search-panel-regression.md` | renderer component test, typecheck, diff check |
| 348 | done | Renderer component GitHub backup panel regression | `tasks/done/renderer-component-github-backup-panel-regression.md` | renderer component test, typecheck, diff check |
| 349 | done | Renderer component Git Sync panel regression | `tasks/done/renderer-component-git-sync-panel-regression.md` | renderer component test, typecheck, diff check |
| 350 | done | Renderer component default field providers regression | `tasks/done/renderer-component-default-field-providers-regression.md` | renderer component test, typecheck, diff check |
| 351 | done | Git Sync scheduler automation regression | `tasks/done/git-sync-scheduler-automation-regression.md` | package-core scheduler test, typecheck, diff check |
| 352 | done | Renderer component page layout regression | `tasks/done/renderer-component-page-layout-regression.md` | renderer component test, typecheck, diff check |
| 353 | done | Plugin storage JSON and delete regression | `tasks/done/plugin-storage-json-delete-regression.md` | package-core storage test, typecheck, diff check |
| 354 | done | GitHub REST backup adapter mocked HTTP regression | `tasks/done/github-rest-backup-adapter-mocked-http-regression.md` | package-core github adapter test, typecheck, diff check |
| 355 | done | Renderer component GitHub backup empty and failure states | `tasks/done/renderer-component-github-backup-empty-failure-states.md` | renderer component test, typecheck, diff check |
| 356 | done | Renderer component Notion import latest report entry | `tasks/done/renderer-component-notion-import-latest-report-entry.md` | renderer component test, typecheck, diff check |
| 357 | done | Renderer component Notion audit passing result | `tasks/done/renderer-component-notion-audit-passing-result.md` | renderer component test, typecheck, diff check |
| 358 | done | Markdown task checkbox preview toggle regression | `tasks/done/markdown-task-checkbox-preview-toggle-regression.md` | typecheck, markdown preview UI smoke, diff check |
| 359 | done | Missing imported database placeholder preview | `tasks/done/missing-imported-database-placeholder-preview.md` | typecheck, markdown preview UI smoke, diff check |
| 360 | done | Notion converter missing collection placeholder regression | `tasks/done/notion-converter-missing-collection-placeholder-regression.md` | notion html converter test, typecheck, diff check |
| 361 | done | Row page property visual snapshot artifact | `tasks/done/row-page-property-visual-snapshot-artifact.md` | ui harness artifact test, row-page navigation UI smoke, typecheck, diff check |
| 362 | done | Notion import audit visual snapshot artifact | `tasks/done/notion-import-audit-visual-snapshot-artifact.md` | notion import UI smoke, typecheck, diff check |
| 363 | done | Markdown preview visual snapshot artifact | `tasks/done/markdown-preview-visual-snapshot-artifact.md` | markdown preview UI smoke, typecheck, diff check |
| 364 | done | Search quick switcher visual snapshot artifact | `tasks/done/search-quick-switcher-visual-snapshot-artifact.md` | search title UI smoke, typecheck, diff check |
| 365 | done | LLM chat visual snapshot artifact | `tasks/done/llm-chat-visual-snapshot-artifact.md` | LLM chat UI smoke, typecheck, diff check |
| 366 | done | Gallery calendar view visual snapshot artifact | `tasks/done/gallery-calendar-view-visual-snapshot-artifact.md` | database template UI smoke, typecheck, diff check |
| 367 | done | Built-in command palette navigation actions | `tasks/done/built-in-command-palette-navigation-actions.md` | search title UI smoke, renderer component test, typecheck, diff check |
| 368 | done | Built-in command palette database and plugin action coverage | `tasks/done/built-in-command-palette-database-plugin-action-coverage.md` | search title UI smoke, typecheck, diff check |
| 369 | done | Row property option search affordance | `tasks/done/row-property-option-search-affordance.md` | row-page navigation UI smoke, renderer component test, typecheck, diff check |
| 370 | done | Row property tag chips navigate to search | `tasks/done/row-property-tag-chip-search-navigation.md` | row-page navigation UI smoke, renderer component test, typecheck, diff check |
| 371 | done | Backlink keyboard navigation affordance | `tasks/done/backlink-keyboard-navigation-affordance.md` | page backlinks UI smoke, typecheck, diff check |
| 372 | done | Backlink focus-visible affordance | `tasks/done/backlink-focus-visible-affordance.md` | page backlinks UI smoke, typecheck, diff check |
| 373 | done | Editor long paste overflow regression | `tasks/done/editor-long-paste-overflow-regression.md` | editor regression UI smoke, typecheck, diff check |
| 374 | done | GitHub backup preview layout regression | `tasks/done/github-backup-preview-layout-regression.md` | github backup UI smoke, typecheck, diff check |
| 375 | done | Focused UI regression aggregate gate | `tasks/done/focused-ui-regression-aggregate-gate.md` | ui regression aggregate, typecheck, diff check |
| 376 | done | Page small-text layout setting | `tasks/done/page-small-text-layout-setting.md` | editor regression UI smoke, package-core test, typecheck, diff check |
| 377 | done | Top-level page tag search chips | `tasks/done/top-level-page-tag-search-chips.md` | editor regression UI smoke, typecheck, diff check |
| 378 | done | Slash todo task checkbox editing regression | `tasks/done/slash-todo-task-checkbox-editing-regression.md` | editor regression UI smoke, typecheck, diff check |
| 379 | done | Slash divider editing regression | `tasks/done/slash-divider-editing-regression.md` | editor regression UI smoke, slash command test, typecheck, diff check |
| 380 | done | HIGHEST: Markdown link click editing regression | `tasks/done/markdown-url-click-editing-regression.md` | editor regression UI smoke, typecheck, diff check |
| 381 | done | HIGHEST: Page open backlink latency cache regression | `tasks/done/page-open-backlink-latency-cache-regression.md` | repeated page-open UI smoke, backlink cache tests, latency benchmark, typecheck, diff check |
| 382 | done | HIGHEST: Page properties and TOC auto-hide | `tasks/done/page-properties-and-toc-auto-hide.md` | page editor UI smoke, renderer coverage, typecheck, diff check |
| 383 | done | HIGHEST: First launch loading visibility regression | `tasks/done/first-launch-loading-visibility-regression.md` | first-launch large-workspace UI smoke, startup latency benchmark, backend startup tests, typecheck, diff check |
| 384 | done | HIGHEST: Toggle direct editing regression | `tasks/done/toggle-direct-editing-regression.md` | markdown preview UI smoke, renderer component test, typecheck, diff check |
| 385 | done | HIGHEST: Search large-result progress visibility | `tasks/done/search-large-result-progress-visibility.md` | search UI smoke, search latency benchmark, renderer coverage, typecheck, diff check |
| 386 | done | HIGHEST: Image lightbox zoom controls | `tasks/done/image-lightbox-zoom-controls.md` | image lightbox UI smoke, renderer coverage, typecheck, diff check |
| 387 | done | HIGHEST: Link open icon hit target polish | `tasks/done/link-open-icon-hit-target-polish.md` | URL/property link UI smoke, renderer coverage, typecheck, diff check |
| 388 | done | Command palette favorite current page | `tasks/done/command-palette-favorite-current-page.md` | search title UI smoke, renderer coverage, typecheck, diff check |
| 389 | done | Command palette toggle current page full width | `tasks/done/command-palette-toggle-current-page-full-width.md` | search title UI smoke, renderer coverage, typecheck, diff check |
| 390 | done | Command palette toggle current page small text | `tasks/done/command-palette-toggle-current-page-small-text.md` | search title UI smoke, renderer coverage, typecheck, diff check |
| 391 | done | Command palette open current item in new window | `tasks/done/command-palette-open-current-in-new-window.md` | search title UI smoke, renderer coverage, typecheck, diff check |
| 392 | done | Command palette open recent management | `tasks/done/command-palette-open-recent-management.md` | search title UI smoke, renderer coverage, typecheck, diff check |
| 393 | done | Command palette open sidebar settings | `tasks/done/command-palette-open-sidebar-settings.md` | search title UI smoke, renderer coverage, typecheck, diff check |
| 394 | done | Command palette toggle raw markdown mode | `tasks/done/command-palette-toggle-raw-markdown-mode.md` | search title UI smoke, renderer coverage, typecheck, diff check |
| 395 | done | Command palette toggle embed source visibility | `tasks/done/command-palette-toggle-embed-source-visibility.md` | search title UI smoke, renderer coverage, typecheck, diff check |
| 396 | done | Command palette toggle Vim mode | `tasks/done/command-palette-toggle-vim-mode.md` | search title UI smoke, renderer coverage, typecheck, diff check |
| 397 | done | Command palette opens Advanced Search plugin | `tasks/done/command-palette-opens-advanced-search-plugin.md` | search title UI smoke, renderer coverage, typecheck, diff check |
| 398 | done | Command palette opens GitHub Backup plugin | `tasks/done/command-palette-opens-github-backup-plugin.md` | search title UI smoke, renderer coverage, typecheck, diff check |
| 399 | done | Missing database placeholder search affordance | `tasks/done/missing-database-placeholder-search-affordance.md` | markdown preview UI smoke, typecheck, diff check |
| 400 | done | Slash callout inserts Lotion callout block | `tasks/done/slash-callout-inserts-lotion-callout-block.md` | slash tests, editor regression UI smoke, typecheck, diff check |
| 401 | done | Slash code block continuation newline | `tasks/done/slash-code-block-continuation-newline.md` | slash tests, editor regression UI smoke, typecheck, diff check |
| 402 | done | Slash quote inserts editable blockquote | `tasks/done/slash-quote-inserts-editable-blockquote.md` | slash tests, editor regression UI smoke, typecheck, diff check |
| 403 | done | Slash page link inserts navigable page reference | `tasks/done/slash-page-link-inserts-navigable-reference.md` | slash tests, editor regression UI smoke, typecheck, diff check |
| 404 | done | Slash database command inserts embedded view | `tasks/done/slash-database-command-inserts-embedded-view.md` | slash tests, editor regression UI smoke, typecheck, diff check |
| 405 | done | Slash list commands insert editable lists | `tasks/done/slash-list-commands-insert-editable-lists.md` | slash tests, editor regression UI smoke, typecheck, diff check |
| 406 | done | Slash table command inserts editable table | `tasks/done/slash-table-command-inserts-editable-table.md` | slash tests, editor regression UI smoke, typecheck, diff check |
| 407 | done | Slash link command inserts openable inline link | `tasks/done/slash-link-command-inserts-openable-inline-link.md` | slash tests, editor regression UI smoke, typecheck, diff check |
| 408 | done | Slash image command inserts hidden-source preview | `tasks/done/slash-image-command-inserts-hidden-source-preview.md` | slash tests, editor regression UI smoke, typecheck, diff check |
| 409 | done | Slash TOC command inserts navigable contents block | `tasks/done/slash-toc-command-inserts-navigable-contents-block.md` | slash tests, editor regression UI smoke, typecheck, diff check |
| 410 | done | Slash text command returns to plain paragraph | `tasks/done/slash-text-command-returns-to-plain-paragraph.md` | slash tests, editor regression UI smoke, typecheck, diff check |
| 411 | done | Slash menu keyboard dismissal and selection regression | `tasks/done/slash-menu-keyboard-dismissal-and-selection-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 412 | done | Slash menu Tab commits active command regression | `tasks/done/slash-menu-tab-commits-active-command-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 413 | done | Slash menu empty result recovery regression | `tasks/done/slash-menu-empty-result-recovery-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 414 | done | Slash command Chinese alias real editor regression | `tasks/done/slash-command-chinese-alias-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 415 | done | Slash TOC Chinese alias real editor regression | `tasks/done/slash-toc-chinese-alias-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 416 | done | Slash todo Chinese alias real editor regression | `tasks/done/slash-todo-chinese-alias-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 417 | done | Slash link Chinese alias real editor regression | `tasks/done/slash-link-chinese-alias-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 418 | done | Slash image Chinese alias real editor regression | `tasks/done/slash-image-chinese-alias-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 419 | done | Slash quote Chinese alias real editor regression | `tasks/done/slash-quote-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 420 | done | Slash code Chinese alias real editor regression | `tasks/done/slash-code-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 421 | done | Slash divider Chinese alias real editor regression | `tasks/done/slash-divider-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 422 | done | Slash callout Chinese alias real editor regression | `tasks/done/slash-callout-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 423 | done | Slash table Chinese alias real editor regression | `tasks/done/slash-table-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 424 | done | Slash database Chinese alias real editor regression | `tasks/done/slash-database-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 425 | done | Slash page Chinese alias real editor regression | `tasks/done/slash-page-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 426 | done | Slash page link Chinese alias real editor regression | `tasks/done/slash-page-link-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 427 | done | Slash list Chinese alias real editor regression | `tasks/done/slash-list-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 428 | done | Slash heading Chinese alias real editor regression | `tasks/done/slash-heading-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 429 | done | Slash numbered-list Chinese alias real editor regression | `tasks/done/slash-numbered-list-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 430 | done | Slash bulleted-list explicit Chinese alias real editor regression | `tasks/done/slash-bulleted-list-explicit-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 431 | done | Slash explicit Chinese heading levels real editor regression | `tasks/done/slash-explicit-chinese-heading-levels-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 432 | done | Slash secondary Chinese list aliases real editor regression | `tasks/done/slash-secondary-chinese-list-aliases-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 433 | done | Slash explicit Chinese heading one real editor regression | `tasks/done/slash-explicit-chinese-heading-one-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 434 | done | Slash task-list Chinese alias real editor regression | `tasks/done/slash-task-list-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 435 | done | Slash checkbox Chinese alias real editor regression | `tasks/done/slash-checkbox-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 436 | done | Slash explicit divider Chinese alias real editor regression | `tasks/done/slash-explicit-divider-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 437 | done | Slash explicit code block Chinese alias real editor regression | `tasks/done/slash-explicit-code-block-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 438 | done | Slash explicit callout Chinese alias real editor regression | `tasks/done/slash-explicit-callout-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 439 | done | Slash heading hint Chinese aliases real editor regression | `tasks/done/slash-heading-hint-chinese-aliases-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 440 | done | Slash text hint Chinese alias real editor regression | `tasks/done/slash-text-hint-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 441 | done | Slash table spaced hint alias real editor regression | `tasks/done/slash-table-spaced-hint-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 442 | done | Slash URL link hint disambiguation regression | `tasks/done/slash-url-link-hint-disambiguation-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 443 | done | Slash visible hint coverage guard | `tasks/done/slash-visible-hint-coverage-guard.md` | slash tests, typecheck, diff check |
| 444 | done | Markdown heading shortcut live-preview editor regression | `tasks/done/markdown-heading-shortcut-live-preview-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 445 | done | Markdown emphasis shortcut live-preview editor regression | `tasks/done/markdown-emphasis-shortcut-live-preview-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 446 | done | Markdown task checkbox shortcut real editor regression | `tasks/done/markdown-task-checkbox-shortcut-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 447 | done | Markdown quote shortcut real editor regression | `tasks/done/markdown-quote-shortcut-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 448 | done | Markdown divider shortcut real editor regression | `tasks/done/markdown-divider-shortcut-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 449 | done | Markdown bullet list shortcut real editor regression | `tasks/done/markdown-bullet-list-shortcut-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 450 | done | Markdown numbered list shortcut real editor regression | `tasks/done/markdown-numbered-list-shortcut-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 451 | done | Markdown code fence shortcut real editor regression | `tasks/done/markdown-code-fence-shortcut-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 452 | done | Markdown image syntax real editor regression | `tasks/done/markdown-image-syntax-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 453 | done | Markdown table syntax real editor regression | `tasks/done/markdown-table-syntax-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 454 | done | Markdown inline link syntax real editor regression | `tasks/done/markdown-inline-link-syntax-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 455 | done | Lotion callout fence real editor regression | `tasks/done/lotion-callout-fence-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 456 | done | Lotion equation fence real editor regression | `tasks/done/lotion-equation-fence-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 457 | done | Lotion iframe fence real editor regression | `tasks/done/lotion-iframe-fence-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 458 | done | Lotion toggle fence real editor regression | `tasks/done/lotion-toggle-fence-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 459 | done | Lotion view fence real editor regression | `tasks/done/lotion-view-fence-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 460 | done | Slash toggle block command real editor regression | `tasks/done/slash-toggle-block-command-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 461 | done | Slash equation block command real editor regression | `tasks/done/slash-equation-block-command-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 462 | done | Slash embed iframe command real editor regression | `tasks/done/slash-embed-iframe-command-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 463 | done | Slash embed Chinese alias real editor regression | `tasks/done/slash-embed-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 464 | done | Slash equation Chinese alias real editor regression | `tasks/done/slash-equation-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 465 | done | Slash toggle Chinese alias real editor regression | `tasks/done/slash-toggle-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 466 | done | Slash explicit toggle Chinese alias real editor regression | `tasks/done/slash-explicit-toggle-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 467 | done | Slash explicit equation Chinese alias real editor regression | `tasks/done/slash-explicit-equation-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 468 | done | Slash web embed Chinese alias real editor regression | `tasks/done/slash-web-embed-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 469 | done | Slash explicit web embed Chinese alias real editor regression | `tasks/done/slash-explicit-web-embed-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 470 | done | Slash embed-web Chinese alias real editor regression | `tasks/done/slash-embed-web-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 471 | done | Slash view Chinese alias real editor regression | `tasks/done/slash-view-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 472 | done | Slash task Chinese alias real editor regression | `tasks/done/slash-task-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 473 | done | Slash annotation Chinese alias real editor regression | `tasks/done/slash-annotation-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 474 | done | Slash body-text Chinese alias real editor regression | `tasks/done/slash-body-text-chinese-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 475 | done | Slash URL alias real editor regression | `tasks/done/slash-url-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 476 | done | Slash db alias real editor regression | `tasks/done/slash-db-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 477 | done | Slash database alias real editor regression | `tasks/done/slash-database-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 478 | done | Slash view alias real editor regression | `tasks/done/slash-view-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 479 | done | Slash page alias real editor regression | `tasks/done/slash-page-alias-real-editor-regression.md` | slash tests, editor regression UI smoke, renderer coverage, typecheck, diff check |
| 480 | done | Top-level page URL link affordance | `tasks/done/top-level-page-url-link-affordance.md` | renderer coverage, URL field UI smoke, typecheck, diff check |
| 481 | done | Recent quick-switcher keyboard navigation regression | `tasks/done/recent-quick-switcher-keyboard-navigation-regression.md` | search title UI smoke, typecheck, diff check |
| 482 | done | Global search Escape focus restoration | `tasks/done/global-search-escape-focus-restoration.md` | search title UI smoke, typecheck, diff check |
| 483 | done | Markdown table paste real editor regression | `tasks/done/markdown-table-paste-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 484 | done | Editor dropped attachment insertion regression | `tasks/done/editor-dropped-attachment-insertion-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 485 | done | Editor dropped image attachment regression | `tasks/done/editor-dropped-image-attachment-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 486 | done | Notion HTML paste real editor regression | `tasks/done/notion-html-paste-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 487 | done | Notion HTML table paste real editor regression | `tasks/done/notion-html-table-paste-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 488 | done | Notion HTML quote and code paste real editor regression | `tasks/done/notion-html-quote-code-paste-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 489 | done | Notion HTML image paste real editor regression | `tasks/done/notion-html-image-paste-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 490 | done | Notion HTML checkbox list paste real editor regression | `tasks/done/notion-html-checkbox-list-paste-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 491 | done | Notion HTML figure caption paste real editor regression | `tasks/done/notion-html-figure-caption-paste-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 492 | done | Notion HTML divider paste real editor regression | `tasks/done/notion-html-divider-paste-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 493 | done | Notion HTML code language paste real editor regression | `tasks/done/notion-html-code-language-paste-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 494 | done | Notion HTML ordered list start paste real editor regression | `tasks/done/notion-html-ordered-list-start-paste-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 495 | done | Notion HTML code br paste real editor regression | `tasks/done/notion-html-code-br-paste-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 496 | done | Notion HTML ordered list item value paste real editor regression | `tasks/done/notion-html-ordered-list-item-value-paste-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 497 | done | Notion HTML nested list paste real editor regression | `tasks/done/notion-html-nested-list-paste-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 498 | done | Notion HTML details toggle paste real editor regression | `tasks/done/notion-html-details-toggle-paste-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 499 | done | Notion HTML paragraph break paste real editor regression | `tasks/done/notion-html-paragraph-break-paste-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 500 | done | Notion HTML description list paste real editor regression | `tasks/done/notion-html-description-list-paste-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 501 | done | Missing embedded view diagnostic clarity | `tasks/done/missing-embedded-view-diagnostic-clarity.md` | markdown preview UI smoke, renderer coverage, typecheck, diff check |
| 502 | done | Notion HTML keyboard shortcut paste real editor regression | `tasks/done/notion-html-kbd-paste-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 503 | done | Notion HTML highlight paste real editor regression | `tasks/done/notion-html-highlight-paste-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 504 | done | Notion HTML underline paste real editor regression | `tasks/done/notion-html-underline-paste-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 505 | done | Notion HTML sup/sub paste real editor regression | `tasks/done/notion-html-sup-sub-paste-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 506 | done | Notion HTML color class paste real editor regression | `tasks/done/notion-html-color-class-paste-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 507 | done | Notion HTML block color class paste real editor regression | `tasks/done/notion-html-block-color-class-paste-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 508 | done | Notion HTML list item color class paste real editor regression | `tasks/done/notion-html-list-item-color-class-paste-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 509 | done | Notion HTML nested list item color paste real editor regression | `tasks/done/notion-html-nested-list-item-color-paste-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 510 | done | Notion HTML callout background paste real editor regression | `tasks/done/notion-html-callout-background-paste-real-editor-regression.md` | editor regression UI smoke, renderer coverage, typecheck, diff check |
| 511 | done | UI harness result manifest and compliance smoke | `tasks/done/ui-harness-result-manifest-and-compliance-smoke.md` | harness unit test, UI harness smoke, typecheck, diff check |
| 512 | done | UI harness snapshot manifest baseline gate | `tasks/done/ui-harness-snapshot-manifest-baseline-gate.md` | harness unit test, row-page navigation UI smoke, typecheck, diff check |
| 513 | done | UI suite child manifest compliance gate | `tasks/done/ui-suite-child-manifest-compliance-gate.md` | harness unit test, filtered UI suite smoke, typecheck, diff check |
| 514 | done | UI harness console error artifact gate | `tasks/done/ui-harness-console-error-artifact-gate.md` | harness unit test, UI harness smoke, typecheck, diff check |
| 515 | done | UI suite child console error compliance gate | `tasks/done/ui-suite-child-console-error-compliance-gate.md` | filtered UI suite smoke, typecheck, diff check |
| 516 | done | UI harness default console error failure gate | `tasks/done/ui-harness-default-console-error-failure-gate.md` | expected-failure harness smoke, foundation smoke, typecheck, diff check |
| 517 | done | UI harness stable layout assertion helper | `tasks/done/ui-harness-stable-layout-assertion-helper.md` | harness unit test, foundation smoke, typecheck, diff check |
| 518 | done | UI harness focused-region assertion helper | `tasks/done/ui-harness-focused-region-assertion-helper.md` | harness unit test, foundation smoke, typecheck, diff check |
| 519 | done | Editor regression smoke shared focus helper migration | `tasks/done/editor-regression-shared-focus-helper-migration.md` | editor regression UI smoke, typecheck, diff check |
| 520 | done | Row-page property panel visual and focus geometry regression | `tasks/done/row-page-property-panel-visual-focus-geometry-regression.md` | row-page navigation UI smoke, typecheck, diff check |
| 521 | done | Property link renderer contract regression | `tasks/done/property-link-renderer-contract-regression.md` | renderer component test, source attachments UI smoke, typecheck, diff check |
| 522 | done | Source attachment property snapshot baseline | `tasks/done/source-attachment-property-snapshot-baseline.md` | source attachments UI smoke, harness artifact test, typecheck, diff check |
| 523 | done | Editor rendered link click opens while line blank edits | `tasks/done/editor-rendered-link-click-open-blank-edit.md` | editor link click UI smoke, renderer component test, typecheck, diff check |
| 524 | done | Search sorting controls by relevance and date | `tasks/done/search-sorting-controls.md` | search service test, search UI smoke, typecheck, diff check |
| 525 | done | Database default created-date views | `tasks/done/database-default-created-date-views.md` | package-core database view test, database created views UI smoke, typecheck, diff check |
| 526 | done | LLM Chat page assistant redesign | `tasks/done/llm-chat-page-assistant-redesign.md` | assistant panel UI smoke, renderer component coverage, mocked tool-call smoke, package-core tool mode tests, typecheck, diff check |
| 527 | done | Notion-like white default light theme | `tasks/done/notion-like-white-default-light-theme.md` | white theme UI smoke, renderer/theme assertions, typecheck, diff check |
| 528 | done | Advanced Search LanceDB and Qwen3 local embedding | `tasks/done/advanced-search-lancedb-qwen3-local-vector-index.md` | LanceDB adapter tests, Ollama provider mock tests, advanced search UI smoke, vector benchmark, typecheck, diff check |
| 529 | done | Unified command palette navigation and actions | `tasks/done/unified-command-palette-navigation-and-actions.md` | search title UI smoke, renderer component coverage, typecheck, diff check |
| 530 | done | AI Q&A agent search and history | `tasks/done/ai-qa-agent-search-and-history.md` | citation normalization tests, local advanced search retrieval tests, assistant UI smoke, typecheck, diff check |
| 531 | done | GitHub backup page history redesign | `tasks/done/github-backup-page-history-redesign.md` | backup settings renderer coverage, page history UI smoke, Git service local history and squash preflight tests, remote smoke, typecheck, diff check |
| 532 | done | Keyboard shortcut settings and registry | `tasks/done/keyboard-shortcut-settings-and-registry.md` | shortcut registry unit tests, shortcuts settings renderer coverage, shortcut edit/conflict/reset UI smoke, input interception regression smoke, typecheck, diff check |
| 533 | done | Tag page management view first pass | `tasks/done/tag-page-management-view-first-pass.md` | renderer component coverage, multi-resolution sidebar navigation UI smoke, typecheck, diff check |
| 534 | done | Tag pages in command palette | `tasks/done/tag-pages-in-command-palette.md` | search title UI smoke, renderer component coverage, typecheck, diff check |
| 535 | done | Page star favorite direct toggle regression | `tasks/done/page-star-favorite-direct-toggle-regression.md` | search title UI smoke, typecheck, diff check |
| 536 | done | Sidebar pages section hierarchy tree | `tasks/done/sidebar-pages-section-hierarchy-tree.md` | renderer component coverage, sidebar navigation UI smoke, typecheck, diff check |
| 537 | done | Sidebar create child page from page tree | `tasks/done/sidebar-create-child-page-from-page-tree.md` | renderer component coverage, sidebar navigation UI smoke, typecheck, diff check |
| 538 | done | Sidebar page tree collapse persistence | `tasks/done/sidebar-page-tree-collapse-persistence.md` | sidebar navigation UI smoke, typecheck, diff check |
| 539 | done | Favorites management page and command | `tasks/done/favorites-management-page-and-command.md` | renderer component coverage, search title UI smoke, typecheck, diff check |
| 540 | done | LLM Chat command uses selected editor text | `tasks/done/llm-chat-selected-text-command.md` | LLM chat UI smoke, renderer component coverage, typecheck, diff check |
| 541 | done | Git Sync command palette opens settings | `tasks/done/git-sync-command-palette-opens-settings.md` | search title UI smoke, renderer component coverage, typecheck, diff check |
| 542 | done | Git Sync command palette squash safety check | `tasks/done/git-sync-command-palette-squash-safety-check.md` | search title UI smoke, renderer component coverage, typecheck, diff check |
| 543 | done | Git Sync remote-ahead status clarity | `tasks/done/git-sync-remote-ahead-status-clarity.md` | renderer component coverage, typecheck, diff check |
| 544 | done | Git Sync command palette fetch status | `tasks/done/git-sync-command-palette-fetch-status.md` | search title UI smoke, renderer component coverage, typecheck, diff check |
| 545 | done | Git Sync command palette backup now smoke | `tasks/done/git-sync-command-palette-backup-now-smoke.md` | search title UI smoke, typecheck, diff check |
| 546 | done | Git Sync command palette pull and push actions | `tasks/done/git-sync-command-palette-pull-push-actions.md` | search title UI smoke, renderer component coverage, typecheck, diff check |
| 547 | done | Git Sync command palette init and remote test actions | `tasks/done/git-sync-command-palette-init-remote-test-actions.md` | search title UI smoke, renderer component coverage, typecheck, diff check |
| 548 | done | Row-page property UI regression lab foundation | `tasks/done/row-page-property-ui-regression-lab-foundation.md` | row property visual UI regression, renderer component coverage, typecheck, diff check |
| 549 | done | Include row-property visual lab in UI regression lane | `tasks/done/include-row-property-visual-lab-in-ui-regression-lane.md` | filtered UI suite smoke, test:ui-regression, typecheck, diff check |
| 550 | done | Row-property visual artifact contract gate | `tasks/done/row-property-visual-artifact-contract-gate.md` | harness artifact unit test, row property visual UI smoke, typecheck, diff check |
| 551 | done | Source attachment artifact contract gate | `tasks/done/source-attachment-artifact-contract-gate.md` | harness artifact unit test, source attachments UI smoke, typecheck, diff check |
| 552 | done | Include source attachment lab in UI regression lane | `tasks/done/include-source-attachment-lab-in-ui-regression-lane.md` | filtered UI suite smoke, test:ui-regression, typecheck, diff check |
| 553 | done | Markdown preview artifact contract gate | `tasks/done/markdown-preview-artifact-contract-gate.md` | harness artifact unit test, markdown preview UI smoke, test:ui-regression, typecheck, diff check |
| 554 | done | Global search visual artifact contract gate | `tasks/done/global-search-visual-artifact-contract-gate.md` | harness artifact unit test, search title UI smoke, typecheck, diff check |
| 555 | done | Embedded database table artifact contract gate | `tasks/done/embedded-database-table-artifact-contract-gate.md` | harness artifact unit test, embedded view UI smoke, typecheck, diff check |
| 556 | done | Test release after passing gates | `tasks/done/test-release-after-passing-gates.md` | release manifest/script tests, failed-gate dry-run, passing prechecked dry-run, typecheck, diff check |
| 557 | done | Include embedded database table lab in UI regression lane | `tasks/done/include-embedded-database-table-lab-in-ui-regression-lane.md` | filtered UI suite smoke, test:ui-regression, typecheck, diff check |
| 558 | done | UI regression suite artifact index | `tasks/done/ui-regression-suite-artifact-index.md` | harness artifact unit test, filtered UI suite smoke, typecheck, diff check |
| 559 | done | Notion import audit artifact contract gate | `tasks/done/notion-import-audit-artifact-contract-gate.md` | harness artifact unit test, notion import UI smoke, typecheck, diff check |
| 560 | done | Advanced Search rebuild progress and design polish | `tasks/done/advanced-search-rebuild-progress-and-design-polish.md` | advanced search progress tests, advanced search UI smoke, renderer component coverage, typecheck, diff check |
| 561 | done | LLM Chat visual design polish | `tasks/done/llm-chat-visual-design-polish.md` | LLM chat UI smoke, renderer component coverage, visual artifact check, typecheck, diff check |
| 562 | done | Plugin settings separation and surface polish | `tasks/done/plugin-settings-separation-and-surface-polish.md` | plugin manager/settings smoke, focused plugin UI smokes, renderer component coverage, typecheck, diff check |
| 563 | done | Customer-facing API contract and performance metrics | `tasks/done/customer-facing-api-contract-and-metrics.md` | customer API contract/metrics tests, `test:customer-api`, typecheck, build, diff check |
| 564 | done | Frontend design system and style guide | `tasks/done/frontend-design-system-and-style-guide.md` | renderer primitive coverage, UI lab artifact check, focused visual regression, typecheck, build, diff check |
| 565 | done | Search and AI unified tabs | `tasks/done/search-ai-unified-tabs.md` | search AI UI smoke, advanced search UI smoke, LLM chat UI smoke, search title UI smoke, renderer component coverage, typecheck, build, diff check |
| 566 | done | Test release app snapshot | `tasks/done/test-release-app-snapshot.md` | release app artifact tests, temp-dir release dry-run, typecheck, build, diff check |
| 567 | done | Unified settings center | `tasks/done/unified-settings-center.md` | settings center coverage, settings search smoke, Search & AI settings smoke, plugin settings deep-link smoke, Git settings smoke, typecheck, build, diff check |
| 568 | done | Include settings center in UI regression lane | `tasks/done/include-settings-center-in-ui-regression-lane.md` | settings center artifact contract, filtered UI suite smoke, typecheck, diff check |
| 569 | done | Plugin manager artifact contract and regression lane | `tasks/done/plugin-manager-artifact-contract-regression-lane.md` | plugin manager artifact contract, filtered UI suite smoke, test:ui-regression, typecheck, diff check |
| 570 | done | LLM Chat artifact contract and regression lane | `tasks/done/llm-chat-artifact-contract-regression-lane.md` | LLM Chat artifact contract, filtered UI suite smoke, test:ui-regression, typecheck, diff check |
| 571 | done | Generate release app snapshot artifact | `tasks/done/generate-release-app-snapshot-artifact.md` | release:test or release:test:prechecked, manifest inspection, .app existence check, diff check |
| 572 | done | Advanced Search artifact contract and regression lane | `tasks/done/advanced-search-artifact-contract-regression-lane.md` | advanced search artifact contract, filtered UI suite smoke, test:ui-regression, typecheck, diff check |
| 573 | done | Include Notion import audit in UI regression lane | `tasks/done/include-notion-import-audit-in-ui-regression-lane.md` | notion import audit filtered UI suite smoke, test:ui-regression, typecheck, diff check |
| 574 | done | Notion import audit details in UI artifact index | `tasks/done/notion-import-audit-details-in-ui-artifact-index.md` | artifact index unit test, notion import filtered UI suite smoke, typecheck, diff check |
| 575 | done | UI suite missing artifact contract diagnostics | `tasks/done/ui-suite-missing-artifact-contract-diagnostics.md` | harness artifact unit test, row-page navigation filtered UI suite smoke, typecheck, diff check |
| 576 | done | Row-page navigation UI artifact contract | `tasks/done/row-page-navigation-ui-artifact-contract.md` | harness artifact unit test, row-page navigation UI smoke, filtered UI suite smoke, typecheck, diff check |
| 577 | done | URL field UI artifact contract and regression lane | `tasks/done/url-field-ui-artifact-contract-regression-lane.md` | harness artifact unit test, URL field UI smoke, filtered UI suite smoke, test:ui-regression script check, typecheck, diff check |
| 578 | done | Editor regression UI artifact contract and regression lane | `tasks/done/editor-regression-ui-artifact-contract-regression-lane.md` | harness artifact unit test, editor regression UI smoke, filtered UI suite smoke, test:ui-regression script check, typecheck, diff check |
| 579 | done | Editor link click UI artifact contract and regression lane | `tasks/done/editor-link-click-ui-artifact-contract-regression-lane.md` | harness artifact unit test, editor link click UI smoke, filtered UI suite smoke, test:ui-regression script check, typecheck, diff check |
| 580 | done | Editor scroll UI artifact contract and regression lane | `tasks/done/editor-scroll-ui-artifact-contract-regression-lane.md` | harness artifact unit test, editor scroll UI smoke, filtered UI suite smoke, test:ui-regression script check, typecheck, diff check |
| 581 | done | Search latency UI artifact contract and regression lane | `tasks/done/search-latency-ui-artifact-contract-regression-lane.md` | harness artifact unit test, search UI smoke, filtered UI suite smoke, test:ui-regression script check, typecheck, diff check |
| 582 | done | Navigation anchor UI artifact contract and regression lane | `tasks/done/navigation-anchor-ui-artifact-contract-regression-lane.md` | harness artifact unit test, navigation anchor UI smoke, filtered UI suite smoke, test:ui-regression script check, typecheck, diff check |
| 583 | done | Notion import audit failure artifact contract | `tasks/done/notion-import-audit-failure-artifact-contract.md` | harness artifact unit test, Notion import audit UI smoke, filtered UI suite smoke, typecheck, diff check |
| 584 | done | Direct Notion audit Markdown report output | `tasks/done/direct-notion-audit-markdown-report-output.md` | audit CLI/service tests, typecheck, diff check |
| 585 | done | UI suite artifact index screenshot path links | `tasks/done/ui-suite-artifact-index-screenshot-path-links.md` | harness artifact unit test, filtered UI suite smoke, typecheck, diff check |
| 586 | done | UI suite artifact index reproduce commands | `tasks/done/ui-suite-artifact-index-reproduce-commands.md` | harness artifact unit test, filtered UI suite smoke, typecheck, diff check |
| 587 | done | UI suite artifact index elapsed-time diagnostics | `tasks/done/ui-suite-artifact-index-elapsed-time-diagnostics.md` | harness artifact unit test, filtered UI suite smoke, typecheck, diff check |
| 588 | done | UI suite artifact index viewport screenshot coverage | `tasks/done/ui-suite-artifact-index-viewport-screenshot-coverage.md` | harness artifact unit test, filtered UI suite smoke, typecheck, diff check |
| 589 | done | UI suite failure artifact links | `tasks/done/ui-suite-failure-artifact-links.md` | harness artifact unit test, filtered UI suite smoke, typecheck, diff check |
| 590 | done | UI suite console issue excerpts | `tasks/done/ui-suite-console-issue-excerpts.md` | harness artifact unit test, filtered UI suite smoke, typecheck, diff check |
| 591 | done | Row-page property visual overflow artifact coverage | `tasks/done/row-page-property-visual-overflow-artifact-coverage.md` | row-property visual artifact unit test, filtered UI suite smoke, typecheck, diff check |
| 592 | done | UI suite artifact index environment metadata | `tasks/done/ui-suite-artifact-index-environment-metadata.md` | harness artifact unit test, filtered UI suite smoke, typecheck, diff check |
| 593 | done | White theme artifact contract and regression lane | `tasks/done/white-theme-artifact-contract-regression-lane.md` | white theme artifact unit test, white theme UI smoke, filtered UI suite smoke, typecheck, diff check |
| 594 | done | Tag pages artifact contract and regression lane | `tasks/done/tag-pages-artifact-contract-regression-lane.md` | tag pages artifact unit test, sidebar navigation UI smoke, filtered UI suite smoke, typecheck, diff check |
| 595 | done | Sidebar settings artifact contract and filter lane | `tasks/done/sidebar-settings-artifact-contract-filter-lane.md` | sidebar settings artifact unit test, sidebar settings UI smoke, filtered sidebar UI suite smoke, typecheck, diff check |
| 596 | done | Search & AI artifact contract and regression lane | `tasks/done/search-ai-artifact-contract-regression-lane.md` | Search & AI artifact unit test, Search & AI UI smoke, filtered Search & AI suite smoke, typecheck, diff check |
| 597 | done | Design system artifact contract and regression lane | `tasks/done/design-system-artifact-contract-regression-lane.md` | design system artifact unit test, design system UI smoke, filtered Design System suite smoke, typecheck, diff check |
| 598 | done | Image lightbox artifact contract and regression lane | `tasks/done/image-lightbox-artifact-contract-regression-lane.md` | image lightbox artifact unit test, image lightbox UI smoke, filtered Image Lightbox suite smoke, typecheck, diff check |
| 599 | done | Database created views artifact contract and regression lane | `tasks/done/database-created-views-artifact-contract-regression-lane.md` | database created views artifact unit test, database created views UI smoke, filtered Database Created Views suite smoke, typecheck, diff check |
| 600 | done | Page backlinks artifact contract and regression lane | `tasks/done/page-backlinks-artifact-contract-regression-lane.md` | page backlinks artifact unit test, page backlinks UI smoke, filtered Page Backlinks suite smoke, typecheck, diff check |
| 601 | done | Page secondary panel artifact contract and regression lane | `tasks/done/page-secondary-panel-artifact-contract-regression-lane.md` | page secondary artifact unit test, page secondary UI smoke, filtered Page Secondary suite smoke, typecheck, diff check |
| 602 | done | Built-in plugin enable disable controls | `tasks/done/builtin-plugin-enable-disable-controls.md` | package-core plugin host test, plugin manager UI smoke, typecheck, diff check |
| 603 | done | Bug: Notion import overlay layout is visually broken | `tasks/done/notion-import-overlay-layout-bug.md` | reproduce with Notion Import workspace, focused Notion import UI smoke, screenshot artifact, typecheck, diff check |
| 604 | done | Bug: Open Workspace should explain wrong workspace/folder selection | `tasks/done/open-workspace-manual-test-load-bug.md` | wrong-folder prompt, selected path visibility, path-with-spaces regression, focused workspace-open smoke, typecheck, diff check |
| 605 | done | Bug: Imported Notion toggle is broken on 2022 parents vision check page | `tasks/done/imported-notion-toggle-page-2022-parents-vision-check-bug.md` | importer nested-toggle regression, markdown preview UI smoke with imported-toggle screenshots, typecheck, diff check |
| 606 | done | Embedded view header actions artifact contract | `tasks/done/embedded-view-header-actions-artifact-contract.md` | embedded view smoke header action evidence, artifact contract unit test, typecheck, diff check |
| 607 | done | Production UI visual quality gate first slice | `tasks/done/production-ui-visual-quality-gate-first-slice.md` | production visual npm gate, critical surface screenshot/geometry artifact contract, desktop+compact coverage, docs, typecheck, focused UI gate, diff check |
| 608 | done | Release test requires production visual gate | `tasks/done/release-test-requires-production-visual-gate.md` | default release gate includes production visual, release manifest/unit coverage, docs, typecheck, focused release test, diff check |
| 609 | done | Release artifact indexes production visual gate | `tasks/done/release-artifact-indexes-production-visual-gate.md` | release artifact unit coverage, docs, typecheck, focused release test, diff check |
| 610 | done | Production visual gate covers Search AI surfaces | `tasks/done/production-visual-gate-covers-search-ai-surfaces.md` | production visual artifact contract unit coverage, production visual gate, docs, typecheck, focused artifact test, diff check |
| 611 | done | Production visual gate wide viewport coverage | `tasks/done/production-visual-gate-wide-viewport-coverage.md` | production visual artifact contract unit coverage, docs, typecheck, production visual gate, diff check |
| 612 | done | Production visual custom viewport contract alignment | `tasks/done/production-visual-custom-viewport-contract-alignment.md` | production visual script/unit coverage, docs, typecheck, diff check |
| 613 | done | Production visual style system rollout | `tasks/done/production-visual-style-system-rollout.md` | renderer component coverage, design-system UI smoke, white-theme UI smoke, production visual gate, release artifact coverage, typecheck, diff check |
| 614 | done | Database view transactional persistence | `tasks/done/database-view-transactional-persistence.md` | view patch/concurrency tests, persistence UI smoke, typecheck, fixtures, latency, build |
| 615 | done | Database interaction regression lab | `tasks/done/database-interaction-regression-lab.md` | artifact tests, database interaction UI smoke, filtered suite, typecheck, diff check |
| 616 | done | Database settings menu shell | `tasks/done/database-settings-menu-shell.md` | renderer menu coverage, settings menu UI smoke, typecheck, build |
| 617 | done | Database view create switch reorder and overflow | `tasks/done/database-view-create-switch-reorder-overflow.md` | view create/order tests, multi-view UI smoke, typecheck, fixtures, build |
| 618 | done | Database view context menu and links | `tasks/done/database-view-context-menu-and-links.md` | lifecycle/link tests, view menu UI smoke, typecheck, build |
| 619 | done | Database property manager | `tasks/done/database-property-manager.md` | schema/property-order tests, property manager UI smoke, typecheck, fixtures, build |
| 620 | done | Database property soft delete and restore | `tasks/done/database-property-soft-delete-and-restore.md` | tombstone/restore tests, delete/restore UI smoke, typecheck, fixtures, build |
| 621 | done | Database column header menu | `tasks/done/database-column-header-menu.md` | field duplicate/insert/freeze tests, column menu UI smoke, typecheck, fixtures, build |
| 622 | done | Database filter expression tree and typed editor | `tasks/done/database-filter-expression-tree-and-typed-editor.md` | filter AST tests, advanced filter UI smoke, typecheck, latency, build |
| 623 | done | Database sort priority and type semantics | `tasks/done/database-sort-priority-and-type-semantics.md` | comparator tests, sort priority UI smoke, typecheck, latency, build |
| 624 | done | Database row context menu and restore | `tasks/done/database-row-context-menu-and-restore.md` | row lifecycle tests, cross-view row menu UI smoke, typecheck, fixtures, build |
| 625 | done | Database bulk row selection and actions | `tasks/done/database-bulk-row-selection-and-actions.md` | batch tests/benchmark, virtualized selection UI smoke, typecheck, latency, build |
| 626 | done | Database shared grouping model | `tasks/done/database-shared-grouping-model.md` | group query/migration tests, grouped views UI smoke, typecheck, latency, build |
| 627 | done | Database view page open modes | `tasks/done/database-view-page-open-modes.md` | page-open preference tests, peek navigation UI smoke, typecheck, build |
| 628 | done | Database lock and scoped settings | `tasks/done/database-lock-and-scoped-settings.md` | lock enforcement tests, locked-state UI smoke, typecheck, build |
| 629 | done | Database interaction resilience and accessibility | `tasks/done/database-interaction-resilience-and-accessibility.md` | accessibility tests, keyboard/error UI smoke, typecheck, build |
| 630 | done | Editor rich formatting and selection highlight bugs | `tasks/done/editor-rich-formatting-and-selection-highlight-bugs.md` | renderer components, Markdown preview UI smoke, artifact contract |
| 631 | done | Selected highlight source editing contract | `tasks/done/heart-selected-highlight-source-editing.md` | Markdown preview UI smoke, selection/source artifact evidence |
| 632 | done | Selection block background overlay | `tasks/done/heart-selection-block-background-overlay.md` | Markdown preview UI smoke, selected-line alpha evidence |
| 633 | done | Blockquote Edit source affordance | `tasks/done/heart-blockquote-edit-source-affordance.md` | multi-line blockquote source UI smoke, artifact contract |
| 634 | done | Table Edit source affordance | `tasks/done/heart-table-edit-source-affordance.md` | table source/direct-edit UI smoke, artifact contract |
| 635 | done | Table row and column controls | `tasks/done/heart-table-row-column-controls.md` | persisted table mutation UI smoke, artifact contract |
| 636 | done | Table drag reorder | `tasks/done/heart-table-drag-reorder.md` | persisted row/column drag UI smoke, artifact contract |
| 637 | done | Active imported formatting source leak reverted | `tasks/done/heart-active-imported-formatting-source-leak.md` | successor behavior UI smoke, selected-source artifact evidence, task reference validation |
| 638 | done | Task documentation state integrity gate | `tasks/done/task-documentation-state-integrity-gate.md` | positive/negative task-doc tests, repository task scan, typecheck, diff check |
| 639 | done | Workspace smoke empty scaffold resilience | `tasks/done/workspace-smoke-empty-scaffold-resilience.md` | workspace validator positive/negative tests, demo workspace smoke, fixtures, latency, diff check |
| 640 | done | Full UI regression and harness resilience | `tasks/done/full-ui-regression-and-harness-resilience.md` | 39-scenario UI regression, focused bug reproductions, artifact contracts, renderer tests, typecheck, task-doc gate |
| 641 | done | Backlink background incremental index | `tasks/done/backlink-background-incremental-index.md` | 43k persisted-cache benchmark, incremental internal/external edit tests, corrupt-cache byte safety, desktop+compact UI refresh smoke, typecheck, task-doc gate |
| 642 | done | Production visual perceptual diff foundation | `tasks/done/production-visual-perceptual-diff-foundation.md` | PNG perceptual diff positive/negative tests, actionable diff metadata, focused production visual smoke, typecheck, task-doc gate |
| 643 | done | Renderer source coverage gate | `tasks/done/renderer-source-coverage-gate.md` | all-source renderer coverage, bundle-only negative test, thresholds, production/release artifact integration, typecheck, task-doc gate |
| 644 | done | Renderer coverage historical trend gate | `tasks/done/renderer-coverage-historical-trend-gate.md` | committed verified baseline, positive/regression/invalid-baseline tests, production/release artifact integration, typecheck, task-doc gate |
| 645 | done | Design System committed perceptual baseline | `tasks/done/design-system-committed-perceptual-baseline.md` | repeatability proof, committed PNG policy, mutation/checksum negative tests, Design System production gate, typecheck, task-doc gate |
| 646 | done | Lotion Demo Space isolated real-workspace visual pass | `tasks/done/lotion-demo-space-isolated-real-workspace-visual-pass.md` | copy-on-write clone safety tests, source byte fingerprint, 500K database layout/latency smoke, screenshots, typecheck, task-doc gate |
| 647 | done | Notion Import isolated real-workspace visual pass | `tasks/done/notion-import-isolated-real-workspace-visual-pass.md` | legacy row-body fallback regression, clone-only importer toggle/media interaction, real modal geometry, six screenshots, source fingerprint equality, typecheck, task-doc gate |
| 648 | done | Design System compact committed perceptual baseline | `tasks/done/design-system-compact-committed-perceptual-baseline.md` | complete-surface screenshot fix, repeated compact checksum, strict zero-pixel policy, mutation/missing-evidence negatives, production/release artifact linkage, typecheck, task-doc gate |
| 649 | done | Design System status-pill visibility and wide baseline | `tasks/done/design-system-status-pill-visibility-and-wide-baseline.md` | scoped pill visibility regression, responsive geometry evidence, refreshed desktop/compact baselines, repeated strict wide baseline, production/release linkage, typecheck, task-doc gate |
| 650 | done | White Theme page committed perceptual baselines | `tasks/done/white-theme-page-committed-perceptual-baselines.md` | hidden-scroll and floating-TOC timing fixes, repeated three-viewport checksums, page-phase policies, mutation/missing/scroll negatives, production/release linkage, typecheck, task-doc gate |
| 651 | done | Settings Center committed perceptual baselines | `tasks/done/settings-center-committed-perceptual-baselines.md` | active-tab transition and Search & AI click stabilization, seven-row geometry, repeated three-viewport checksums, mutation/missing/state/clipping negatives, production/release linkage, task-doc gate |
| 652 | done | Plugin Manager complete-surface committed perceptual baselines | `tasks/done/plugin-manager-complete-surface-committed-perceptual-baselines.md` | full-surface capture debugging, repeated three-viewport checksums, seven-plugin/fourteen-provider geometry, mutation/missing/clipping negatives, production/release linkage, task-doc gate |
| 653 | done | LLM Chat compact transcript visibility and conversation baselines | `tasks/done/llm-chat-compact-transcript-visibility-and-conversation-baselines.md` | responsive transcript debugging, message visibility geometry, repeated three-viewport conversation baselines, mutation/missing/clipping negatives |
| 654 | done | Advanced Search compact result visibility and stale-result baselines | `tasks/done/advanced-search-compact-result-visibility-and-stale-result-baselines.md` | compact modal/result debugging, per-result visibility geometry, repeated three-viewport stale-result baselines, mutation/missing/clipping negatives |
| 655 | done | Search & AI selected-source identity and chat handoff baselines | `tasks/done/search-ai-selected-source-identity-and-chat-handoff-baselines.md` | internal-path leak debugging, readable source identity contract, repeated three-viewport chat handoff baselines, mutation/missing/leak negatives |
| 656 | done | Global search responsive controls and result baselines | `tasks/done/global-search-responsive-controls-and-result-baselines.md` | filter/sort overlap debugging, control geometry contract, repeated three-viewport result baselines, mutation/missing/clipping negatives |
| 657 | done | Page history readable identity and restore-preview baselines | `tasks/done/page-history-readable-identity-and-restore-preview-baselines.md` | verified path-leak and success-message fixes, real Git preview/restore, three strict baselines, mutation/missing/clipping/leak negatives, production/coverage/build gates |
| 658 | done | GitHub Backup readable identity and restore-preview baselines | `tasks/done/github-backup-readable-identity-and-restore-preview-baselines.md` | verified logical identity, local-mock backup/restore artifact contract, three strict baselines, production/release linkage, mutation/missing/visibility/leak negatives |
| 659 | done | Notion Import modal complete control geometry and baselines | `tasks/done/notion-import-modal-complete-control-geometry-and-baselines.md` | verified complete control geometry/ownership, three strict command-modal baselines, clipping/visibility/missing/mutation negatives, production/release linkage |
| 660 | done | Markdown Preview selected source complete geometry and baselines | `tasks/done/markdown-preview-selected-source-complete-geometry-and-baselines.md` | verified selection/source/Edit source geometry and overlap fix, virtualization recovery, three strict baselines, clipping/visibility/missing/mutation negatives, production/release linkage |
| 661 | done | Row-page property complete panel geometry and baselines | `tasks/done/row-page-property-complete-panel-geometry-and-baselines.md` | verified compact complete-surface capture, distinct option-search actions, panel/row/control geometry, three strict baselines, focused navigation, production/release linkage |
| 662 | done | Embedded view complete table geometry and baselines | `tasks/done/embedded-view-complete-table-geometry-and-baselines.md` | verified complete 8-row table surface, 20/50/100 pagination and 1/3/10-view latency, three strict baselines, clipping/visibility/ownership/missing/mutation negatives, production/release linkage |
| 663 | done | Database created views complete surface and baselines | `tasks/done/database-created-views-complete-surface-and-baselines.md` | verified clean post-failure recovery, generated-view persistence/interactions, complete tab/table/three-row geometry, three strict baselines, dirty/ownership/missing/mutation negatives, production/release linkage |
| 664 | done | Database interaction complete surfaces and baselines | `tasks/done/database-interaction-complete-surfaces-and-baselines.md` | verified standalone navigation and settled settings/filter/sort geometry, nine stable captures, three strict Settings baselines, transparency/missing/mutation negatives, all 16 default suites covered |
| 665 | done | Production visual real-workspace nightly aggregation | `tasks/done/production-visual-real-workspace-nightly-aggregation.md` | verified portable gate plus both isolated named workspaces, 18-row workspace/theme/baseline matrix, strict prerequisites/redaction/source safety, focused contract negatives, 89-screenshot real nightly evidence |
| 666 | done | Renderer coverage source identity integrity | `tasks/done/renderer-coverage-source-identity-integrity.md` | verified 130 raw entries → 67 exact sources, 63 macOS aliases canonicalized, ambiguous/inventory negatives, corrected 62.78% line baseline, production/release linkage |
| 667 | done | Browser plugin settings transactional persistence | `tasks/done/browser-plugin-settings-transactional-persistence.md` | verified transactional cache/storage commits, JSON normalization, failed set/delete/serialization rollback, 96.49% source coverage, plugin/settings/production gates |
| 668 | done | Renderer Markdown dead-code removal | `tasks/done/renderer-markdown-dead-code-removal.md` | verified unused parallel renderer removal, exact 66-file inventory, active Markdown desktop/compact contract, 16-suite production gate |
| 669 | done | Create View transactional submission and recovery | `tasks/done/create-view-transactional-submission-and-recovery.md` | verified synchronous single-flight submit, persistence-error alert/retry, in-flight close blocking, 86.71% file coverage, injected bundle-failure/double-submit Electron regression |
| 670 | done | Property Manager transactional mutations and recovery | `tasks/done/property-manager-transactional-mutations-and-recovery.md` | verified single-flight schema mutations, visible persistence errors/retry, in-flight dismissal blocking, 85.56% file coverage, injected-failure Electron regression |
| 671 | done | View Context Menu transactional actions and recovery | `tasks/done/view-context-menu-transactional-actions-and-recovery.md` | verified single-flight rename/duplicate/default/delete, visible failure/retry and dismissal blocking, 41.08% file line coverage, injected-failure Electron regression |
| 672 | done | Database Settings transactional actions and recovery | `tasks/done/database-settings-transactional-actions-and-recovery.md` | page-open-mode/lock single-flight persistence, visible recovery, dismissal blocking, real-source coverage, metadata-write-failure Electron regression |
| 673 | done | Column Header Menu transactional actions and recovery | `tasks/done/column-header-menu-transactional-actions-and-recovery.md` | persistent column-action single-flight, visible recovery, dismissal blocking, 46.73% file coverage, bundle-write-failure Electron regression |
| 674 | done | Group Settings transactional submission and recovery | `tasks/done/group-settings-transactional-submission-and-recovery.md` | grouping single-flight save, visible failure/retry, dismissal blocking, 47.82% file coverage, view-write-failure Electron regression |
| 675 | done | Deleted Rows transactional actions and recovery | `tasks/done/deleted-rows-transactional-actions-and-recovery.md` | global single-flight restore/delete, visible recovery, dismissal blocking, 63.49% file coverage, bundle-write-failure Electron regression |
| 676 | done | Row Context Menu transactional actions and recovery | `tasks/done/row-context-menu-transactional-actions-and-recovery.md` | rename/duplicate/delete single-flight, visible recovery, dismissal blocking, 64.17% file coverage, bundle-write-failure Electron regression |
| 677 | done | Filter Popover transactional mutations and recovery | `tasks/done/filter-popover-transactional-mutations-and-recovery.md` | single-flight filter persistence, debounced close flush, local failure/retry, dismissal blocking, 66.53% file coverage, injected view-write Electron regression |
| 678 | done | Sort Popover transactional mutations and recovery | `tasks/done/sort-popover-transactional-mutations-and-recovery.md` | single-flight sort persistence, retained failure/retry, dismissal blocking, 74.82% file coverage, injected view-write Electron regression |
| 679 | done | View Settings transactional actions and recovery | `tasks/done/view-settings-transactional-actions-and-recovery.md` | shared single-flight save/duplicate/delete/default persistence, retained draft/error/retry, dismissal blocking, 70.41% file coverage, injected view-write Electron regression |
| 680 | done | Row Template transactional actions and recovery | `tasks/done/row-template-transactional-actions-and-recovery.md` | shared single-flight save/delete persistence, retained draft/error/retry, dismissal blocking, 73.50% file coverage, injected template-write Electron regression |
| 681 | done | Field Settings transactional actions and recovery | `tasks/done/field-settings-transactional-actions-and-recovery.md` | shared save/wrap/hide single-flight persistence, retained draft/error/retry, dismissal blocking, 50.08% file coverage, injected field-update Electron regression |
| 682 | done | Bulk Row Actions transactional recovery | `tasks/done/bulk-row-actions-transactional-recovery.md` | shared Apply/Duplicate/Delete single-flight guard, atomic-failure Retry without unsafe partial-result replay, 45.24% file coverage, injected batch-write Electron regression |
| 683 | done | Database View Order transactional recovery | `tasks/done/database-view-order-transactional-recovery.md` | single-flight drag reorder, retained rollback/error/retry, competing-control blocking, 73.93% DatabaseChrome coverage, injected multi-view-write Electron regression |
| 684 | done | Row Creation transactional recovery | `tasks/done/row-creation-transactional-recovery.md` | atomic grouped initial values, single-flight New/Retry, visible table/list/Kanban recovery, 46.02% DatabaseTable coverage, injected bundle-write Electron regression |
| 685 | done | Inline Cell Edit transactional queue and recovery | `tasks/done/inline-cell-edit-transactional-queue-and-recovery.md` | serialized/deduplicated cell writes, visible Retry/Discard, ordered queue recovery, 48.58% DatabaseTable coverage, injected bundle-write Electron regression |
| 686 | done | Page Properties transactional recovery | `tasks/done/page-properties-transactional-recovery.md` | tag/date/URL single-flight persistence, visible Retry/Discard, 83.02% PageProperties coverage, injected page-metadata write Electron regression |
| 687 | done | Row Page Properties transactional queue and recovery | `tasks/done/row-page-properties-transactional-queue-and-recovery.md` | serialized row-property writes, visible Retry/Discard, 87.09% file coverage, injected bundle-write Electron regression |
| 688 | done | Field Option Menu transactional recovery | `tasks/done/field-option-menu-transactional-recovery.md` | protect color/delete/reorder schema writes, visible Retry/Discard, injected field-update Electron regression |
| 689 | done | Page Editor title transactional recovery | `tasks/done/page-editor-title-transactional-recovery.md` | page/row title async ownership, atomic rollback, exact Retry/Discard, stable backlinks/history, injected rename-failure Electron regression |
| 690 | done | Page Cover offset transactional recovery | `tasks/done/page-cover-offset-transactional-recovery.md` | shared page/database/row cover async ownership, exact Retry/Discard, post-Discard drag reset, TOC-safe actions, 68.18% file coverage, injected page-metadata failure Electron regression |
| 691 | done | Page Layout settings transactional recovery | `tasks/done/page-layout-settings-transactional-recovery.md` | verified shared page/row Full width and Small text recovery; 52 core + 119 artifact tests, desktop/compact Electron failure injection, renderer coverage improved, production visual 16/16 |
| 692 | done | Notion audit panel single-flight execution | `tasks/done/notion-audit-panel-single-flight-execution.md` | verified synchronous ownership and failure retry; exact entity-ref counts, 119 artifact tests, desktop/compact/wide double-submit evidence, production visual 16/16 |
| 693 | done | Strict calendar date validation | `tasks/done/strict-calendar-date-validation.md` | verified strict Gregorian/leap-day and range validation across shared parsing, Notion import/audit, atomic batch writes, filters/sorts, and desktop/compact calendar/list/gallery consumers |
| 694 | done | Page parent cycle validation | `tasks/done/page-parent-cycle-validation.md` | verified self/descendant rejection and concurrent A↔B serialization at the authoritative service boundary; public API, renderer plugin, sidebar hierarchy, coverage, latency, and production visual gates passed |
| 695 | done | Entities backlink file-service boundary | `tasks/done/entities-backlink-file-service-boundary.md` | verified FileService stat/watch boundary, watcher-arm race recovery, external-edit incremental backlinks, readable no-ID excerpts, 52 core + 120 artifact tests; unrelated load-sensitive Embedded view 1000ms gate recorded |
| 696 | done | Embedded view first-render budget | `tasks/done/embedded-view-first-render-budget.md` | verified: full production gate 16/16, 79 screenshots, 48 baselines, 0 console errors; Embedded 10×500 max 263.1ms under unchanged 1000ms with machine-readable evidence |
| 697 | done | Floating table of contents navigation and layout bugs | `tasks/done/floating-toc-navigation-and-layout-bugs.md` | independently verified source-safe TOC navigation and four-view non-overlap; repaired repeatable Page History raster gate with tested minimum 0.20 threshold and zero-pixel budgets |
| 698 | done | Row page duplicate latency | `tasks/done/row-page-duplicate-latency.md` | independently reproduced and fixed concurrent atomic-append loss; verified 12/12 concurrent appends, shared write/append serialization, 52/52 core, UI smoke, 58.880ms median / 76.418ms max latency, typecheck, fixtures, build, and task-doc gates |
| 699 | done | Floating table of contents cannot collapse | `tasks/done/floating-toc-collapse-interaction.md` | removed hover/focus auto-expand; verified persistent click and keyboard collapse in four Electron viewports with machine-checked recollapse screenshots |
| 700 | done | Per-launch startup performance diagnostics tab | `tasks/done/startup-performance-diagnostics-tab.md` | independently fixed diagnostics re-selection and sidebar-navigation tab loss; verified pinned session-only report across desktop/compact reloads, 6.584ms startup median, typecheck, renderer, fixtures, latency, and build gates |
| 701 | done | Startup validation fast path | `tasks/done/startup-validation-fast-path.md` | verified zero startup Markdown reads and unchanged source files; 43,320 page records / 1,186 databases index in 1,594.139ms, 60/60 core/API/import tests, startup latency, typecheck, fixtures, latency, build |
| 702 | done | Persistent SQLite startup cache | `tasks/done/persistent-sqlite-startup-cache.md` | rebuildable 4.75MB SQLite projection; real 43,320-page / 1,186-database warm backend startup measured at 69-84ms with source invalidation and crash-safe fallback |
| 703 | done | Persistent row-page startup snapshots | `tasks/done/persistent-row-page-startup-snapshots.md` | verified 43.6MB rebuildable cache; real warm backend cycles 323-352ms with 33-34ms row-page restore and zero pages CSV reads; corruption/external-edit/crash tests and Electron smoke passed |
| 704 | done | End-to-end warm startup under one second | `tasks/done/end-to-end-warm-startup-under-one-second.md` | 43,320-page / 1,186-database full-process warm launch: 738ms median, 818ms max; lazy IPC/renderer/sidebar hydration; incremental source-safe cache overlays; full regression and installed-app verification |
| 705 | done | Cold startup index cache under one second | `tasks/done/cold-startup-index-cache-under-one-second.md` | real Build 36: 223.5ms warm startup, 57.9ms workspace index, 639KB local SQLite; lazy row sidecars, crash/source consistency, full-process gates |
| 706 | done | Notion-style hover table of contents | `tasks/done/notion-style-hover-table-of-contents.md` | 32px/42%-opacity rail, hover/focus overlay, pointer/focus/Escape auto-hide, zero document reflow, source-safe navigation, four-viewport screenshots |
| 707 | done | TOC pointer-navigation auto-hide regression | `tasks/done/toc-pointer-navigation-auto-hide-regression.md` | fixed pointer-owned sticky focus; 34%-opacity transparent rail, 90%-alpha expanded surface, click-heading-exit regression across four Electron viewports |
| 708 | done | TOC pointer-to-keyboard focus ownership | `tasks/done/toc-pointer-to-keyboard-focus-ownership.md` | click-to-Tab transfers focus ownership; keyboard focus survives pointer exit while pure-pointer auto-hide remains covered across four Electron viewports |
| 709 | done | TOC keyboard ownership snapshot contract | `tasks/done/toc-keyboard-ownership-snapshot-contract.md` | independently reproduced false-positive snapshot acceptance; shared ownership assertion, negative contract test, and four-view Electron evidence passed |
| 710 | done | Notion short-ID embedded view recovery | `tasks/done/notion-short-id-embedded-view-recovery.md` | resolved sparse duplicate-title embedded views; repaired 3,311 placeholders with verified backups and no unrelated source changes |
| 711 | done | Notion collection conflicting evidence | `tasks/done/notion-collection-conflicting-evidence.md` | verified terminal ambiguity for conflicting row/href evidence; both regressions plus unrestricted 79/79 fast suite, build, typecheck, and task-doc gates passed |
| 712 | done | Global date/time default inheritance | `tasks/done/global-date-time-default-inheritance.md` | fixed inherited formats becoming local overrides; focused regression, two-viewport Electron persistence smoke, 79/79 fast suite, typecheck, and build passed |
| 713 | done | Local-authoritative public main restoration | `tasks/done/local-authoritative-public-main-restoration.md` | restored shared files from local commit 5acfd1d, retained public-only release infrastructure, excluded private assets, and added strict workspace-entry Notion import screenshot coverage |
| 714 | done | Notion import rounded-corner visual baseline determinism | `tasks/done/notion-import-rounded-corner-visual-baseline-determinism.md` | verified two consecutive strict Electron passes; only the 10×15 live-backdrop corner is excluded and an outside-region pixel still fails |
| 715 | done | Notion import database icon identity | `tasks/done/notion-import-database-icon-identity.md` | exact wrapper identity and link-target evidence, safe repair restored 10 production icons, 79/79 fast suite, build, and installed-app visual verification passed |
| 716 | done | Inline database icon provenance and rendering | `tasks/done/inline-database-icon-provenance-and-rendering.md` | restored 3 source-backed icons, rendered custom/default icons in embedded views, added dual-export database-page regression coverage, and verified repair idempotence |
| 717 | done | Notion import lazy empty row bodies | `tasks/done/notion-import-lazy-empty-row-bodies.md` | property-only rows retain CSV data with lazy body metadata; real 1,185-database dual-export import passed structure and hierarchy validation |
| 718 | done | Embedded database icon visual baseline | `tasks/done/embedded-database-icon-visual-baseline.md` | fixed input-backed row-title assertions and verified the intentional icon baselines twice at 0 changed pixels across compact, desktop, and wide |
| 719 | done | Packaged search ripgrep executable path | `tasks/done/packaged-search-ripgrep-executable-path.md` | resolved app.asar paths to app.asar.unpacked, executed the packaged binary in verification, and confirmed a real imported row title is searchable |
| 720 | done | Exact database title search ranking | `tasks/done/exact-database-title-search-ranking.md` | exact database ranks first, internal stats row resolves to database identity, 80/80 fast suite, real-workspace installed-app verification |
| 721 | done | Database parent breadcrumb navigation | `tasks/done/database-parent-breadcrumb-navigation.md` | complete-path ancestor resolution, accessible parent links, focused Electron click regression, installed 52-row real-database verification |
| 722 | done | Unified entity header breadcrumbs | `tasks/done/unified-entity-header-breadcrumbs.md` | one resolver and renderer across page/database/row-page headers; complete-path duplicate-title safety; focused and broad two-viewport Electron regressions; 80/80 fast suite; packaged and real-workspace installed-app verification |
| 723 | done | Notion entity icon ownership report | `tasks/done/notion-entity-icon-ownership-report.md` | stable-ID wrapper icon transfer, complete ownership audit, 6,496 real-export icon claims with zero unassigned, full fast suite, package verification, and installed-app replacement |
| 724 | done | Restore GitHub Release packaging | `tasks/done/restore-github-release-packaging.md` | clean isolated `npm ci`, locked project-local builder, full local gates, verified arm64 package, successful GitHub arm64/x64 package and startup jobs |
| 725 | done | Unsigned macOS preview installation | `tasks/done/unsigned-macos-preview-installation.md` | README download, architecture selection, Gatekeeper override, terminal fallback, source-build option, subscriber-owned backlink watcher cleanup |
| 726 | done | Restore clean-checkout quality gate | `tasks/done/restore-clean-checkout-quality-gate.md` | clean Node 22 reproduction, exact generated-fixture allowlist, runtime/harness race repairs, complete UI and production visual gates |
| 727 | done | Cross-timezone row property visual baseline | `tasks/done/cross-timezone-row-property-visual-baseline.md` | UTC vs America/Los_Angeles fixture determinism, strict three-viewport baselines, remote quality-gate verification |

## Latency Benchmark Coverage

Covered focused gates:

- Page open latency through the public API.
- Embedded database first render UI benchmark.
- Cell edit commit latency through the public API.
- Search service latency and search popup UI benchmark.
- Editor scroll/edit latency benchmarks.
- CSV read latency for the production CSV reader.
- Row-page duplicate latency at a 43k / roughly 30 MB system-page index scale.

When future queue items touch a performance-sensitive surface without focused
coverage, add the smallest meaningful benchmark with that item.
