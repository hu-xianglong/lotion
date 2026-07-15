# Editor Page-Switch Focus Restoration

Status: done

## Scope

Make the local text editing loop closer to Notion by preserving editor focus
when a user leaves a page from the body editor and returns to it. The existing
editor smoke verifies content persistence across page switches; this slice adds
focus restoration and continued typing coverage.

## Acceptance

- Persist whether the CodeMirror body editor had focus in the page view state.
- Restore editor focus on remount/reopen when the previous view state was
  focused.
- Extend the editor regression UI smoke to switch away from a focused editor,
  return, assert the editor is focused, type additional text without an extra
  click, and verify persistence.
- Keep desktop and compact viewport coverage through the shared UI harness.

## Gates

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run typecheck`
- `npm run smoke:editor-regression-ui`
- `git diff --check`

## Result

- CodeMirror view state now records whether the body editor had focus and
  restores focus when remounting a previously focused editor.
- The editor regression smoke now verifies page-switch focus restoration by
  typing after returning to the page without an extra click, across desktop and
  compact viewports.
- While extending the smoke, the empty row prompt keyboard path exposed a
  separate focus issue: focusing the prompt and pressing Enter could follow a
  hover-selected template action. The prompt now resets to Empty on container
  focus and Enter on the prompt itself continues with an empty page.
