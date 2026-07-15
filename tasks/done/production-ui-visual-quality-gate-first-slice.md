# Production UI visual quality gate first slice

## Status

Done.

## Context

Recent user-reported regressions were visual/product-quality failures that
ordinary renderer coverage did not catch:

- Notion Import overlay could visually collide with the page behind it.
- Imported Notion toggle pages could render with broken source/preview layout.
- Embedded database headers and row-property panels needed stronger visual
  evidence beyond screenshots existing.

This slice creates a concrete production visual gate without claiming the whole
visual-regression roadmap is done. The broader rollout remains in
`tasks/todo/production-ui-visual-quality-gate.md`.

## Implemented

- Added `npm run test:production-visual`.
- Added `scripts/test-production-ui-visual-quality.mjs`, which runs the shared
  UI suite with the critical visual filter:
  `notion-import,markdown-preview-ui,embedded-view,row-page-property-visual`.
- Added production visual gate contract checks for:
  - required critical surface scripts
  - desktop and compact viewport coverage
  - non-empty screenshot paths and metadata paths
  - zero console errors
  - focused reproduce commands
  - no missing child artifact contracts
- Wrote a machine-readable production gate artifact and Markdown summary under
  the parent UI suite artifact root.
- Strengthened Markdown preview artifact summaries to preserve screenshot and
  metadata paths.
- Strengthened UI harness artifact summaries to preserve embedded table
  header/load-more evidence.
- Added unit coverage for successful production gate validation and failure
  modes: missing required suite, missing compact screenshot, and weak reproduce
  command.
- Documented the gate in `docs/testing.md`.

## Verification

- [x] `node --check scripts/test-production-ui-visual-quality.mjs`
- [x] `node --check scripts/lib/ui-suite-artifacts.mjs`
- [x] `node --check scripts/lib/markdown-preview-artifacts.mjs`
- [x] `node --check scripts/ui-harness.mjs`
- [x] `node --test --test-name-pattern "production visual gate" test/ui-harness-artifacts.test.mjs`
- [x] `node --test --test-name-pattern "markdown preview artifact contract|production visual gate" test/ui-harness-artifacts.test.mjs`
- [x] `node --test --test-name-pattern "ui harness result manifests summarize success|production visual gate|markdown preview artifact contract" test/ui-harness-artifacts.test.mjs`
- [x] `npm run typecheck`
- [x] `npm run test:production-visual`
  - First sandbox attempt failed with `listen EPERM 127.0.0.1`; reran through
    the approved non-sandbox npm path.
  - Passing artifact:
    `artifacts/ui-smoke/ui-suite-2026-06-17T21-05-17-431Z/production-visual-gate/production-visual-gate.json`
- [x] `git diff --check`
