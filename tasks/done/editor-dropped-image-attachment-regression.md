# Editor dropped image attachment regression

## Problem

The editor now has coverage for dragging a document attachment into a page, but
image attachments have a different Notion-like behavior: they should insert
Markdown image syntax, render as an inline image preview, hide source by default,
and expose the hover edit-source affordance without breaking continued editing.

## Scope

- Add a multi-resolution real-editor smoke path for dropping an image file.
- Use the deterministic dropped-file import test seam instead of touching real
  filesystem attachments.
- Verify inserted image Markdown, rendered preview, hidden source by default,
  hover-visible Edit source control, autosave persistence, continued typing, and
  no horizontal overflow.

## Tests

- Passed `node --check scripts/smoke-editor-regression-ui.mjs`.
- Passed `npm run test:renderer-components`.
- Passed `npm run typecheck`.
- Passed `npm run smoke:editor-regression-ui`.
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T17-42-01-450Z`.
  - Covers desktop and compact viewports.
  - Verifies dropped image import seam, inserted image Markdown, rendered image
    preview, hidden source by default, hover-visible Edit source control,
    continued typing, persistence, and no horizontal overflow.
- Passed `git diff --check`.

## Notes

- This item only adds UI smoke coverage and stabilizes an existing keyboard
  focus assertion in the same smoke. Backend/service tests are not applicable
  because the existing attachment import and page persistence APIs are reused
  through the test seam without changing data behavior.
