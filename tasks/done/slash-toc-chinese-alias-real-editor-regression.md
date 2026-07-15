# Slash TOC Chinese Alias Real Editor Regression

Status: done

Split from `tasks/todo/ui-regression-lab-and-renderer-coverage.md` and
`tasks/todo/notion-core-parity-sequence.md` editor interaction coverage.

## Why

The English `/toc` command has real editor coverage, and slash command unit
tests prove the Chinese `目录` alias maps to the TOC command. The actual
CodeMirror path should also prove that `/目录` opens and commits the same
Notion-like inline table of contents block in Chinese workflows.

## Acceptance Criteria

- Typing `/目录` in the real editor opens the slash menu and selects the Table
  of contents command.
- Committing the command removes the slash query, keeps editor focus, and
  persists the Lotion TOC markdown block.
- The inserted TOC renders as an inline contents panel with expected page
  headings and no visible source fence.
- The flow runs across desktop and compact viewports with no horizontal
  overflow.

## Backend Tests

No backend/service tests were needed because this item only adds UI coverage for
existing renderer alias behavior. Slash command alias lookup already has unit
coverage in `scripts/test-slash-commands.mjs`; renderer component coverage still
runs as a focused gate.

## Changes

- Extended the shared editor regression smoke with a real `/目录` slash command
  path.
- The smoke now verifies the Chinese alias selects Table of contents, commits
  with Enter, removes the slash query, preserves editor focus, increments the
  persisted TOC block count, renders the inline contents panel, navigates to a
  heading from the panel, and checks for horizontal overflow across desktop and
  compact viewports.
- Shared the TOC panel assertions between the existing `/toc` path and the new
  `/目录` path.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
