# Renderer Coverage Historical Trend Gate

Status: done

Verification status: verified

## Goal

Compare every renderer coverage run with a committed, previously verified
baseline so a change cannot remain above loose absolute floors while silently
reducing line, statement, function, or branch coverage.

## Delivered

- Added `test/baselines/renderer-coverage.json` with the verified source task,
  verification date, file counts, and four exact renderer coverage metrics.
- Added a separate trend result to the renderer gate with current/baseline
  values, percentage-point deltas, source-file deltas, and actionable failures.
- Kept absolute threshold failures independent from trend failures. A result
  must pass both policies.
- Required complete baseline evidence and rejected wrong kinds, missing
  verification provenance, missing metrics, and invalid file counts.
- Required a passing trend in the production visual gate and preserved the
  complete trend object through release artifact collection.
- Documented that baseline changes require a new verified task and cannot be
  used to normalize an unexplained regression.

## Debugging

- Runtime coverage output under ignored `artifacts/` is overwritten on every
  run and is unavailable in a clean checkout, so it cannot serve as historical
  evidence. The verified baseline is committed separately.
- Existing absolute floors would allow lines to fall from 31.44% to 30% while
  still passing. A negative test now proves a 0.01-point historical regression
  fails even when every absolute floor passes.
- The first malformed-baseline test accidentally replaced all default fixture
  metrics while trying to invalidate only branches. Correcting the fixture to
  merge overrides made the test exercise the intended branch diagnostic.

## Verification

Verified on 2026-07-22.

Results:

- Renderer trend contract tests passed 6/6, covering all-source aggregation,
  bundle-only rejection, absolute thresholds, equal/improved trend values,
  a regression above absolute floors, and malformed/unverified baselines.
- `npm run test:renderer-coverage` passed against 130 source files and 63 files
  with executed lines. Lines/statements were 31.44%, functions 23.02%, and
  branches 61.04%; all four deltas against the verified baseline were 0.
- Focused production visual verification passed with the real Design System
  Electron smoke on desktop: one 100,176-byte screenshot, complete viewport
  coverage, and zero renderer console errors. The machine-readable gate is
  `artifacts/ui-smoke/ui-suite-2026-07-23T01-35-02-080Z/production-visual-gate/production-visual-gate.json`.
- Focused release collection passed and retained trend status, baseline path,
  provenance, file deltas, and all four metric deltas.
- `npm run typecheck`, all 77 UI artifact contract tests,
  `npm run test:task-docs`, and `git diff --check` passed.

## Remaining Umbrella Work

This prevents historical renderer coverage regression but does not raise the
current baseline. The production visual umbrella still needs reviewed image
baselines and safe visual passes over the two named real workspaces.

## Evidence Correction

Queue item 666 superseded the original 130-file/31.44% baseline after proving
that 63 macOS path aliases were double-counted. The historical policy remains,
but its verified baseline is now the canonical 67-file result: 62.78%
lines/statements, 24.67% functions, and 63.44% branches.
