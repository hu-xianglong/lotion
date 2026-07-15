# Database Row Template Manager UI Smoke

Status: done

Goal: extend the database template smoke to cover the user-created template
path in `RowTemplateDialog`.

Checks:

- The template manager opens from the New-row menu.
- A user-created template can save field defaults, markdown body, and full
  width.
- The newly saved template appears in the New-row menu without reloading.
- Applying it creates a row page with the saved defaults and body.

Verified:

- `npm run smoke:database-template-ui`
- `npm run smoke:ui`
- `git diff --check`
