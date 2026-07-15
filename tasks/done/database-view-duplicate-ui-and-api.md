# Database view duplicate UI and API

Status: done

## Goal

Add an explicit duplicate-view command so users, plugins, and tests can copy a
database view without relying on the generic `+` tab behavior.

## Scope

- Add a public duplicate-view API.
- Persist duplicated view settings, including field visibility/order, filters,
  sorts, page size, plugin config, and default template.
- Add a view settings action for duplicate.
- Cover the behavior in customer API tests and the database template UI smoke.

## Gates

- `npm run typecheck`
- `npm run test:customer-api`
- `npm run smoke:database-template-ui`
- `npm run test:fast`
- `git diff --check`
