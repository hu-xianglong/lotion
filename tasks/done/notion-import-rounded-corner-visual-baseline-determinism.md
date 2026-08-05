# Task 714: Notion import rounded-corner visual baseline determinism

Status: done

Verification status: verified

## Problem

Task 713's strict compact Notion import baseline consistently reported seven
different pixels at the bottom-right rounded corner. The modal content and
dimensions matched; those pixels composite against the live workspace behind
the transparent corner and therefore are not owned by the captured modal
surface.

## Acceptance

- Production visual policies may declare a tightly bounded ignored region.
- Pixels inside that region do not consume the zero-pixel actionable budget.
- A changed pixel immediately outside the region still fails.
- The unskipped Notion import smoke passes twice consecutively.

## Verification

- `node --test test/visual-diff.test.mjs test/production-visual-baseline.test.mjs`
  passed 27/27. The new regression proves an in-region composited pixel is
  ignored while a pixel immediately outside the region still throws
  `VisualBaselineMismatchError`; all committed-baseline mutation tests pass.
- `npm run smoke:notion-import-ui --workspaces=false` passed twice
  consecutively with strict baselines enabled. Evidence roots:
  `artifacts/ui-smoke/notion-import-audit-2026-08-05T14-52-45-247Z` and
  `artifacts/ui-smoke/notion-import-audit-2026-08-05T14-53-09-820Z`.
- The compact policy retains `maxDiffPixels: 0` and `maxDiffRatio: 0`; only the
  explicit 10×15 bottom-right live-backdrop compositing region is normalized.
- `npm run typecheck --workspaces=false` passed.
- `npm run test:task-docs --workspaces=false` passed with 727 files, 852 task
  references, and 714 queue items before the final move.
- `git diff --check` passed.

This is test-infrastructure behavior only; it does not change application UI.
