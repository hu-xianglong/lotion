# Notion HTML Keyboard Shortcut Paste Real Editor Regression

Status: done

Backlog item: Notion-like local text editing and HTML paste parity.

## Why

Documentation and Notion-exported content often represent keyboard shortcuts
with inline `<kbd>` elements. Lotion's rich HTML clipboard conversion fell
through to plain text, losing the keyboard-key formatting in Markdown.

## Scope

- Convert pasted HTML `<kbd>` elements into Markdown inline code.
- Preserve surrounding text and multiple shortcut keys from the same paste.
- Add shared multi-resolution real editor smoke coverage for paste,
  persistence, rendered inline-code preview, continued typing, focus, and no
  horizontal overflow.
- Renderer/component behavior is covered indirectly by the editor smoke and the
  existing Markdown live preview path; no backend/service changes are needed.

## Result

- HTML clipboard conversion now maps `<kbd>` to Markdown inline code via the
  existing inline-code helper.
- The shared editor regression smoke pastes `Press <kbd>Cmd</kbd> +
  <kbd>K</kbd>`, verifies saved Markdown uses `` `Cmd` + `K` ``, checks visible
  `.cm-md-inline-code` spans for both keys, continues typing, and runs across
  desktop and compact viewports.

## Gates

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-15T04-17-16-093Z`
- [x] `git diff --check`
