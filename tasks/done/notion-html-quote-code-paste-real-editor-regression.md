# Notion HTML quote and code paste real editor regression

## Problem

The HTML clipboard converter now has real-editor coverage for rich inline text,
lists, links, and tables. It still lacks real-editor coverage for blockquote and
pre/code content, which are common when copying technical notes from Notion or a
browser into Lotion.

## Scope

- Extend the multi-resolution real editor smoke with a `text/html` paste case
  for `<blockquote>` and `<pre><code>`.
- Verify the pasted content persists as Markdown quote and fenced code source,
  renders as the expected live-preview surfaces, allows continued typing, keeps
  focus, and does not cause horizontal overflow.
- Keep the implementation scoped to the renderer/editor smoke unless the test
  exposes a conversion defect.

## Tests

- `node --check scripts/smoke-editor-regression-ui.mjs` - passed
- `npm run test:renderer-components` - passed
- `npm run typecheck` - passed
- `npm run smoke:editor-regression-ui` - passed
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-14T18-39-47-607Z`
- `git diff --check` - passed

## Result

- Added a multi-resolution real-editor smoke case for pasting Notion/browser
  `text/html` blockquote and pre/code content.
- Verified pasted quote content persists as Markdown blockquote source and
  renders with the blockquote live-preview styling.
- Verified pasted pre/code content persists as fenced Markdown code source,
  renders with code-line/fence styling, supports continued typing, keeps focus,
  and avoids document horizontal overflow.
- Backend/service tests are not applicable because this item only extends
  renderer UI smoke coverage for existing editor conversion behavior.
