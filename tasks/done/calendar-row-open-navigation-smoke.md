# Calendar Row Open Navigation Smoke

Status: done

## Why

Calendar row chips now contain nested icon/text elements. The chip should still
open the row page reliably when clicked.

## Scope

- Click a deterministic row in the calendar view.
- Verify the row page opens with the expected title.
- Return to the database view so the rest of the smoke can continue.

## Gates

- `npm run smoke:database-template-ui`
- `git diff --check`
