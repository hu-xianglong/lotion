# List Date Property Formatting Smoke

Status: done

## Why

Gallery cards already have a date-caption formatting smoke. List view also
renders row properties and should preserve the same user-facing date formatting
instead of leaking raw ISO/slash values.

## Scope

- Create a temporary list view whose visible property is the fixture date field.
- Verify a row property renders the expected localized date string.
- Delete the temporary view after the assertion.

## Gates

- `npm run smoke:database-template-ui`
- `git diff --check`
