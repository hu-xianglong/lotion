# Page Small-Text Layout Setting

Status: done

Split from `tasks/todo/notion-core-parity-sequence.md` page title/settings
polish.

## Goal

Add a Notion-like page menu setting for small text. It works for normal pages
and row pages, persists in the unified page metadata model, and visibly reduces
editor/body text size without disturbing full-width behavior.

## Implementation

- Added `PageMeta.smallText` and persisted it through the system pages database.
- Added normal page and row page update paths for the small-text layout setting.
- Added IPC/preload/customer API/database cache wiring for row page small-text
  updates.
- Added a `Small text` switch to the page options menu beside `Full width`.
- Applied scoped editor typography when the page has the small-text layout
  setting enabled.
- Extended the editor regression UI smoke to toggle the setting on normal pages
  and empty row pages across desktop and compact viewports, verify font-size
  reduction, persistence after reload/reopen, focus continuity, and no layout
  overflow.
- Extended customer API coverage for normal page and row page metadata
  persistence.

## Verification

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run typecheck`
- `npm run test:customer-api`
- `npm run smoke:editor-regression-ui`
  - desktop: editor font `16px -> 14px`
  - compact: editor font `16px -> 14px`
  - normal pages and empty row pages persisted through reload/reopen
- `git diff --check`
