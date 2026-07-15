# Notion HTML image paste real editor regression

Status: done

## Why

The editor now handles rich `text/html` clipboard content, and recent queue
items cover text formatting, tables, quotes, and code blocks. Images are another
high-risk Notion/browser paste case: pasted rich HTML with an `<img>` should
become a normal Markdown image, render as a preview, keep source hidden by
default, and remain editable afterward.

## Scope

- Extended the shared real editor regression smoke with a multi-resolution HTML
  image paste case using a `text/html` clipboard payload.
- Verified the pasted image persists as Markdown image source, renders as the
  existing image widget, does not leak source text by default, exposes the
  edit-source affordance, allows continued typing, and has no document overflow.
- Fixed the rich HTML clipboard converter so same-origin resource URLs are
  stored as workspace-relative Markdown paths instead of transient dev-server
  absolute URLs.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T19-02-53-026Z`
- [x] `git diff --check`
