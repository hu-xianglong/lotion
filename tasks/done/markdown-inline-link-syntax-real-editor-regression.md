# Markdown inline link syntax real editor regression

Status: done

## Why

Imported and fixture links are covered, but direct writing still needs a guard:
typing `[label](url)` should produce the Notion-like visible link label without
leaking the Markdown target text, remain editor-first on normal click, open only
through the explicit modified-click gesture, and persist edits back to Markdown.

## Acceptance

- The editor regression smoke types a Markdown inline link directly.
- The live preview shows the label as a link and does not display the raw
  `](url)` source or encoded URL in normal preview.
- Plain click focuses source editing without opening the URL.
- Editing the visible link persists to Markdown.
- Cmd/Ctrl-click opens the URL through the captured shell-open path.
- Typing can continue below the link.
- The smoke runs across desktop and compact viewports and asserts no horizontal
  overflow.

## Verification

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run smoke:editor-regression-ui`
  - Covered desktop and compact viewports.
  - Verified direct Markdown inline link rendering, no raw target leakage in
    preview, editor-first plain click, persisted label edits, modified-click URL
    opening through the captured shell-open path, continued typing, and no
    horizontal overflow.
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

## Notes

This item only adds real Electron editor regression coverage for existing
Markdown link behavior. No backend, parser, or persistence service behavior was
changed, so lower-level service tests were not applicable.
