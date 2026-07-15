# Notion Import Audit Failure Artifact Contract

Status: wip

## Why

The Notion import audit regression lane proves the happy path: source/workspace
roots are visible, path buttons work, and the passing result is captured in the
UI suite artifact index. It does not yet prove that a real import failure is
readable and reviewable in the UI artifact output. That leaves regressions like
hidden issue rows, missing issue-kind counts, or broken failure snapshots easy
to miss until manual review.

## Scope

- Extend the Notion import audit UI smoke with a deterministic failing fixture
  that produces a concrete `cell_loss` diagnostic.
- Capture the failing audit result across desktop and compact viewports.
- Extend the Notion import audit artifact contract so it validates both passing
  and failing diagnostics, including issue summary, issue kind cards, issue
  rows, openable paths, and non-empty screenshots.
- Ensure the aggregate UI suite index includes enough failure-diagnostic detail
  to review the audit without opening each child artifact.

## Result

- The Notion import audit smoke now runs a passing import fixture and a failing
  fixture that produces `cell_loss=1`.
- The artifact contract validates both passing and diagnostic screenshots for
  desktop and compact viewports.
- The shared harness preserves diagnostic fields (`phase`, `issueKinds`,
  `issueRows`, `failText`) in `harness-result.json`.
- The aggregate UI suite Markdown now exposes `phase=diagnostic` and
  `cell_loss=1`, so audit failures can be reviewed from the suite index.

## Verification

- [x] `node --check scripts/ui-harness.mjs`
- [x] `node --check scripts/lib/notion-import-audit-artifacts.mjs`
- [x] `node --check scripts/smoke-notion-import-ui.mjs`
- [x] `node --check test/ui-harness-artifacts.test.mjs`
- [x] `node --test test/ui-harness-artifacts.test.mjs`
- [x] `npm run smoke:notion-import-ui`
  - Artifact: `artifacts/ui-smoke/notion-import-audit-2026-06-17T11-31-26-417Z/harness-result.json`
- [x] `LOTION_UI_SUITE_FILTER=smoke-notion-import-ui.mjs npm run smoke:ui`
  - Suite index: `artifacts/ui-smoke/ui-suite-2026-06-17T11-32-16-665Z/ui-suite-artifacts.md`
- [x] `npm run typecheck`
- [x] `git diff --check`
