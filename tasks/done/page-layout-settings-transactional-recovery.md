# Page Layout Settings Transactional Recovery

Status: done

Verification status: verified

## Goal

Debug the shared page and row-page Full width / Small text controls so
asynchronous persistence failures remain visible and recoverable, retain the
exact attempted layout, suppress duplicate or competing writes, and cannot
retarget another entity.

## Problems

- Full width and Small text optimistically changed local state, then awaited
  persistence without owning the asynchronous operation. A rejected write
  silently restored props with no visible Retry or Discard path.
- The two controls used independent handlers. A second click in the same render
  frame could start a competing write before React committed the disabled
  state, and local optimistic state could diverge from the authoritative store.
- Failed operations did not retain the exact setting, value, callback, or
  entity generation. Recovery could not safely guarantee an exact retry or
  prevent a stale completion from affecting the next page.
- The Editor Regression harness treated the first matching multi-file read as
  authoritative. During row-page rollback it could observe the updated Pages
  database before the transaction restored the related bundle, producing a
  transient false-positive success signal.

## Debugging

- Added a shared page-layout mutation controller with synchronous ownership.
  It retains the exact setting, boolean value, and operation; normalizes raw
  rejections; suppresses competing submissions and repeated Retry; supports
  explicit Discard; and invalidates stale completions after an entity reset.
- Routed Full width and Small text through the same controller and recovery
  state. Both controls are blocked while saving or failed, attempted visuals
  remain visible after failure, Retry replays the captured operation exactly,
  and Discard restores the current authoritative props.
- Added a synchronous controller guard before optimistic local updates. This
  closes the same-frame gap in which React had not yet rendered the disabled
  state, so a competing click cannot corrupt the visible draft.
- Extended package-core coverage for both ordinary page metadata and row-page
  full-width bundle transactions. Injected failures prove stored values and raw
  bytes roll back atomically before an exact retry succeeds.
- Extended the real Electron regression for ordinary pages and empty row pages.
  It injects metadata or bundle failures through the visible options menu and
  records rollback, retained draft, blocked controls, duplicate-safe Retry,
  exact persistence, Discard, and restored baseline evidence.
- Stabilized authoritative row-page reads by requiring three consecutive
  matching observations 75 ms apart. Debugging showed the previous single-read
  wait could land between a multi-file write and rollback; the stable-read
  contract distinguishes that transient state from a completed transaction.
- Made layout-recovery evidence mandatory in the Editor Regression artifact
  contract and added a negative fixture that rejects incomplete evidence.

## Verification

- `npm run typecheck`, `npx tsc -p tsconfig.main.json`, and `npm run
  test:renderer-components` passed. The real-source controller contract covers
  raw failure, same-frame competing suppression, duplicate Retry suppression,
  exact Retry, repeated failure, Discard, stale-generation invalidation, and a
  current-entity submission.
- `node --test test/package-core.test.mjs` passed 52/52. The new focused tests
  prove injected page-metadata and row-page bundle failures preserve stored
  layout and byte-for-byte database state, then persist the exact retry value.
- `node --test test/ui-harness-artifacts.test.mjs` passed 119/119, including the
  negative incomplete-layout-recovery contract.
- Editor Regression passed both target viewports with all page and empty
  row-page recovery booleans true. The ordinary page exercised Full width
  Retry and Small text Discard through injected metadata failures. The row page
  exercised Full width Retry and Discard through injected database-bundle
  failures. Both proved stable authoritative rollback, retained attempted
  visuals, both controls blocked, double-Retry suppression, exact persistence,
  Discard without persistence, and restoration of the starting layout.
  Evidence:
  `artifacts/ui-smoke/editor-regression-2026-07-24T03-32-00-696Z/`
  (desktop) and
  `artifacts/ui-smoke/editor-regression-2026-07-24T03-34-48-052Z/`
  (compact).
- Renderer coverage passed with 64/66 source files executed and aggregate
  coverage of 64.68% lines/statements, 28.67% functions, and 67.49% branches.
  All four metrics improved over the preceding verified baseline.
- `npm run test:production-visual` passed 16/16 required suites, 79 snapshots,
  48 perceptual baselines at zero pixel difference, 8,691,942 image bytes, no
  missing contracts, and zero console errors. Evidence:
  `artifacts/ui-smoke/ui-suite-2026-07-24T03-38-41-995Z/production-visual-gate/production-visual-gate.json`.
- `npm run test:fast` reached the pre-existing unrelated boundary violation at
  `src/main/services/entities-database-service.ts:2` (`node:fs` is used by
  concurrent backlink-watcher work). The feature does not touch that file.
  Every remaining fast-gate command was then run individually and passed,
  including main TypeScript, 67 combined customer/core/integration/release
  tests, renderer and policy contracts, links/hierarchy/workspace/fixture
  validators, latency, and rollup.
- After promotion, `npm run test:task-docs` passed 3/3 and validated 703 task
  files, 829 references, and all 691 queue items. The promoted renderer
  coverage trend also passed with zero regression across all four metrics.
