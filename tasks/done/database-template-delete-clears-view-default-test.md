# Database Template Delete Clears View Default Test

Status: done

Goal: cover the data-model invariant that deleting a row template clears any
view default that pointed at that template.

Checks:

- A view can persist `defaultTemplateId`.
- Deleting that template removes it from `schema.templates`.
- The returned views no longer reference the deleted template.

Verified:

- `npm run test:customer-api`
- `git diff --check`
