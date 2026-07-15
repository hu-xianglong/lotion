# Notion HTML paste real editor regression

## Problem

Pasting rich Notion/browser content into the local editor should not flatten or
lose common structure. The editor currently has plain text, long URL, Markdown
table, and dropped attachment coverage, but no `text/html` clipboard path for
Notion-like content.

## Scope

- Add a small renderer-side HTML clipboard converter for common rich text:
  headings, paragraphs, lists, bold, italic, strikethrough, links, code, and
  line breaks.
- Prefer existing `text/plain` behavior when no HTML payload exists.
- Add multi-resolution real-editor smoke coverage for dispatching a
  Notion-style `text/html` paste and verifying Markdown persistence, rendered
  preview behavior, continued editing, keyboard focus, and no overflow.

## Tests

- `node --check scripts/smoke-editor-regression-ui.mjs` - passed
- `npm run test:renderer-components` - passed
- `npm run typecheck` - passed
- `npm run smoke:editor-regression-ui` - passed
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T18-10-11-814Z`
- `git diff --check` - passed

## Result

- Added a renderer-side `text/html` clipboard path that converts common
  Notion/browser rich paste structure into Markdown before inserting it into
  CodeMirror.
- Covered heading, paragraph, bold, italic, strikethrough, list, and link paste
  conversion in the real editor smoke across desktop and compact viewports.
- Verified continued typing, autosave persistence, focus retention, rendered
  preview, and no document horizontal overflow after rich HTML paste.
- Backend/service tests are not applicable because the behavior is entirely
  renderer clipboard handling and uses existing page save APIs.
