# Database row-page navigation smoke

## Goal

Cover the main database-table path for opening a row page from a title cell.

## Scope

- Generate an isolated temporary workspace with one database and one row-page
  body file.
- Open the temporary workspace in Electron.
- Navigate to the database.
- Hover the title cell, click the row-page Open affordance, and verify the row
  page opens with the expected body.
- Restore the previous workspace after the smoke.

## Gates

- `npm run smoke:row-page-navigation-ui`
- `git diff --check`
