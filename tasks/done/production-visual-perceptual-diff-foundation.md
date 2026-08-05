# Production Visual Perceptual Diff Foundation

Status: done

Verification status: verified

## Goal

Add the missing shared image-comparison primitive needed for intentional
production screenshot baselines. It must tolerate bounded antialias noise,
fail on meaningful pixel or dimension drift, and leave machine-readable,
actionable artifacts.

## Delivered

- Added `assertPngVisualBaseline` using `pixelmatch` and `pngjs`.
- Supports configurable color threshold, antialias handling, maximum changed
  pixels, and maximum changed-pixel ratio.
- Writes a PNG diff and JSON metadata on pass and failure. Metadata records the
  actual, expected, diff, and metadata paths; dimensions; changed pixels and
  ratio; thresholds; and final status.
- Dimension mismatches fail with a full red diff artifact instead of throwing
  before diagnostics are written.
- Added `npm run test:visual-diff`; the production visual command runs this
  contract gate before Electron.
- Documented how stable UI smokes should combine snapshot geometry contracts
  with intentional committed PNG baselines.

## Debugging

- The first dependency install was automatically routed through the parent
  monorepo workspace, modifying an out-of-repository lockfile and pruning
  undeclared packages. It was immediately uninstalled and reinstalled with
  `--workspaces=false`, producing only the Lotion-local package and lockfile
  changes.
- Explicit tests distinguish color-threshold tolerance from an allowed changed
  pixel budget so visual drift cannot pass merely because one ceiling is set.
- The first focused production run exposed two stale custom-viewport
  assumptions: the outer UI suite artifact writer always required desktop plus
  compact, and the production contract always required at least two
  screenshots. Both now derive their minimums from the explicitly selected
  viewport set; the default release run remains desktop, compact, and wide.

## Verification

Verified on 2026-07-22.

Results:

- `npm run test:visual-diff` passed 5/5 cases: identical image, bounded pixel
  budget, antialias-like color delta, meaningful layout drift, and dimension
  drift.
- Failure cases verified that diff PNG and JSON metadata remain readable and
  retain actual/expected/diff paths and exact changed-pixel evidence.
- A focused production visual run verified that the new contract tests execute
  before the real Electron production gate and that the selected surface still
  produces a valid screenshot/artifact contract. Design System desktop passed
  with one 100,176-byte screenshot and zero console errors. Gate artifact:
  `artifacts/ui-smoke/ui-suite-2026-07-22T21-39-25-267Z/production-visual-gate/production-visual-gate.json`.
- Focused UI artifact tests cover both the single-viewport writer and
  single-viewport production contract, in addition to the default three-
  viewport requirements.
- `npm run typecheck`, `npm run test:task-docs`, and `git diff --check` passed.

## Remaining Umbrella Work

This foundation does not complete
`tasks/todo/production-ui-visual-quality-gate.md`. Queue item 645 subsequently
added the first reviewed baseline and actual comparison for Design System
desktop. Additional critical surfaces/viewports and real-workspace evidence
remain open there.
