# GitHub Backup Readable Identity And Restore-Preview Baselines

Status: done

Verification status: verified

## Goal

Remove internal workspace paths from the GitHub Backup restore preview, turn the
existing interaction-only smoke into actionable visual evidence, and promote
the backed-up two-version restore-preview state to reviewed desktop, compact,
and wide production baselines.

## Acceptance Criteria

- Prove the current restore-preview path leak and missing artifact contract from
  source, component, and latest smoke evidence.
- Render a logical page identity in the restore preview without workspace
  storage paths or embedded database/page identifiers.
- Exercise deterministic local-mock settings, two backups, two history
  versions, selected preview, diff, confirmation, restore, persisted Markdown,
  success message, and the GitHub API not-configured state.
- Capture modal, status, connection form, history, selected version, preview,
  diff, and Restore action geometry/state in screenshot metadata.
- Reject clipped/offscreen controls, modal/background ownership failures,
  horizontal overflow, raw storage paths, missing interaction evidence, and
  collapsed/transparent false-positive screenshots.
- Commit reviewed desktop, compact, and wide restore-preview baselines and
  require them through child, aggregate production, and release contracts.
- Add missing-baseline, path-leak, invalid-visibility, and committed-image
  mutation negatives without lowering renderer coverage.
- Record debugging, manual review, commands, artifacts, and exact results before
  moving this task to done/verified.

## Debugging

- `GitHubBackupPanel` renders `preview.version.path` directly in the restore
  header, exposing the workspace-relative Markdown storage path.
- `scripts/test-renderer-components.mjs` checks the preview structure and diff
  classes but does not reject the internal path or require logical identity.
- `scripts/smoke-github-backup-ui.mjs` exercises local history and GitHub backup
  interactions, but returns no screenshot metadata or artifact contract.
- The latest passing GitHub Backup smoke
  `artifacts/ui-smoke/github-backup-ui-2026-06-18T01-01-14-228Z/` has
  `artifactContract: undefined`, so production/release aggregation cannot
  review or require the surface.

## Verification

### Delivered

- Replaced the internal `preview.version.path` restore heading with
  `Page snapshot · <version title>`. Using the version title also avoids the
  nullable `activePage` edge found by TypeScript.
- Upgraded the GitHub Backup smoke from interaction-only coverage to a
  deterministic local-mock workflow with empty state, two backups, two history
  versions, selected older preview, diff, accepted confirmation, persisted
  restore, preview clearing, success message, and GitHub API not-configured
  state.
- Added runtime modal ownership checks for dialog semantics, full-viewport
  backdrop, background isolation, viewport bounds, modal-body scrolling,
  selected preview visibility, control containment, and horizontal overflow.
- Added complete-surface screenshot metadata for connection form, status,
  history, preview, diff, Restore action, opacity/visibility, logical identity,
  and storage-leak detection.
- Added a dedicated artifact contract and positive plus path-leak,
  transparent-capture, missing-baseline, and deliberate committed-image
  mutation tests.
- Preserved `historyCount`, `diffLineCount`, and `previewLabel` through the
  harness manifest so the production artifact index has readable evidence.
- Added GitHub Backup to the default production suite and committed reviewed
  desktop, compact, and wide restore-preview baselines for child, production,
  and release contracts.

### Debugging results

- The existing component rendered `preview.version.path`, and its renderer test
  explicitly expected `lotion-backups/pages/weekly-review.md`.
- The latest prior passing smoke had no artifact contract, screenshots, or
  baseline evidence.
- The first typecheck exposed a nullable `activePage` access in the initial
  logical-label implementation; the selected version's own title is the safer
  and semantically correct identity.
- The first two focused production attempts correctly failed because the child
  manifest discarded the new history/diff summary fields, leaving the
  aggregate suite with no readable detail text. Extending harness
  summarization fixed the evidence chain instead of weakening the gate.

### How it was verified

- Manually reviewed the complete compact modal screenshot: Connection, Backed
  up status, deterministic backup metadata, both history versions, selected
  state, `Page snapshot · Backup History Page`, Restore, and red/green diff are
  complete and no internal path is visible.
- Repeated all three candidate captures before promotion. Each viewport
  produced an identical checksum across runs:
  - desktop: `0d45389b38631343ff5b6a99d8b745e0e51db71fa57483917e32a0f174ccf049`
  - compact: `41f00c919a61195a5f7d3e4cdf4d0b92032ba49ffac5eb57e9bdc75e4afe5c1f`
  - wide: `4cb53430b33e31c07d85ec12052252a083d66d673987dc54da8378499fe6c314`
- Reran the promoted baselines: all three are 960×907 with `diffPixels: 0`
  and `diffRatio: 0`.
- The focused production gate passed with one required suite, three
  screenshots, 309,032 image bytes, three perceptual baselines, zero console
  errors, and readable history/diff/identity details.
- Renderer coverage passed absolute and historical gates: lines/statements
  31.49% (+0.05), functions 23.36% (+0.34), and branches 61.34% (+0.30).

### Commands and evidence

- `node --test test/github-backup-artifacts.test.mjs test/ui-harness-artifacts.test.mjs test/production-visual-baseline.test.mjs test/test-release.test.mjs`
  — 126/126 passed.
- `LOTION_UI_VIEWPORTS='desktop,compact,wide:1728x1100' npm run smoke:github-backup-ui`
  — passed; strict child evidence at
  `artifacts/ui-smoke/github-backup-ui-2026-07-23T15-05-17-339Z/harness-result.json`.
- `LOTION_PRODUCTION_VISUAL_FILTER='smoke-github-backup-ui.mjs' LOTION_PRODUCTION_VISUAL_REQUIRED_SCRIPTS='scripts/smoke-github-backup-ui.mjs' npm run test:production-visual`
  — passed; production evidence at
  `artifacts/ui-smoke/ui-suite-2026-07-23T15-07-27-018Z/production-visual-gate/production-visual-gate.json`.
- `npm run typecheck && node scripts/test-renderer-components.mjs` — passed.
- `npm run build` — passed (TypeScript main build plus 2,338-module renderer
  production bundle).
