# Markdown Table Paste Real Editor Regression

Status: done

## Problem

The editor regression suite covers plain-text paste, long URL paste, direct
Markdown table typing, and rendered table cell editing. It does not yet cover
the Notion-like workflow of pasting a Markdown table into the real editor and
continuing to type after it. That leaves a daily paste path vulnerable to
cursor, preview, autosave, and layout regressions.

## Scope

- Extend the shared multi-resolution editor smoke.
- Paste a Markdown table through the same clipboard/fallback path used by other
  paste coverage.
- Verify the pasted table persists, renders as the live table widget, exposes
  editable table-cell semantics, and allows continued typing after the table.
- Assert no horizontal overflow in desktop and compact viewports.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`

## Result

- Added desktop and compact real-editor coverage for pasting a Markdown table,
  rendering it as the live editable table widget, continuing text entry after
  the table, and persisting the Markdown source.
- Stabilized slash list smoke selection by waiting for the active command label
  before accepting the slash menu.
- UI smoke artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T16-59-05-794Z`.
- Backend tests are not applicable: this item only strengthens the real Electron
  editor regression smoke and does not change parser, data, or service behavior.
