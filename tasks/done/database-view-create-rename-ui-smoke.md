# Database View Create Rename UI Smoke

Status: done

Implemented:
- Added UI smoke coverage for the existing database view creation flow.
- Clicks the view tab `+` button, renames the copied view through the view settings dialog, and saves it.
- Verifies the renamed view appears as the active tab.
- Verifies the saved database bundle contains the renamed view and preserves the source view's visible fields, field order, and wrap settings.
- Replaced async `page.waitForFunction` polling in the database template smoke with an explicit page polling helper so async `window.lotion.*` checks are real waits.
- Fixed `DatabaseTable` active-view state so bundle updates no longer force the current tab back to the parent/default view.

Gates:
- `npm run smoke:database-template-ui`
- `npm run smoke:ui`
