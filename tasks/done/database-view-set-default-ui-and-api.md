# Database View Set Default UI And API

Status: done

Implemented:
- Added `SetDefaultViewInput` and `views.setDefault(input)` to preload/customer APIs.
- Added `DatabaseService.setDefaultView()` to persist `schema.defaultViewId`.
- Kept default view ordering consistent by sorting loaded/returned views with default first.
- Added plugin workspace API support for `setDefaultView(databaseId, viewId)`.
- Added a view settings action to set the current view as default.
- Extended customer API coverage for setting default view and deleting a default view fallback.
- Extended database template UI smoke to set a created view as default before deleting it.

Gates:
- `npm run typecheck`
- `npm run test:customer-api`
- `npm run smoke:database-template-ui`
- `npm run smoke:ui`
- `git diff --check`
