# Design System Status-Pill Visibility and Wide Baseline

Status: done

Verification status: verified

## Goal

Debug and correct the Design System quality-gate status row, then promote a
visually complete wide screenshot to a committed production baseline.

## Acceptance Criteria

- Scope status-pill assertions to the quality-gate row rather than unrelated
  pills elsewhere in the lab.
- Render and geometrically prove all required quality-gate pills are visible
  inside the Design System surface.
- Refresh affected desktop/compact committed images and policies only after
  repeatability and manual visual review.
- Commit a repeatable wide baseline with exact dimensions, SHA-256, and strict
  zero-pixel thresholds.
- Add negative coverage for missing/clipped pill geometry and deliberate wide
  image mutation.
- Preserve all three baseline records through production and release evidence,
  then document exact verification results before moving to done/verified.

## Delivered

- Restored the missing `Local` quality-gate pill and made the desktop/wide hero
  reserve enough width for all four pills on one row. Compact intentionally
  stacks the four full-width pills.
- Scoped smoke assertions to `.design-system-status-row` and recorded each
  required pill's label, dimensions, position, and containment inside the lab.
  The artifact contract rejects missing, clipped, or invalid responsive pill
  layouts.
- Refreshed the affected desktop and compact reviewed images and added the
  reviewed wide PNG. All three checksum-backed policies use strict zero-pixel
  thresholds and are required by Design System, production, and release
  contracts.
- Added negative coverage for absent desktop/compact/wide evidence, clipped
  `Local` geometry, and deliberate mutations of the committed compact and wide
  images.
- Made compact snapshot style restoration run in a `finally` block so a failed
  capture cannot leave runner-only overflow overrides installed.

## Debugging

- The earlier smoke appeared to prove `Local`, but its global
  `.lotion-ui-status-pill` selector was matching an unrelated provider pill in
  the Advanced Search card. The actual quality-gate row rendered only
  `Readable`, `Dense`, and `Tokenized`. Scoping the query exposed the false
  positive immediately.
- Adding `Local` initially wrapped it below the other pills at desktop and wide
  widths. A max-content hero column keeps all four on one line above 1100px;
  the existing narrow breakpoint resets the hero and status row to a
  single-column compact layout.
- The new pill changed all three screenshots. Before accepting them, repeated
  captures proved each viewport byte-stable and the old policies correctly
  rejected the desktop pixel change and compact dimension change.

## Verification

Verified on 2026-07-22.

- Wide pre-acceptance runs
  `artifacts/ui-smoke/design-system-ui-2026-07-23T03-12-58-421Z/` and
  `artifacts/ui-smoke/design-system-ui-2026-07-23T03-13-24-192Z/` produced
  byte-identical 101,406-byte 912x908 PNGs with SHA-256
  `482acb816486c2676054954d7a65c2d06c94ff82bc29b015ab77eb29676021f9`.
- Repeated desktop captures produced byte-identical 101,385-byte 912x908 PNGs
  with SHA-256
  `c5abf8fbf33e406b22560bda17375bf2520a298426df879d9e4958d8fbe33022`;
  repeated compact captures produced byte-identical 116,075-byte 744x1991 PNGs
  with SHA-256
  `cc5d23dc8278379b03d9641a9506c27b667d14ad0040ded5b18fdd38c4ddca38`.
- Manual review confirmed all four pills are visible on one row in desktop and
  wide, stacked without clipping in compact, and that hero, six tokens,
  controls, patterns, and source card remain complete in every image.
- Focused production gate:
  `artifacts/ui-smoke/ui-suite-2026-07-23T03-19-50-325Z/production-visual-gate/production-visual-gate.json`.
  It passed with three screenshots (318,866 bytes), three committed perceptual
  baselines, zero differing pixels, and a passing renderer coverage trend.
- Visual-diff/baseline, Design System artifact, production aggregation, and
  release collection tests passed, including missing/clipped/mutated negative
  cases.
- Full UI harness artifact tests, release tests, `npm run typecheck`,
  `npm run test:task-docs`, and `git diff --check` passed.

## Remaining Umbrella Work

The production visual umbrella still needs reviewed baselines for additional
critical surfaces, a decision on aggregating the two verified real-workspace
runners into its nightly production command, and deliberate renderer coverage
improvements above the protected historical floor.
