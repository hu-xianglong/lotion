# Renderer Coverage Source Identity Integrity

Status: done

Verification status: verified

## Goal

Repair the renderer coverage gate so macOS `/Users/...` and
`/private/Users/...` source-map aliases cannot be counted as separate renderer
files, and prove the report represents the current source inventory exactly.

## Problem

The raw c8 summary contains 130 renderer entries but the worktree contains 67
TypeScript/TSX renderer files. Sixty-three executed files appear twice:

- an unexecuted `/Users/.../src/renderer/...` entry added by `c8 --all`;
- an executed `/private/Users/.../src/renderer/...` entry emitted through the
  generated bundle's source map.

The gate currently aggregates both entries, halving measured line/function
coverage and incorrectly claiming that 130 distinct renderer files exist.

## Acceptance Criteria

- Canonicalize renderer sources by their `src/renderer/...` repository path.
- Merge a zero-hit inventory alias with its executed source-map alias without
  double-counting totals.
- Reject ambiguous aliases that contain incompatible non-zero coverage.
- Compare canonical report paths with the actual renderer TypeScript/TSX
  inventory and fail on missing or unexpected sources.
- Persist raw-entry, canonical-file, alias, and inventory evidence.
- Add focused positive and negative contract tests.
- Run the renderer coverage, production/release contract, typecheck, build,
  task-documentation, and diff gates.
- Replace the invalid historical baseline with corrected verified metrics,
  document the superseded 130-file claim, and move this task to done/verified.

## Debugging

- The raw c8 JSON proved the 130 entries were not 130 files: the current
  worktree contains 67 renderer TypeScript/TSX files, and 63 executed files had
  both `/Users/...` zero-hit and `/private/Users/...` executed aliases.
- The first canonical merge required alias metric totals to match. Real c8
  evidence showed that its `--all` inventory entry and executed source-map
  entry can disagree on instrumented branch totals (for example, App reported
  1 versus 7). The merge now selects the single executed alias as authoritative
  and uses the inventory alias only when no executed alias exists.
- Multiple incompatible non-zero aliases are rejected because JSON-summary
  counters cannot safely reconstruct the union of two partial executions.
- c8's own text summary and `--check-coverage` still aggregated both aliases
  and printed 31.48%. Those duplicate, misleading checks were removed; the
  canonical repository gate now performs the only threshold and historical
  comparison after source identity and inventory validation.
- Relative canonical paths initially fell through the category classifier,
  which previously expected only absolute `/src/renderer/` paths. The
  classifier now handles both representations.

## Verification

Verified on 2026-07-23.

- `npm run test:renderer-coverage` passed with 130 raw entries canonicalized to
  the exact 67-file worktree inventory. Sixty-three aliases were removed,
  63/67 files have executed lines, and the inventory reports no missing or
  unexpected source.
- Corrected metrics are 15,323/24,409 lines and statements (62.78%),
  278/1,127 functions (24.67%), and 1,168/1,841 branches (63.44%). The committed
  baseline now records these values and this verified task as provenance.
- Renderer coverage contract tests passed 9/9, including macOS alias
  canonicalization, exact inventory, ambiguous non-zero aliases, inconsistent
  integrity evidence, bundle-only reports, absolute thresholds, historical
  regressions, and malformed baselines.
- Nightly, release, and coverage contract tests passed 21/21. Production and
  nightly artifacts now retain raw-entry, canonical-file, covered-file, alias,
  and exact-inventory evidence; release collection preserves it.
- `npm run test:production-visual` passed all 16 suites with 79 screenshots,
  48 strict zero-diff perceptual baselines, zero missing required coverage, and
  the corrected renderer evidence. The production artifact is
  `artifacts/ui-smoke/ui-suite-2026-07-23T21-17-38-246Z/production-visual-gate/production-visual-gate.json`.
- `npm run typecheck`, `npm run build`, `npm run test:task-docs`, and
  `git diff --check` passed. Vite emitted only its existing large-chunk
  advisory.

## Baseline Successor

Queue item 667 added real behavioral coverage for browser plugin settings and
superseded this task's baseline. The current verified result is 64/67 covered
files, 62.98% lines/statements, 25.22% functions, and 63.84% branches.
