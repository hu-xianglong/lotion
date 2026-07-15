# Database View Default Template UI Smoke

Status: done

Goal: cover the UI path for setting a view's default row template.

Checks:

- View settings opens from the database toolbar.
- The default template select can be changed to a user-created template.
- Saving the view persists `defaultTemplateId`.
- The primary New button uses the newly selected default template.

Verified:

- `npm run smoke:database-template-ui`
- `npm run smoke:ui`
- `git diff --check`
