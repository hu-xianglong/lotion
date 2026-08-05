# Notion Import Isolated Real-Workspace Visual Pass

Status: done

Verification status: verified

## Goal

Run the remaining named real-workspace production visual pass against an
isolated clone of `Notion Import`, with no writes or cleanup directed at the
source workspace.

## Acceptance Criteria

- Reuse the verified regular-file/symlink-rejecting clone and fingerprint
  safety boundary from queue item 646.
- Exercise representative imported Chinese, toggle, image/media, and import
  modal/layout surfaces across desktop and compact viewports.
- Gate console errors, overflow, overlap/clipping, modal ownership, screenshots,
  and meaningful open/render latency.
- Prove source before/after equality and persist only redacted source identity.
- Add focused artifact-contract positive/negative coverage and document the
  exact verification result.

## Real-Workspace Constraint

The current source workspace is the known stale import recorded by
`tasks/done/imported-notion-toggle-page-regression.md`: the original nested
toggle page is absent. Verification must record that fact, exercise an existing
imported row natively, and seed the importer-regression toggle shape only inside
the disposable clone.

## Required Verification

- real Notion Import Electron smoke on desktop and compact
- artifact-contract positive and mutation/missing-media negative tests
- legacy row-page body-path regression
- UI harness redacted evidence serialization regression
- `npm run typecheck`
- `npm run test:task-docs`
- `git diff --check`

## Delivered

- Reused the regular-file-only, symlink-rejecting, copy-on-write clone helper
  and complete source/clone/post-run SHA-256 fingerprints.
- Added a real Electron runner for a native imported database row,
  the actual Notion Import plugin modal, and an exact importer toggle shape
  seeded through the public pages API only inside the disposable clone.
- Added desktop and compact gates for Chinese content, toggle summary/body,
  loaded media, editable summary, collapse/re-expand, following log table,
  latency, horizontal overflow, modal role/backdrop/ownership, screenshots,
  console errors, and active-clone identity.
- Added a strict artifact contract and focused positive/negative tests. Extended
  the harness whitelist so seed provenance, stale-source status, interaction
  metrics, and modal evidence survive in `harness-result.json` without source
  or clone paths.
- Restored legacy imported row-body compatibility for
  `pages/db_<databaseId>/<page_file>`, while preserving current database-local
  row bodies as the higher-priority source.

## Debugging

- The first real run opened the correct row title and properties but rendered
  an empty editor. The source body lived in the legacy top-level row-page
  folder; the current service only tried the database-local folder. A focused
  regression now proves legacy fallback and current-layout priority.
- The second real run visibly rendered the seeded receipt image but timed out
  because the smoke expected the obsolete `.cm-md-image-widget img` wrapper.
  The current toggle body emits a direct image; the runner now checks
  `.cm-md-toggle-body img`, and its loaded-image evidence is persisted.
- The real source is a known stale import and does not contain the original
  nested toggle page/hash. The final evidence explicitly records that
  absence and labels the exact toggle regression page as clone-seeded rather
  than native.

## Verification

Verified on 2026-07-22.

- Final Electron artifact:
  `artifacts/ui-smoke/real-notion-import-ui-2026-07-23T02-17-14-884Z/harness-result.json`.
- Source, clone, and post-run source fingerprints matched; source-path
  redaction and clone-only mutation boundaries passed.
- Desktop native row open was 614.2 ms; seeded toggle page open was 114.5 ms.
  Compact native row open was 503.7 ms; seeded toggle page open was 111.8 ms.
- Both viewports recorded one toggle, one loaded image, successful collapse and
  re-expand, the following log table, 0 px document overflow, and correct
  clone-seed provenance.
- Both real import modals were dialogs with `aria-modal=true`, viewport-covering
  backdrops, center ownership, no underlying page-title ownership, and 0 px
  document overflow.
- Six screenshots passed artifact checks and manual visual review. Native row
  content/table, toggle/image, and modal controls were legible and unclipped in
  desktop and compact captures.
- Harness recorded both required viewports and zero console/page errors.
- Artifact-contract tests passed 2/2; focused legacy row-body and redacted
  harness persistence regressions passed.
- `npm run typecheck`, `npm run test:task-docs`, and `git diff --check` passed.
