# Page Parent Cycle Validation

Status: done

Verification status: verified

## Goal

Prevent public page metadata updates and renderer plugin page moves from
persisting self-parent or ancestor/descendant cycles in the page hierarchy.

## Problem

- Renderer `WorkspaceAPI.movePage()` rejects only `newParent === id`.
- The authoritative `PageService.update()` accepts arbitrary page parent
  metadata without validating the parent chain.
- A caller can therefore move a parent page under one of its descendants and
  persist a cyclic hierarchy that sidebar/tree consumers cannot represent
  safely.

## Verification Plan

- Reproduce the cycle through the public customer API.
- Enforce the invariant in `PageService`, so every IPC/customer/plugin caller
  receives the same protection.
- Cover direct self-parenting, descendant cycles, valid reparenting, clearing a
  parent, and non-page parents.
- Run focused customer/core/renderer tests, hierarchy UI coverage, type/build,
  coverage, latency, task-doc, and production visual gates.

## Debugging

- Added the missing public API regression before changing the service. The
  direct self-parent case reproduced the defect with
  `Missing expected rejection`, proving that the authoritative service accepted
  invalid hierarchy metadata.
- Added parent-chain validation to `PageService.update()`. Page parents now
  reject direct self-parenting, moving an ancestor beneath a descendant, and
  attaching to an already-cyclic page chain. Database and other non-page
  parents remain valid, and clearing a parent remains supported.
- Hierarchy-changing updates now share a service-level serialization queue in
  addition to the existing per-page queue. Without cross-page serialization,
  simultaneous `A -> B` and `B -> A` updates could both validate against stale
  metadata and commit a two-node cycle.
- The public API regression verifies that exactly one simultaneous reciprocal
  move succeeds, the other rejects, and the persisted records are not mutually
  parented. It also verifies that rejected self/descendant moves leave stored
  metadata unchanged.
- Added a renderer plugin workspace contract that executes
  `WorkspaceAPI.movePage()`: valid moves construct the expected parent path,
  clearing emits null parent metadata, direct self-parenting is rejected before
  an update call, and the authoritative descendant-cycle error propagates back
  to the plugin.
- The sidebar hierarchy smoke exposed two test-harness races unrelated to the
  service invariant. It waited only for an already-mounted title input and
  could read the old page title, while its asynchronous browser predicate could
  occasionally return boolean `false` as the new id. The smoke now polls for a
  newly persisted `pg_` id and then waits for the input value to switch to
  `Untitled`, making the real create-child assertion deterministic.

## Verification

- `npm run typecheck` and `npm run build` passed; the production build
  transformed 2,338 modules.
- `npm run test:customer-api` passed 6/6. Coverage includes direct self-parent,
  ancestor-under-descendant, concurrent reciprocal moves, unchanged metadata
  after rejection, valid database parenting, clearing a parent, valid page
  parenting, and cleanup.
- `node --test test/package-core.test.mjs` passed 52/52, `npm run
  test:renderer-components` passed with the new renderer plugin move contract,
  and `npm run test:hierarchy` passed against the sample workspace.
- `npm run smoke:sidebar-navigation-ui` passed desktop/compact. It verified the
  created child's page id, `parentId`, `parentKind`, complete path, visible
  nesting, recent-page entry, collapse persistence, and quick-create editing
  loop. Evidence:
  `artifacts/ui-smoke/sidebar-navigation-2026-07-24T04-35-44-532Z/`.
- `npm run smoke:page-secondary-ui` passed desktop/compact/laptop, including
  page editing, history restore, metadata failure recovery, TOC, backlinks,
  and zero-pixel desktop/compact baseline diffs. Evidence:
  `artifacts/ui-smoke/page-secondary-ui-2026-07-24T04-34-29-005Z/`.
- `node --test test/ui-harness-artifacts.test.mjs` passed 119/119.
- Renderer coverage improved to 64.77% lines/statements, 28.83% functions, and
  67.54% branches across 64/66 covered source files. All four metrics improved
  over the preceding verified baseline.
- `npm run test:latency` passed. The slowest 20,000-row view query was 12.3ms;
  the 50,000-row CSV benchmark had a 42.865ms median and 62.165ms maximum.
- `npm run test:production-visual` passed all 16 required suites across
  desktop/compact/wide: 79 snapshots, 48 perceptual baselines, 8,691,564 image
  bytes, zero console errors, and no missing contracts. Evidence:
  `artifacts/ui-smoke/ui-suite-2026-07-24T04-36-19-403Z/production-visual-gate/production-visual-gate.json`.
- `npm run test:file-boundary` remains blocked by the pre-existing unrelated
  `src/main/services/entities-database-service.ts:2` direct `node:fs` import.
  This feature does not touch that service; its focused service, public API,
  renderer plugin, hierarchy UI, coverage, latency, build, and production
  visual gates all passed.
- After promotion, `npm run test:task-docs` passed 3/3 and validated 706 task
  files, 832 references, and all 694 queue items. The promoted renderer
  coverage baseline passed with zero regression across all four metrics, and
  the scoped `git diff --check` passed.
