# LLM Ask Command Active-Page Prompt

## Goal

Make the built-in `Ask LLM` command page-aware without sending the entire page
body by default.

## Completed

- Added compact current-page system context when `Ask LLM` runs.
- Included page id, title, and breadcrumb path.
- Instructed the model to call `lotion_get_active_page` when it needs full body
  content.
- Kept direct provider calls free of implicit page context.
- Covered the command with mocked provider tests.

## Verification

- `npm run typecheck`
- `npm run build`
- `node --test test/package-core.test.mjs`
- `git diff --check`
