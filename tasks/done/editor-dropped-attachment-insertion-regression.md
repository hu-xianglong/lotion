# Editor Dropped Attachment Insertion Regression

Status: done

## Problem

The editor supports dropping files into the writing surface and inserts
Markdown links or images for the imported attachments. The existing regression
suite covers pre-existing attachment links and source attachment previews, but
does not cover the real editor drop insertion path. That leaves a common
Notion-like attachment workflow exposed to cursor, persistence, and layout
regressions.

## Scope

- Extend the shared multi-resolution editor smoke.
- Dispatch a deterministic file drop in the real editor and stub only the
  renderer attachment import boundary so the test does not depend on OS file
  path plumbing.
- Verify the inserted attachment Markdown is visible, persists, remains
  editor-focus safe, exposes normal link-edit behavior, and allows continued
  typing after the dropped attachment.
- Assert no horizontal overflow in desktop and compact viewports.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`

## Result

- Added desktop and compact real-editor coverage for dropping an attachment into
  the editor, inserting a Markdown attachment link, persisting it, continuing
  typing after the inserted link, and keeping plain-click edit versus
  modified-click open behavior.
- Added a narrow test seam so the Electron smoke can drive the editor drop
  insertion path deterministically without relying on OS file-path transfer.
- UI smoke artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T17-18-35-802Z`.
- Backend/service tests are not applicable to this item: the attachment import
  service is already covered by package/customer API tests, and this change only
  adds a renderer test seam plus real UI drop regression coverage.
