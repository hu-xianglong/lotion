# Back and forward target tooltips

Status: done

## Why

The navigation backlog calls out browser-style back/forward tooltips. Lotion
already has the history stack, but the sidebar arrows only say `Back` and
`Forward`, so users cannot tell which page/database/row page they will open.

## Scope

- Derive readable labels for the previous and next history targets.
- Show those labels in the sidebar button titles and aria labels.
- Cover page/database/row-page history with the sidebar navigation smoke.

## Gates

- `npm run typecheck`
- `npm run smoke:sidebar-navigation-ui`
- `git diff --check`

## Result

- Sidebar history arrows now show the concrete previous/next target in `title` and `aria-label`.
- Page, database, manage, and row-page history entries get readable labels; row pages prefer `Database/Row title`.
- Sidebar navigation smoke verifies database and row-page tooltip targets.
