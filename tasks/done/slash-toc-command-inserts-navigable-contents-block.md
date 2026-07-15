# Slash TOC Command Inserts Navigable Contents Block

Status: done

Split from `tasks/todo/notion-core-parity-sequence.md` slash/live-preview
editing coverage.

## Why

The slash menu exposes a Table of contents command, and the editor has
`lotion-toc` preview/floating TOC logic, but the slash insertion path was not
covered end to end. A regression here would either leave raw fenced source in
normal editing or create a TOC that does not navigate headings.

## Changes

- Added slash command unit coverage for `/toc` lookup by Chinese alias and the
  generated `lotion-toc` fenced block cursor placement.
- Extended the multi-resolution editor regression smoke with a real `/toc`
  insertion path.
- The UI smoke now verifies the generated markdown persists, the slash query is
  removed, the inline TOC renders heading entries, source markdown stays hidden
  after focus leaves the fence, a TOC entry returns focus/selection to the
  matching heading, continued typing persists, and there is no horizontal
  overflow.

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
