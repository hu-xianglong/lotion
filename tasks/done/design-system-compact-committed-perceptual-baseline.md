# Design System Compact Committed Perceptual Baseline

Status: done

Verification status: verified

## Goal

Promote the deterministic Design System compact screenshot from structural
artifact evidence to an intentional committed production PNG baseline, without
weakening the existing desktop baseline.

## Acceptance Criteria

- Prove the compact screenshot is repeatable before committing it.
- Commit a compact viewport policy with exact dimensions, SHA-256, and strict
  zero-pixel comparison thresholds.
- Require desktop and compact baseline evidence in the Design System and
  default production visual contracts while leaving custom/wide diagnostics
  optional until separately reviewed.
- Add missing-evidence and deliberate-image-mutation negative coverage.
- Preserve both baseline records through the production gate and release
  artifact summary.
- Record exact verification commands, artifacts, and results before moving the
  task to done/verified.

## Delivered

- Added the reviewed 744x1965 compact Design System PNG and a checksum-backed
  policy for viewport 1040x820 with strict zero-pixel thresholds.
- Required desktop and compact perceptual evidence in the Design System child
  contract and default production visual contract; custom/wide viewports remain
  optional until separately reviewed.
- Preserved both baseline records through the aggregate UI index, production
  JSON/Markdown, and release artifact summary.
- Added focused coverage for missing compact evidence and a deliberate compact
  PNG pixel mutation, alongside the existing checksum/dimension/diff tests.
- Made the compact element snapshot temporarily expose the full management
  surface for capture and restore runtime overflow styles afterward. This is a
  runner-only capture boundary; application layout remains unchanged.

## Debugging

- The first two compact screenshots were byte-repeatable but visually wrong:
  the runner captured the tall lab after scrolling to its lower sections, so
  the upper content became a large blank region. Resetting scroll alone merely
  moved the blank region to the bottom because the lab remained inside a
  viewport-height overflow container.
- The runner now resets the real scroll position, records actual geometry, and
  temporarily exposes the full management surface only while taking the
  element screenshot. The corrected image contains hero, all six tokens,
  controls, patterns, and source card. The original inline styles are restored
  immediately after capture.
- Re-running desktop after the capture fix preserved its committed checksum and
  produced a strict 0/828,096 pixel diff.

## Verification

Verified on 2026-07-22.

- Corrected compact pre-acceptance runs
  `artifacts/ui-smoke/design-system-ui-2026-07-23T02-22-07-594Z/` and
  `artifacts/ui-smoke/design-system-ui-2026-07-23T02-22-42-078Z/` produced
  byte-identical 115,197-byte 744x1965 PNGs with SHA-256
  `25d82b440c8f04e073ff371e801e402e6d4b50d42241254a76a0caf77a81a6b3`.
- Combined desktop/compact artifact:
  `artifacts/ui-smoke/design-system-ui-2026-07-23T03-08-12-337Z/harness-result.json`.
  Both baseline contracts passed with zero differing pixels and zero console
  errors.
- Focused production gate:
  `artifacts/ui-smoke/ui-suite-2026-07-23T03-08-35-574Z/production-visual-gate/production-visual-gate.json`.
  It recorded two screenshots, 215,373 screenshot bytes, and two committed
  perceptual baselines.
- Visual-diff tests passed 9/9, including the deliberate committed compact
  mutation and checksum/dimension/diff negatives.
- Design System/missing-baseline/production artifact tests and release
  collection tests passed.
- Full UI harness artifact tests, release tests, `npm run typecheck`,
  `npm run test:task-docs`, and `git diff --check` passed.

## Remaining Umbrella Work

The production visual umbrella still needs reviewed baselines for additional
critical surfaces and the wide viewport, plus a decision on aggregating the
two verified real-workspace runners into its nightly production command.
