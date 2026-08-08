# Scope Markdown Selection Visual Baseline

Status: done

Verification status: verified

## Goal

Keep the imported-highlight selection visual baseline focused on the selected
source line and its edit affordance across local and GitHub macOS runners.

## Problem

The selected-source screenshot captured the entire editor. On the taller
desktop viewport that included an unrelated table below the selection. CJK
glyph rasterization in that table differed between the local and GitHub runner
font stacks, producing 904 differing pixels even though the selection, source,
button, geometry, and behavior matched.

## Resolution

- Clip only the selected-source snapshot to 16 pixels below the selected line.
- Keep the title, preview context, selected source, and Edit source affordance
  in every viewport while excluding unrelated content below it.
- Restore the editor height, max-height, overflow, translation, and snapshot
  attributes after capture.
- Refresh all three baselines without weakening their zero-pixel policy.

## Verification

- Three-viewport Markdown preview UI test (desktop, compact, wide): passed.
- Selected-source perceptual comparison: `diffPixels: 0` for every viewport.
- Source editing, selection visibility, toggle, table, image, and widget
  assertions remained enabled and passed in the same run.
- GitHub Actions quality gate: pending publication verification.
