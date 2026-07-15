# Markdown Heading Shortcut Live-Preview Editor Regression

Status: done

## Source

- Split from `tasks/todo/ui-regression-lab-and-renderer-coverage.md`.
- Addresses the editor-quality directive to cover real Notion-like writing
  flows beyond slash commands.

## Problem

The editor regression smoke covers slash headings heavily, but it does not
assert the normal Markdown shortcut path where a user types `## ` directly and
continues writing. That path should keep the line editable, render as a
live-preview heading, persist the Markdown source, and avoid layout overflow
across desktop and compact viewports.

## Acceptance

- Add coded multi-resolution editor smoke coverage for typing a `## ` heading
  shortcut directly into the CodeMirror editor.
- Assert the line remains editable with the expected Markdown source.
- Assert the live-preview heading line decoration is present.
- Assert autosave persistence and no horizontal overflow.

## Verification

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run smoke:editor-regression-ui`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

The focused Electron editor smoke covers both desktop and compact viewports.
