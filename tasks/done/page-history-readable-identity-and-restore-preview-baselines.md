# Page History Readable Identity And Restore-Preview Baselines

Status: done

Verification status: verified

## Goal

Remove internal workspace storage paths from page-detail backlinks and local Git
history preview labels, exercise the ready/preview/restore workflow, and promote
the selected restore-preview state to reviewed desktop, compact, and wide
production baselines.

## Acceptance Criteria

- Prove the existing backlink and history-preview storage-path leaks from
  screenshot, renderer, and source evidence.
- Render backlink excerpts as readable Markdown text without link destinations,
  and label history previews with logical page identity rather than file paths.
- Preserve page-detail collapse/expand, properties, backlink navigation,
  keyboard focus, editor persistence, and floating TOC behavior.
- Add deterministic ready history with multiple versions, selected preview
  diff, confirmation, Restore action, restored editor content, and success
  message coverage.
- Record history-panel, status, version, preview, diff, Restore button, and
  storage-leak geometry/state in interaction summaries and screenshot metadata.
- Reject clipped/offscreen history controls, raw storage paths or embedded IDs,
  missing preview/restore evidence, and horizontal overflow.
- Commit stable strict desktop, compact, and wide restore-preview baselines and
  require them through child, production, and release contracts.
- Add missing-baseline, clipping/path-leak, and committed-image mutation
  negatives without lowering renderer coverage.
- Record debugging, manual review, commands, artifacts, and exact results
  before moving this task to done/verified.

## Debugging

- The latest expanded Page Secondary screenshots in
  `artifacts/ui-smoke/page-secondary-ui-2026-07-22T20-19-50-770Z/` render raw
  `databases/system/pages--db_pages/...` destinations inside every backlink
  excerpt.
- `PageBacklinks` renders the raw backlink excerpt produced from the Markdown
  source line, including inline-link destinations.
- `PageHistoryPanel` renders `preview.version.path` directly in its preview
  header. The renderer regression test explicitly requires this internal file
  path, so the leak is currently protected rather than rejected.
- The current UI smoke exercises only `repo_missing`; it never selects a
  version, displays a diff, exposes Restore, confirms restoration, or proves
  the restored editor content.
- Screenshot metadata records only panel expansion and backlink counts. It
  cannot reject identity leaks, clipped history controls, or missing
  ready/preview/restore state.

## Verification

### Delivered

- Replaced raw history file paths with `Page snapshot · <page title>` logical
  identity and stripped Markdown link destinations/internal autolinks from
  backlink excerpts.
- Moved backup and restore success messages after the history refresh so a
  successful operation remains visible instead of being cleared immediately.
- Added real, deterministic two-commit Git fixtures. The smoke selects the older
  version, renders a 20-line preview with one addition and one removal, accepts
  the confirmation, restores the historical Markdown, and verifies both editor
  and persisted file content.
- Added screenshot state and artifact-contract checks for the history panel,
  Ready status, both versions, selected preview, logical label, Restore button,
  diff counts, backlink excerpts, visibility/opacity, containment, overflow,
  restored content, and absence of storage-path leaks.
- Added negative tests for path leaks, collapsed/transparent false-positive
  captures, missing required baselines, and deliberate committed-image
  mutation.
- Added reviewed desktop, compact, and wide production baselines and linked
  them into child, aggregate production, and release contracts. Laptop remains
  a supplemental structural viewport.

### How it was verified

- Reviewed the prior failing screenshots and source/component assertions to
  reproduce both path leaks and the unexercised restore flow.
- Manually reviewed the new compact restore-preview screenshot. `Ready`, two
  logical versions, `Page snapshot · Page Secondary Target compact`, Restore,
  and the red/green diff are fully visible with no internal path.
- Repeated the focused smoke before baseline promotion, then reran it against
  the committed baselines. Desktop, compact, and wide each reported
  `diffPixels: 0`, `diffRatio: 0`; laptop passed the structural contract.
- Ran the focused production visual gate with only
  `scripts/smoke-page-secondary-ui.mjs` required. It passed with one suite,
  four screenshots, 175,115 image bytes, three perceptual baselines, zero
  console errors, and no missing evidence.
- Renderer coverage passed its absolute and historical gates: lines/statements
  31.49% (+0.05), functions 23.36% (+0.34), and branches 61.34% (+0.30).

### Commands and evidence

- `node --test test/ui-harness-artifacts.test.mjs test/production-visual-baseline.test.mjs test/test-release.test.mjs`
  — 121/121 passed.
- `LOTION_UI_VIEWPORTS='desktop,compact,wide:1728x1100' npm run smoke:page-secondary-ui`
  — passed; strict evidence at
  `artifacts/ui-smoke/page-secondary-ui-2026-07-23T14-46-51-516Z/harness-result.json`.
- `LOTION_PRODUCTION_VISUAL_FILTER='smoke-page-secondary-ui.mjs' LOTION_PRODUCTION_VISUAL_REQUIRED_SCRIPTS='scripts/smoke-page-secondary-ui.mjs' npm run test:production-visual`
  — passed; production evidence at
  `artifacts/ui-smoke/ui-suite-2026-07-23T14-48-01-945Z/production-visual-gate/production-visual-gate.json`.
- `npm run build` — passed (TypeScript main build plus 2,338-module renderer
  production bundle).
