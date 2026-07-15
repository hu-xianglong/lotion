# Slash Text Command Returns To Plain Paragraph

Status: done

Split from `tasks/todo/notion-core-parity-sequence.md` slash/live-preview
editing coverage.

## Why

The Text slash command is the escape hatch from the slash menu back into normal
paragraph writing. It should remove the slash query, keep the cursor in the
editor, and let the next typed text persist as a plain paragraph rather than a
heading, list, fence, or leftover command source.

## Changes

- Added slash command unit coverage for `/text` template behavior and Chinese
  alias lookup.
- Extended the multi-resolution editor regression smoke with a real `/text`
  insertion path.
- The smoke now verifies `/text` disappears, editor focus remains active, typed
  content persists as a standalone plain paragraph line, no heading/list/quote
  wrapper is introduced, and there is no horizontal overflow.

## Backend Tests

No backend/service tests were needed because this item only covered slash
template behavior and existing renderer editor behavior. The pure slash command
unit test covers the shared template logic.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:slash`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
