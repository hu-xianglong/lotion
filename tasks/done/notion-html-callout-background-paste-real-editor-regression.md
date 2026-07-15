# Notion HTML callout background paste real editor regression

Status: done

Backlog item: Notion-like local text editing and HTML paste parity.

## Why

The Notion import converter preserves exported callout figures as
`lotion-callout` fences with icon and background metadata, but the real editor
HTML clipboard converter still treats `<figure class="callout">` as a generic
figure. Direct paste from a Notion page should behave like import and render a
callout instead of flattening the content.

## Acceptance

- Pasting a Notion HTML callout `<figure>` stores a `lotion-callout` fenced
  block.
- The callout icon is preserved from the exported `.icon` span.
- A Notion `block-color-*_background` class on the callout figure is preserved
  as the callout `background` option.
- Inline highlighted content inside the callout body remains safe Markdown/HTML
  and renders in the callout body.
- The real CodeMirror live-preview surface renders the callout widget, hides the
  source fence after cursor leaves it, and applies the expected background class.
- Continued typing after the pasted callout remains responsive and persists.
- The regression is covered in the shared multi-resolution editor smoke.
- Backend/service tests are not applicable unless the implementation touches
  persistence or API behavior; this item should stay in renderer conversion and
  UI smoke coverage.

## Result

- Added direct Notion HTML callout figure paste conversion to the real
  CodeMirror clipboard path.
- Preserves callout icon, Notion background color, and highlighted body content
  as a `lotion-callout` fence.
- Added shared multi-resolution editor smoke coverage that verifies the
  rendered callout widget, hidden source fence, background class, continued
  typing, and persisted Markdown.
- Backend/service tests are not applicable because this only changes renderer
  HTML clipboard conversion and UI regression coverage.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  (`artifacts/ui-smoke/editor-regression-2026-06-15T06-35-01-290Z/result.json`)
- [x] `git diff --check`
