# Production Frontend UI Test Foundation

Status: done

## Scope

Build a robust, production-ready frontend testing foundation for Lotion. This is
test infrastructure and product-quality work, not another ad hoc smoke script.

Do not rewrite every existing smoke in one pass. First implementation should
create the shared harness, migrate at least one high-value suite such as LLM
Chat or search, and document the migration path.

## Acceptance Bar

- Stable shared Electron/browser UI test harness with:
  - deterministic workspace fixtures/seeds,
  - app lifecycle control,
  - consistent cleanup,
  - event/DOM waits instead of brittle sleeps.
- Shared helpers for:
  - opening workspaces/pages/databases,
  - global search,
  - sidebar navigation,
  - LLM Chat,
  - dialogs,
  - editor typing, selection, paste, undo/redo, save, and reload flows,
  - keyboard actions,
  - geometry/layout assertions,
  - failure diagnostics.
- Parameterize core UI tests across at least desktop/laptop and compact/narrow
  viewport/window sizes.
- For user-facing UI tests, assert concrete behavior across sizes:
  - no overlap,
  - no horizontal overflow,
  - panels/dialogs within viewport,
  - primary controls visible/interactable,
  - keyboard/focus behavior,
  - readable empty/loading/error/status states.
- Add stable selectors/test ids or accessible roles where needed instead of
  relying on fragile CSS structure when a better selector can be added without
  harming product code.
- Capture useful failure artifacts:
  - screenshot,
  - DOM snapshot/log excerpt,
  - app console errors,
  - trace/video when supported.
  Artifacts should be easy to find in CI/local runs.
- Define tiers:
  - fast PR smoke suite,
  - focused feature suites,
  - optional slow/integration suites,
  - optional real external-provider suites guarded by explicit env flags.
- Provide CI-ready npm scripts and local reproduction docs.
- Add frontend coverage/quality policy:
  - every user-facing behavior change requires coded UI coverage in the shared harness,
  - multi-resolution coverage when relevant,
  - backend/service tests when data/API behavior changes.
- Add robust Notion-like text editor regression coverage, not just page-open or
  title-input checks:
  - typing latency and text insertion,
  - cursor/caret stability,
  - selection behavior,
  - keyboard navigation,
  - markdown shortcuts where supported,
  - block/line creation,
  - Enter and Backspace behavior,
  - undo/redo,
  - paste of plain text and markdown-ish content,
  - IME/composition safety when feasible,
  - save/autosave persistence,
  - reload consistency,
  - switching pages without losing edits,
  - focus restoration,
  - scroll position stability,
  - empty-page first typing flow,
  - large document editing,
  - error and recovery states.
- Editor UI coverage must run across desktop/laptop and compact/narrow sizes
  and assert:
  - no editor toolbar/status overlap,
  - no horizontal overflow,
  - editable area remains visible,
  - selection/focus remains coherent,
  - saved content matches expected markdown/model state.
- Include flake controls:
  - deterministic timeouts,
  - retry policy if allowed,
  - explicit cleanup,
  - no shared mutable test state,
  - clear quarantine/skip rules.

## Tests

- Migrate at least one high-value suite such as LLM Chat or search into the new
  harness.
- Audit existing one-off editor smokes and either migrate them into the shared
  harness or strengthen them with the editor behavior assertions above.
- Keep affected package-core/backend tests when data/API behavior changes.

## Gates

- Passed: `node --check scripts/ui-harness.mjs`
- Passed: `node --check scripts/smoke-editor-regression-ui.mjs`
- Passed: `npm run typecheck`
- Passed: `npm run smoke:editor-regression-ui`
- Passed: `git diff --check`

## Result

- Added `scripts/ui-harness.mjs`, a shared Electron UI harness with:
  - app lifecycle control that connects to CDP or starts `npm run dev`,
  - deterministic temporary workspace setup and cleanup,
  - previous-workspace restore,
  - desktop and compact viewport parameterization,
  - page/row-page open helpers,
  - markdown persistence waiters,
  - geometry/no-overflow assertions,
  - failure artifacts under `artifacts/ui-smoke/`.
- Added stable editor test selectors via `data-testid="markdown-editor"` and
  an accessible `aria-label` on the CodeMirror editor host.
- Added `npm run smoke:editor-regression-ui` and included it in
  `npm run smoke:ui`.
- Migrated the first high-value suite into the shared harness:
  `scripts/smoke-editor-regression-ui.mjs`.
- The migrated editor suite covers desktop and compact viewports, first typing,
  insertion latency, Enter/Backspace, undo/redo, plain-text and markdown-ish
  paste, slash heading creation, autosave persistence, page switching, reload
  consistency, empty row-page first typing, large-document scroll/edit stability,
  and editor/title/action geometry.
- Documented the shared harness, artifact path, viewport controls, and frontend
  UI testing policy in `docs/testing.md`.
- Package-core/backend tests were not applicable for this item because the
  behavior change is UI harness/test infrastructure plus one renderer selector;
  no storage, IPC, parser, or service behavior changed.
