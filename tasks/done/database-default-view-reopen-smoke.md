# Database Default View Reopen Smoke

Status: done

Implemented:
- Extended the deterministic database template UI smoke to reload the renderer after setting a created view as default.
- Reopens the database from the persisted workspace state.
- Verifies the active tab is the saved default view before continuing with delete-view cleanup.

Gates:
- `npm run smoke:database-template-ui`
- `npm run smoke:ui`
- `git diff --check`
