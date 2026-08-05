# Renderer Source Coverage Gate

Status: done

Verification status: verified

## Goal

Create a separate, machine-readable frontend coverage gate that measures real
`src/renderer/**` sources, includes unexecuted files, blocks regression below
recorded floors, and is linked from production visual and release artifacts.

## Delivered

- Added a c8/V8 coverage runner around the existing renderer component
  regression bundle with inline source maps.
- Coverage includes all renderer source files, including files with no executed
  lines, and excludes dependencies after source-map remapping.
- Added JSON, Markdown, and raw summary artifacts under
  `artifacts/coverage/renderer/`.
- Added category summaries for shared UI/context, databases, page/editor,
  search, plugin host, renderer state/libraries, and remaining app shell code.
- Enforced honest no-regression floors: 30% lines/statements, 20% functions,
  and 55% branches. Environment overrides support deliberate diagnostics.
- `test:production-visual` requires the coverage gate before Electron and links
  its summary. Release artifact collection preserves the renderer coverage
  path, status, thresholds, totals, and source-file counts.

## Debugging

- The first c8 run reported a misleading 100% because it measured only
  `scripts/test-renderer-components.mjs`; it contained zero renderer files and
  was rejected as invalid evidence.
- Preserving the generated bundle until reporting allowed source-map remapping,
  but `allowExternal` initially pulled 2,000+ dependency sources into the
  denominator. Applying post-remap inclusion to `**/src/renderer/**` produced
  the intended complete 130-file renderer set.
- The gate explicitly rejects bundle-only reports so this false-green path
  cannot recur.

## Verification

Verified on 2026-07-22.

Results:

- `npm run test:renderer-coverage` passed. It measured 130 renderer files, 63
  with executed lines: 15,276/48,582 lines and statements (31.44%), 273/1,186
  functions (23.02%), and 1,147/1,879 branches (61.04%).
- Coverage contract tests passed 3/3: real-source/category aggregation,
  bundle-only rejection, and complete threshold-failure diagnostics.
- Focused production visual verification passed after running visual-diff and
  renderer-coverage gates, then the real Design System Electron smoke. The
  desktop screenshot was 100,176 bytes with zero renderer console errors; the
  linked production gate is
  `artifacts/ui-smoke/ui-suite-2026-07-23T01-30-53-762Z/production-visual-gate/production-visual-gate.json`.
- Focused release artifact coverage proved the production gate exposes the
  renderer coverage artifact and metrics.
- `npm run typecheck`, full UI artifact tests, `npm run test:task-docs`, local
  lockfile dry-run, and `git diff --check` passed.

## Remaining Umbrella Work

This establishes a no-regression baseline, not an 80% coverage claim. The
production visual umbrella still needs intentional committed image baselines
and real-workspace passes. Historical coverage trend comparison was completed
by queue item 644.

## Evidence Correction

Queue item 666 found that this task's reported 130-file denominator contained
63 duplicated macOS `/Users` and `/private/Users` source identities. The
underlying executed counters were valid, but the denominator and percentages
were not. The canonical verified result is 67 distinct renderer sources, 63
covered, and 62.78% line/statement coverage; see
`tasks/done/renderer-coverage-source-identity-integrity.md`.
