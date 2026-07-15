# Page Secondary Panel Artifact Contract And Regression Lane

Status: done

Queue item: 601

Backlog source: `tasks/todo/ui-regression-lab-and-renderer-coverage.md`.

## Result

- Added a reusable Page Secondary artifact contract in
  `scripts/lib/page-secondary-artifacts.mjs`.
- Upgraded `scripts/smoke-page-secondary-ui.mjs` so the real Electron smoke
  emits desktop, compact, and laptop secondary-panel screenshots plus structured
  evidence for collapsed/expanded panel state, source links, backlinks, editor
  persistence, floating TOC navigation, and horizontal overflow checks.
- Added unit coverage for passing and failing Page Secondary artifact evidence
  in `test/ui-harness-artifacts.test.mjs`.
- Added Page Secondary to the filtered UI regression suite and documented the
  focused smoke command.

## Verification

- [x] `node --check scripts/lib/page-secondary-artifacts.mjs`
- [x] `node --check scripts/smoke-page-secondary-ui.mjs`
- [x] `node --test test/ui-harness-artifacts.test.mjs`
- [x] `npm run smoke:page-secondary-ui`
  - Focused artifact:
    `artifacts/ui-smoke/page-secondary-ui-2026-06-17T16-35-27-224Z/harness-result.json`
- [x] `LOTION_UI_SUITE_FILTER=page-secondary npm run smoke:ui`
  - Child artifact:
    `artifacts/ui-smoke/page-secondary-ui-2026-06-17T16-37-09-025Z/harness-result.json`
  - Suite artifact index:
    `artifacts/ui-smoke/ui-suite-2026-06-17T16-36-47-065Z/ui-suite-artifacts.json`
- [x] `npm run typecheck`
- [x] `git diff --check`

## Notes

- The first focused smoke run exposed a bad test assumption: the collapsed
  secondary panel is a horizontal 30px affordance in the current UI, not a tall
  vertical rail. The contract now requires visible/clickable geometry instead
  of a fixed orientation.
