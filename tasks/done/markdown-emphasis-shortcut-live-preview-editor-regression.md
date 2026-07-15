# Markdown emphasis shortcut live-preview editor regression

Status: done

## Why

The preview harness already covers bold, italic, double-tilde strikethrough,
and imported single-tilde strikethrough. The real editor smoke should also
exercise the writing path so typing Markdown emphasis shortcuts keeps a
Notion-like live-preview feel while preserving the exact Markdown source.

## Scope

- Extend the shared editor regression smoke across desktop and compact
  viewports.
- Type bold, italic, double-tilde strikethrough, and an imported single-tilde
  strikethrough line with nested bold.
- Assert decorations appear in the real editor, raw emphasis markers do not
  leak in inactive preview lines, content persists to Markdown, and no
  horizontal overflow is introduced.

## Acceptance

- `npm run smoke:editor-regression-ui`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

Backend tests are not applicable unless the implementation touches persistence,
parser, or service behavior; this item is expected to add UI regression coverage
for existing editor decoration behavior.

## Verification

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run smoke:editor-regression-ui`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

The editor smoke now types the emphasis shortcut lines in both desktop and
compact viewports, verifies live-preview decorations for bold, italic,
double-tilde strikethrough, imported single-tilde strikethrough with nested
bold, confirms the raw Markdown source persists, and checks for horizontal
overflow.

Backend/service tests are not applicable because this item only adds UI
regression assertions for existing editor decoration and autosave behavior; no
parser, persistence, or service code changed.
