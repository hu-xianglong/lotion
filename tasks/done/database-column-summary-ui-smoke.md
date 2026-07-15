# Database column summary UI smoke

Status: done

## Goal

Cover Notion-like column summary settings with a deterministic UI smoke.

## Scope

- Select a numeric column summary from the table footer.
- Verify the chosen summary is persisted into the active view.
- Reload and verify the UI still displays the selected summary.
- Ensure duplicate-view smoke also checks copied column summaries.

## Gates

- `npm run smoke:database-template-ui`
- `git diff --check`
