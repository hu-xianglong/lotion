# Design System Committed Perceptual Baseline

Status: done

Verification status: verified

## Goal

Promote the deterministic Design System desktop screenshot from structural
artifact evidence to the first intentional, committed production PNG baseline.

## Delivered

- Committed the reviewed 912x908 Design System desktop PNG plus a policy with
  viewport, dimensions, SHA-256, strict comparison thresholds, verification
  date, and source task.
- Added a reusable policy runner that validates repository confinement,
  policy shape, committed checksum, dimensions, and perceptual comparison.
- Wired the real Design System desktop smoke to compare its element screenshot
  with the committed image at zero allowed differing pixels.
- Required complete perceptual evidence from the Design System artifact and
  production visual contracts while leaving non-desktop custom diagnostics
  available until their own baselines are reviewed.
- Preserved policy, actual, expected, diff, and metadata paths through harness
  summarization, aggregate UI artifacts, production JSON/Markdown, and release
  artifact collection.
- Added checksum-drift, visible-mutation, missing-evidence, and production
  aggregate negative coverage.

## Debugging

- Two pre-acceptance Electron runs produced byte-identical screenshots with
  SHA-256 `17ae559685fc48997b59a44c021af8fc0b73ffb45a094644fcaf6929856ef9f6`
  and a strict 0/828,096 pixel diff, establishing repeatability before commit.
- The first real production run after integration failed even though the child
  Design System contract passed. The harness summary serializer retained only
  image paths/bytes and dropped the new perceptual object. Production correctly
  rejected the missing evidence. The serializer now preserves the complete
  baseline summary, with a focused regression test for that boundary.
- One artifact test initially used `desktop.png.expected.png` while asserting
  `desktop.expected.png`; aligning the fixture filename removed that test-only
  mismatch without changing production evidence.

## Verification

Verified on 2026-07-22.

Results:

- `npm run test:visual-diff` passed 8/8, including identical, bounded,
  antialias, visible mutation, dimension mismatch, checksum drift, and linked
  policy evidence paths.
- All 78 UI artifact tests passed, including required/missing Design System
  baseline cases, lossy harness serialization regression, required production
  desktop evidence, and custom non-desktop diagnostic behavior.
- Focused release collection passed and retained the baseline status plus
  normalized policy/actual/expected/diff/metadata paths.
- Two independent focused Design System desktop production runs passed after
  the serialization fix. Each produced a 100,176-byte 912x908 screenshot,
  zero console errors, checksum match, and 0/828,096 differing pixels. Gate
  artifacts:
  - `artifacts/ui-smoke/ui-suite-2026-07-23T01-43-22-908Z/production-visual-gate/production-visual-gate.json`
  - `artifacts/ui-smoke/ui-suite-2026-07-23T01-43-58-131Z/production-visual-gate/production-visual-gate.json`
- Latest expected/diff metadata evidence:
  - `test/baselines/production-visual/design-system-desktop.png`
  - `artifacts/ui-smoke/design-system-ui-2026-07-23T01-44-05-181Z/visual-diff/design-system-desktop-diff.json`
- `npm run typecheck`, `npm run test:task-docs`, and `git diff --check` passed.

## Remaining Umbrella Work

The production visual umbrella still needs reviewed baselines for additional
critical surfaces/viewports and safe visual passes over both named real
workspaces. This task intentionally verifies only the stable Design System
desktop surface and does not claim complete production visual coverage.
