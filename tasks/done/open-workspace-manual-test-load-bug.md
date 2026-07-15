# Bug: Open Workspace should explain wrong workspace/folder selection

Status: done

## Priority

High

## Context

The Open Workspace flow can leave the user confused when the wrong space or
wrong folder level is selected while trying to open the manual test workspace:

`$HOME/Documents/Lotion Manual Test/workspace`

This workspace exists and contains a valid-looking Lotion workspace structure,
including `lotion.json`, `databases`, `attachments`, `.lotion`, and
`.lotion-cache`.

The observed issue was caused by opening the wrong workspace/folder. The product
still needs to handle this case clearly instead of making it look like the app
failed or loaded the wrong data silently.

## Expected behavior

Choosing the manual test workspace through Open Workspace should load it as the
active workspace. If the user selects the wrong folder or a parent/sibling
folder, Lotion should show a clear, actionable prompt explaining what was
selected and what folder should be chosen.

## Investigation notes

Check and improve handling for:

- Workspace picker expecting the parent folder rather than the `workspace`
  folder.
- Selecting a sibling workspace such as `Notion Import` or `Lotion Demo Space`
  when the user intended `Lotion Manual Test/workspace`.
- Missing `lotion.json` or selecting the parent `Lotion Manual Test` folder.
- App config continuing to point to the previously opened workspace.

## Acceptance criteria

- Reproduce the confusing path-selection flow with the manual test workspace.
- Show the selected path in the confirmation/error UI.
- If `lotion.json` is missing at the selected path but a likely workspace child
  exists, suggest the exact child path to open.
- If another valid workspace is selected, make the active workspace name/path
  visible before switching so the user can cancel.
- Keep valid workspace loading working for paths containing spaces.
- Add focused regression coverage for wrong-folder and path-with-spaces cases.
- Run focused workspace-open smoke plus typecheck before moving to done.

## Result

- `WorkspaceService.open(path)` now validates the selected path before committing
  it as the active workspace. If opening fails, the previously active workspace
  path and manifest remain active.
- Wrong-folder errors now include the selected folder, expected `lotion.json`
  path, and a likely child workspace suggestion such as
  `Lotion Manual Test/workspace` when present.
- The sidebar workspace selector now shows a visible, dismissible error alert
  instead of silently logging failures.
- Recent workspace clicks now show a Notion-like confirmation panel with the
  workspace name and full path before switching, so users can cancel.
- Fixed invalid nested `<button>` markup in recent workspace rows; the forget
  action is now a sibling control with the same visual affordance.
- Added `smoke:workspace-open-ui` for desktop and compact regression coverage.

## Verification

- Passed: `node --check scripts/smoke-workspace-open-ui.mjs`
- Passed: `npm run typecheck`
- Passed: `npm exec -- tsc -p tsconfig.main.json`
- Passed: `node --test --test-name-pattern "workspace open explains" test/package-core.test.mjs`
- Passed: `npm run smoke:workspace-open-ui`
  - Artifact: `artifacts/ui-smoke/workspace-open-ui-2026-06-17T20-18-17-586Z`
- Passed: `node scripts/test-renderer-components.mjs`
- Passed: `git diff --check`
