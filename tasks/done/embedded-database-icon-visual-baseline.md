# Task 718: Embedded database icon visual baseline

Status: done

Verification status: verified

## Problem

Task 716 intentionally added the database icon to embedded headers, but its
strict Electron smoke was not run before publication. Independent verification
found that the smoke read row titles through `textContent` even though titles
are rendered in input values, then compared the changed header against the old
iconless production baselines.

## Acceptance criteria

- Read visible embedded row titles from the title input value, retaining the
  text fallback for alternate renderers.
- Refresh compact, desktop, and wide baselines only after inspecting the new
  neutral database icon and confirming that the surface remains complete and
  in bounds.
- Run the strict embedded-view Electron smoke twice consecutively with no
  ignored regions or visual-diff allowance.
- Run renderer, visual-diff, type, build, and task-document gates.

## Verification

- Reproduced the pre-fix Electron failure: `firstRowText` and `lastRowText`
  contained only `Open` because DOM `textContent` omits input values. After
  reading `.title-cell-editor input.value`, the complete-surface assertion saw
  `Row 0` and `Row 7`.
- Inspected the generated compact, desktop, and wide screenshots before
  accepting them. Each contains the intended neutral database glyph beside
  `Embedded DB 1`; title/actions, tabs, table header/body, summaries, and
  pagination remain visible and in bounds with zero document overflow.
- `LOTION_UI_VIEWPORTS=desktop,compact,wide:1728x1100 npm run smoke:embedded-view-ui --workspaces=false`
  passed twice consecutively. All three strict comparisons reported
  `diffPixels: 0`, `diffRatio: 0`, `maxDiffPixels: 0`, no ignored regions, and
  the 500-row embedded-view interaction/performance contract passed (maximum
  first run 818.7 ms; second run 772.0 ms, under the 1,000 ms threshold).
- `npm run test:renderer-components --workspaces=false` passed.
- `npm run test:visual-diff --workspaces=false` passed 27/27 tests, including
  the committed embedded-view mutation rejection contract.
- `npm run typecheck --workspaces=false` passed both renderer and main-process
  TypeScript projects.
- `npm run build --workspaces=false` passed; Vite transformed 2,342 modules.
- `npm run test:task-docs --workspaces=false` passed after the task move and
  queue update.
- `git diff --check` passed.
