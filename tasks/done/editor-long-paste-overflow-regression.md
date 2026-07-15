# Editor Long Paste Overflow Regression

Status: done

## Why

The editor already had broad smoke coverage for typing, selection replacement,
paste, slash commands, autosave, reload, page switching, empty-row first typing,
and large-document scroll stability. This item pins down a common Notion-like
editing regression: pasting a long URL or unbroken text must not force the page
into horizontal overflow, and the exact value must persist after autosave.

## Changes

- Extended `scripts/smoke-editor-regression-ui.mjs` with a long URL paste path
  inside a real page editor.
- The test now asserts:
  - the long URL appears in the editor after paste,
  - the editor/page layout still has no horizontal overflow,
  - the exact long URL is persisted to the page markdown after autosave,
  - the behavior passes in both desktop and compact shared-harness viewports.

## Tests

- Passed: `node --check scripts/smoke-editor-regression-ui.mjs`
- Passed: `npm run typecheck`
- Passed: `npm run smoke:editor-regression-ui`
- Passed: `git diff --check`

Backend/service tests are not applicable for this item because it only adds
multi-resolution UI regression coverage around existing editor paste/autosave
behavior.
