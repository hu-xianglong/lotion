# Notion HTML figure caption paste real editor regression

Status: done

## Why

Pasted Notion/browser HTML often wraps images in `<figure>` with a
`<figcaption>`. The local editor should preserve that content as a readable
image block followed by caption text instead of merging the caption into the
image Markdown source.

This continues the focused Notion HTML paste regression sequence from the
editor parity backlog.

## Acceptance

- Pasting a real HTML `<figure><img><figcaption>` into the CodeMirror editor
  stores workspace-relative image Markdown followed by separate caption text.
- The rendered editor hides image Markdown source by default, shows the image
  widget, and renders the caption as normal text below the image.
- The editor keeps focus, accepts continued typing after the pasted figure, and
  persists/reloads the expected Markdown.
- The smoke runs across desktop and compact viewports and asserts no horizontal
  overflow or control overlap.
- Lower-level/backend tests are not required. This task only touches renderer
  clipboard conversion and UI smoke coverage; no backend/service behavior
  changed.

## Result

- HTML clipboard conversion now treats `figure` and `figcaption` as block-level
  content and converts direct `<img>` block nodes into Markdown images.
- The editor regression smoke now pastes a real figure with direct image and
  caption, verifies separate Markdown blocks, rendered image preview, rendered
  caption text, continued typing, focus, persistence, and no horizontal
  overflow in desktop and compact viewports.

## Gates

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T19-29-21-320Z`
- [x] `git diff --check`
