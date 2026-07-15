# Calendar View Hidden Date Field Rendering Smoke

Status: done

## Why

Calendar views persist `dateFieldId`, but the renderer must still use that
field when it is hidden from the card/table captions. Notion lets a view-specific
date property drive the calendar without forcing that property into the visible
columns.

## Scope

- Seed a visible Ready row with a current-month `Due Date` template value.
- Verify the selected hidden date field causes that row to render in calendar.
- Fix calendar rendering so `view.dateFieldId` is trusted even when the field is
  not in the visible-field list.

## Gates

- `npm run smoke:database-template-ui` passed.
- `npm run typecheck` passed.
- `git diff --check` passed.
