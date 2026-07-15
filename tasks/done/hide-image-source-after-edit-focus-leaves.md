# Hide Image Source After Edit Focus Leaves

## Problem

Clicking `Edit source` on an image preview reveals the raw Markdown source, but
the source stays visible after the user moves the cursor to another line. That
breaks the live preview expectation: source should only remain visible while
the user is actively editing that source.

## Result

- Explicit source reveal now stays active only while the editor selection remains
  inside the revealed image/embed source range.
- The markdown preview UI smoke now covers image edit-source reveal followed by
  moving focus away from the source line, and asserts the image preview returns
  while the raw source is hidden.
- Follow-up product decision: image previews now hide raw Markdown source by
  default with no hover `Edit source` affordance. Hovering, clicking, and moving
  the cursor over a rendered image keep the image rendered and the source hidden.
- `/image` and `/图片` inserted image placeholders remain editable through their
  visible alt text placeholder, so users can name the image without exposing the
  underlying `![](attachments/)` source line.
- Backend/parser/service tests are not applicable: this is a renderer
  CodeMirror decoration-state behavior change only.

## Gates

- `npm run typecheck`
- `node --test --test-name-pattern "markdown preview artifact contract|editor regression artifact contract" test/ui-harness-artifacts.test.mjs`
- `node --check scripts/smoke-markdown-preview-ui.mjs`
- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run smoke:markdown-preview-ui`
- `npm run smoke:editor-regression-ui`
- `npm run build`
- `npm run release:test:prechecked`
- `git diff --check`
