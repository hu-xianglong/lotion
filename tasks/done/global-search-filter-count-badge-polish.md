# Global Search Filter Count Badge Polish

Status: done

## Why

Global search filter labels and counts are separate DOM nodes, but the count
rendered like bare text. A compact badge makes the command/type filters easier
to scan and aligns with the rest of the app's count affordances.

## What Changed

- Styled `.global-search-filter-count` as a small numeric badge.
- Kept active-state contrast legible.
- Extended smoke output to capture the command filter count element separately.

## Gates

- `npm run smoke:plugin-manager-ui`
- `npm run typecheck`
- `git diff --check`
