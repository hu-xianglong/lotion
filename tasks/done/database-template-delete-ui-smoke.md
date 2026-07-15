# Database Template Delete UI Smoke

Status: done

Goal: cover deleting a row template from the template manager UI.

Checks:

- A template can be selected and deleted from `RowTemplateDialog`.
- The deleted template disappears from the New-row menu.
- A view default pointing at that template is cleared.
- The primary New button creates a blank row after the default is cleared.

Verified:

- `npm run smoke:database-template-ui`
- `npm run smoke:ui`
- `git diff --check`
