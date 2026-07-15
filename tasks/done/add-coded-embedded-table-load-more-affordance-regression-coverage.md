# Add Coded Embedded Table Load-More Affordance Regression Coverage

Status: done

## Goal

Cover the embedded table `Load more` affordance introduced by item 253 with a
coded UI regression so it does not silently lose its button semantics, clearer
labeling, plus marker, secondary row count, or stable geometry.

## What Changed

- Extended `scripts/smoke-embedded-view-ui.mjs` pagination coverage to assert
  the embedded table load-more control is visible and exposed as a real button.
- Asserted the control includes the `+` marker, stronger `Load 50 more` label,
  secondary row-count text, non-overlapping geometry, focusability, and
  button-like computed affordance.
- Preserved the existing row-count behavior assertion after clicking load more.

## Verification

- `npm run typecheck`
- `npm run smoke:embedded-view-ui`
- `git diff --check`

## Notes

- Backend/service tests are not applicable for this item because the change only
  adds UI smoke assertions around existing pagination behavior and CSS/DOM
  affordance; no pagination, query, persistence, or service logic changed.
