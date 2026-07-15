# Database View Delete UI And API

Status: done

Implemented:
- Added `DeleteViewInput` and `views.delete(input)` to the public preload/customer API.
- Added `DatabaseService.deleteView()` with safeguards:
  - refuses to delete the final remaining view
  - updates `schema.defaultViewId` when the deleted view was default
  - removes the deleted `views/<id>.json` file so reloads do not resurrect stale views
- Connected delete view through renderer database cache and plugin host workspace API.
- Added a delete action to `ViewSettingsDialog`, disabled for the final remaining view.
- Fixed `DatabaseTable` active view state so bundle updates do not reset a user-created/selected view back to the parent default view.
- Extended the database template UI smoke to create, rename, delete, and verify a database view.
- Added customer API coverage for view deletion and final-view deletion rejection.

Gates:
- `npm run typecheck`
- `npm run test:customer-api`
- `npm run smoke:database-template-ui`
- `npm run smoke:ui`
- `git diff --check`
