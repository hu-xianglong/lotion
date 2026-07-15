# Slash Link Command Inserts Openable Inline Link

Status: done

## Why

`/link` is the core inline slash command for adding references while writing.
The template already has unit coverage, but the real editor path should verify
that the command opens from the slash menu, accepts label text, renders as a
link after leaving the line, and still opens through the explicit modified-click
gesture.

## Acceptance

- Keep slash command unit coverage for inline link insertion.
- Add multi-resolution editor UI smoke coverage for inserting `/link` through
  the real slash menu.
- Verify the slash query is removed, the generated Markdown link persists, and
  the rendered link is visible after leaving the active line.
- Verify Cmd/Ctrl-click on the rendered link calls the shell-open path through
  the dry-run capture and the editor has no horizontal overflow.

## Verification

- Passed: `node --check scripts/smoke-editor-regression-ui.mjs`
- Passed: `npm run test:slash`
- Passed: `npm run typecheck`
- Passed: `npm run smoke:editor-regression-ui`
- Passed: `git diff --check`

Backend/service tests are not applicable because this item exercises existing
slash-command template behavior and frontend link interaction through the UI.
