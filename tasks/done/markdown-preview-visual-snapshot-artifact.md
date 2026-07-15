# Markdown Preview Visual Snapshot Artifact

Status: done

## Why

The shared Markdown preview smoke already has strong DOM assertions for fragile
rendering cases, but it does not leave a durable visual artifact for reviewing
the exact editor surface users complain about: callouts, image/source hiding,
embedded iframe/toggle/equation blocks, missing database placeholders, long
links, task checkboxes, and rendered tables.

## Scope

- Extend the shared Markdown preview UI smoke to capture desktop and compact
  screenshots of representative live-preview surfaces.
- Store metadata beside each screenshot with the viewport, fixture page, and
  high-risk widgets present in the captured area.
- Keep the existing multi-resolution DOM assertions and no-horizontal-overflow
  checks.
- Do not change renderer/parser/data behavior in this item.

## Gates

- `node --check scripts/smoke-markdown-preview-ui.mjs`
- `npm run typecheck`
- `npm run smoke:markdown-preview-ui`
- `git diff --check`

## Result

- Extended the shared Markdown preview UI smoke to capture visible editor
  snapshots for the high-risk preview surface in both desktop and compact
  viewports.
- Captured an initial preview snapshot and a widget-area snapshot per viewport.
  The snapshots include metadata for the fixture page, viewport, and key
  rendered widgets such as emphasis, tables, callouts/images, iframes, toggles,
  equations, and missing-database diagnostics.
- Kept this as UI regression artifact coverage only. Renderer/parser/data
  behavior was not changed, so lower-level backend/service tests were not
  applicable.

## Verification

- `node --check scripts/smoke-markdown-preview-ui.mjs`
- `npm run typecheck`
- `npm run smoke:markdown-preview-ui`
