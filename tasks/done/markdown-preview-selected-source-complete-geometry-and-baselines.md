# Markdown Preview Selected Source Complete Geometry And Baselines

Status: done

Verification status: verified

## Goal

Turn the imported-highlight selected-source screenshot into a complete,
production-blocking selection/Edit source geometry contract, then promote the
reviewed state to desktop, compact, and wide perceptual baselines.

## Acceptance Criteria

- Prove the existing artifact contract accepts selected-source screenshots
  without control geometry, visibility, ownership, or perceptual comparison.
- Record and require editor, selected block, selected text range, revealed
  source line, raw source content, and Edit source button geometry.
- Require the selection/source/button to intersect the editor viewport, remain
  inside their owning surfaces, stay visible and opaque, and avoid horizontal
  document or editor overflow.
- Preserve the existing source-editability, transparent selection background,
  Markdown persistence, widgets, toggle, table, checkbox, and missing-database
  interaction coverage.
- Reject clipped/offscreen source controls, hidden or transparent captures,
  invalid selection/source state, missing controls, and missing committed
  baselines.
- Commit reviewed desktop, compact, and wide selected-imported-highlight
  baselines and require them through child, aggregate production, and release
  contracts.
- Add deliberate committed-image mutation coverage without lowering renderer
  coverage.
- Record debugging, manual review, commands, artifacts, and exact results
  before moving this task to done/verified.

## Debugging

- Before this task, `validateSnapshot` checked only non-empty image/metadata files,
  viewport, phase, and a few selected-highlight semantic booleans.
- The selected phase did not persist editor, selection, revealed source, or
  Edit source button geometry, containment, visibility, opacity, or overflow.
- Markdown Preview was a default production suite but was absent from
  `DEFAULT_PRODUCTION_PERCEPTUAL_BASELINES`.
- The first fresh compact run exposed a virtualized standalone-image preview
  that could exist outside the mounted DOM. A recovery path now scrolls until
  the image widget is mounted before reading it.
- Geometry evidence exposed a real 10px collision at every viewport: the text
  selection ended at x=920 while Edit source began at x=910. Blockquote source
  lines now reserve 100px on the right, and the live contract rejects both
  selection/button and highlight/button overlap.
- Reserving the control space wrapped the source across lines and exposed an
  unreliable bounding-box midpoint drag. The selection helper now uses the
  first and last client rects and normalizes the final DOM range to the exact
  expected text.
- Element screenshots could capture a transient scrollbar or lose the
  hover-only Edit source button. Selected-source capture now temporarily hides
  only the owning scroller's scrollbar and pins the button during capture,
  then restores both.
- A later diagnostic run exposed the same virtualization race for the missing
  database placeholder as a present but 0x0 widget. The smoke now waits for
  positive geometry and remounts it before applying the viewport assertion.
- Independent compact-only Chromium windows can round CodeMirror's native
  selection layer four pixels differently from the shared production
  desktop/compact/wide sequence even when DOM, selection anchors, computed
  typography, and source geometry are identical. Diagnostic font/snapshot
  changes were reverted. The authoritative production sequence repeated the
  same compact checksum and passes the committed zero-diff policy; no tolerance
  was loosened.

## Verification

- `scripts/smoke-markdown-preview-ui.mjs` now records positive geometry for the
  editor, scroller, selected line, imported highlight, DOM selection, and Edit
  source button; source/selection content, visibility/opacity, containment,
  viewport intersection, overlap, and horizontal overflow are also persisted.
- `scripts/lib/markdown-preview-artifacts.mjs` requires that state in child and
  aggregate manifests and rejects clipped/transparent/overlapping states or a
  missing committed baseline.
- Reviewed strict baselines are committed as
  `markdown-preview-selected-source-{desktop,compact,wide}.{png,json}` with
  SHA-256 checksums `7f77615e…`, `0fa83ac…`, and `ae741db…`. Every policy uses
  `maxDiffPixels: 0` and `maxDiffRatio: 0`.
- `test/production-visual-baseline.test.mjs` proves a deliberate committed
  compact-image mutation is rejected. Artifact tests cover the positive
  contract, clipped/transparent source rejection, and missing baseline
  rejection. Production/release registries require all three baseline records,
  increasing the default count from 33 to 36.
- Manual review confirmed the raw imported source remains readable, the
  selected text and highlight remain inside the editor, Edit source stays
  visible without covering the selection, and no horizontal overflow appears
  at 1440x1000, 1040x820, or 1728x1100.
- Focused strict production gate:
  `LOTION_PRODUCTION_VISUAL_FILTER=smoke-markdown-preview-ui.mjs LOTION_PRODUCTION_VISUAL_REQUIRED_SCRIPTS=scripts/smoke-markdown-preview-ui.mjs LOTION_UI_VIEWPORTS=desktop,compact,wide:1728x1100 node scripts/test-production-ui-visual-quality.mjs`
  passed with 12 screenshots, three required perceptual baselines, zero console
  errors, and `diffPixels: 0` for all three selected-source images. Evidence:
  `artifacts/ui-smoke/ui-suite-2026-07-23T16-01-17-110Z/production-visual-gate/production-visual-gate.json`.
- The same production run passed renderer coverage at 31.49% lines/statements,
  23.36% functions, and 61.34% branches, all above the verified historical
  baseline.
- `node --test test/production-visual-baseline.test.mjs test/ui-harness-artifacts.test.mjs test/test-release.test.mjs`
  passed 128/128.
