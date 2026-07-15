# Database Row Template UI Smoke

Status: done

Goal: add a deterministic UI smoke that proves database row templates can be
applied from the visible table toolbar.

Checks:

- A stored row template is loaded into the database bundle.
- The template appears in the New-row template menu.
- The active view's default template is used by the primary New button.
- Applying the template creates a row page with template field defaults and
  markdown body.

Verified:

- `npm run smoke:database-template-ui`
- `npm run smoke:ui`
- `git diff --check`
