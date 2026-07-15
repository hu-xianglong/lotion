# Editor Line-Merge Backspace Regression

Status: done

## Scope

Strengthen the shared-harness editor regression smoke for a Notion-like core
editing behavior: pressing Backspace at the beginning of a line should merge it
with the previous line, persist the merged markdown, and keep the editor layout
stable across desktop and compact viewports.

## Acceptance

- Extend `scripts/smoke-editor-regression-ui.mjs` with a direct line-merge
  Backspace assertion on a normal page.
- Verify the merged line appears in the editor after Backspace.
- Verify the separate second line no longer remains in the persisted markdown.
- Keep the existing desktop and compact viewport coverage through the shared
  harness.
- No backend/service tests are required unless product persistence behavior is
  changed.

## Gates

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run typecheck`
- `npm run smoke:editor-regression-ui`
- `git diff --check`

## Result

- Extended the editor regression UI smoke with a line-start Backspace merge
  case on a normal page.
- The smoke now verifies the two lines exist separately before Backspace, the
  merged line exists after Backspace, the old second line is gone from the
  editor, and persisted markdown no longer contains the original newline.
- Existing shared-harness desktop and compact viewport coverage is preserved.
- Backend tests are not applicable; this item only strengthens UI regression
  coverage and does not change editor persistence or model code.

Verified:

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run typecheck`
- `npm run smoke:editor-regression-ui`
