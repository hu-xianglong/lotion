# Slash Code Chinese Alias Real Editor Regression

Status: done

Split from `tasks/todo/ui-regression-lab-and-renderer-coverage.md` and
`tasks/todo/notion-core-parity-sequence.md` editor interaction coverage.

## Why

Code blocks are part of the local writing surface. English `/code` has real
editor coverage, but Chinese users should be able to type `/代码` and get the
same editable code fence, markdown persistence, continuation behavior, and
layout guarantees.

## Acceptance Criteria

- Slash command unit coverage asserts that the `/代码` alias resolves to Code
  block.
- Typing `/代码` in the real editor opens the slash menu and selects the Code
  block command.
- Committing the command removes the localized slash query, keeps editor focus,
  and lets the user type code immediately.
- The inserted text persists inside fenced code markdown, exits cleanly for
  subsequent plain text, and stays layout-safe across desktop and compact
  viewports.

## Backend Tests

No backend service changes are expected. This task adds shared slash command
lookup coverage plus real renderer/editor smoke coverage.

## Changes

- Added slash-command unit coverage that verifies the Chinese `代码` alias
  resolves to the Code block command.
- Parameterized the real editor code block smoke and added `/代码` coverage
  across desktop and compact viewports.
- Verified localized code command selection, slash query cleanup, fenced code
  markdown persistence, continuation typing after the code fence, and layout
  safety.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `node scripts/test-slash-commands.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
