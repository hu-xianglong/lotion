# Entities Backlink File-Service Boundary

Status: done

Verification status: verified

## Goal

Route entity backlink watcher and synchronous metadata reads through the
authoritative `FileService` boundary without changing incremental external-edit
behavior.

## Problem

- `EntitiesDatabaseService` imports `statSync`, `watch`, and `FSWatcher`
  directly from `node:fs`.
- `npm run test:file-boundary` rejects that import, leaving a release gate red.
- The direct calls belong to the incremental backlink watcher introduced for
  external Markdown/table edits, so a mechanical deletion would silently
  remove live refresh behavior.

## Verification Plan

- Preserve watcher installation, unref/close lifecycle, initial file
  signatures, and external mutation notification semantics behind
  `FileService`.
- Use the existing real external Markdown backlink regression to prove watcher
  behavior, plus core file-service and hierarchy/customer regression suites.
- Run type/build, file-boundary, coverage, latency, task-doc, and relevant UI
  gates before promotion.

## Debugging

- The focused boundary reproduction failed before the fix:
  `npm run test:file-boundary` reported the direct `node:fs` import in
  `src/main/services/entities-database-service.ts`.
- The import was not dead code: `statSync`, `watch`, and `FSWatcher` supported
  incremental refresh after external Markdown/table edits. Removing them would
  have made the boundary test green while silently breaking live backlinks.
- Added `FileService.statSync()` and `FileService.watch()` as the authoritative
  wrappers, then routed watcher installation, initial signatures, and lifecycle
  typing through that boundary.
- The first combined core run exposed a real startup race: the external
  backlink test timed out when it followed the storage/file-cache tests, while
  the same test passed alone. `fs.watch()` could return before the platform
  watcher was fully armed, leaving a narrow interval after the initial
  signatures were captured.
- Added a one-shot post-install signature recheck using the existing settled
  metadata scan. The risky combined pattern then passed three consecutive runs,
  proving the fix was stable under the ordering that originally failed.
- The page-backlinks smoke also exposed an artifact-contract drift. The product
  correctly renders the readable Markdown excerpt `See Backlink Target Page.`;
  the smoke still expected raw link syntax. Updated the positive contract and
  added a negative regression that rejects internal `pg_`, `db_`, or `row_`
  identifiers in user-visible excerpts.
- The broad production visual gate exposed an independent Embedded view
  performance-budget failure. Default runs measured 1140.5ms, 1080.7ms, and
  1195.1ms for 10 views against the existing 1000ms budget. A controlled A/B
  run without the new post-install signature recheck still measured 1053.1ms,
  versus 1049.3ms with it, excluding this feature as the cause. The diagnostic
  edit was immediately restored.
- Under long serial UI-suite load the same Embedded view benchmark reached
  2475.5ms, and Page secondary once timed out waiting for injected-save
  feedback. Page secondary passed when rerun alone, confirming load sensitivity.
  The repository threshold was not changed and the failing global gate is not
  reported as passing.

## Verification

- `npm run typecheck`, `npm run build`, and `npm run test:file-boundary`
  passed. The production build transformed 2,338 modules, and the boundary
  failure that selected this task is now resolved.
- `node --test test/package-core.test.mjs` passed 52/52.
- The focused `storage, file cache|entity backlinks` core pattern passed three
  consecutive runs after the watcher-arm fix. Coverage includes external
  Markdown removal/restoration without navigation and preserves incremental
  refresh semantics behind `FileService`.
- `npm run test:customer-api` passed 6/6, and `npm run test:hierarchy` passed.
- `npm run smoke:page-backlinks-ui` passed desktop/compact with 38 backlinks,
  external removal/restoration without navigation, readable excerpts without
  internal IDs, keyboard navigation for page/property backlinks, and 100 seeded
  page opens. Evidence:
  `artifacts/ui-smoke/page-backlinks-ui-2026-07-24T04-48-22-302Z/`.
- `node --test test/ui-harness-artifacts.test.mjs` passed 120/120, including the
  new negative internal-ID excerpt contract.
- Renderer coverage passed with 64/66 source files executed and 64.77%
  lines/statements, 28.83% functions, and 67.54% branches, with no regression
  against the preceding verified baseline.
- `npm run test:latency` passed. The slowest 20,000-row view query was 12.7ms;
  the 50,000-row CSV benchmark had a 44.325ms median and 61.37ms maximum.
- The production visual baseline/unit layer passed 25/25. Design system, White
  theme, Search popup, Search & AI, Markdown preview, Database created views,
  Database interaction, and Row-page property visual suites passed with their
  committed perceptual baselines. Focused `npm run smoke:page-secondary-ui`
  also passed after the serial-load timeout.
- The default `npm run test:production-visual` remains red only at the existing
  load-sensitive Embedded view 1000ms budget described above; no threshold or
  baseline was weakened to hide it.
- Before and after promotion, `npm run test:task-docs` passed 3/3 and validated
  707 task files, 833 references, and all 695 queue items. The promoted renderer
  coverage trend also passed with zero regression across all four metrics.
