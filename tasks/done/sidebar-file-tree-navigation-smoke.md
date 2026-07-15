# Sidebar file-tree navigation smoke

## Goal

Cover the file-tree path for opening a database CSV and a row-page markdown file
from the sidebar.

## Scope

- Generate an isolated temporary workspace with one page and one database row
  that has a row-page body file.
- Open the temporary workspace in Electron.
- Expand the sidebar Files tree.
- Click the database `data.csv` entry and verify the database view opens.
- Click the row-page markdown file and verify the row page opens.
- Restore the previous workspace after the smoke.

## Gates

- `npm run smoke:sidebar-navigation-ui`
- `git diff --check`
