# Calendar Overflow Row Open Smoke

Status: done

## Why

The calendar overflow control now expands hidden rows, but the important user
workflow is opening one of those hidden rows. Cover that path directly.

## Scope

- Expand a calendar day with hidden rows.
- Click a row that was hidden behind the `+N` marker.
- Verify the row page opens, then return to the database view.

## Gates

- `npm run smoke:database-template-ui`
- `git diff --check`
