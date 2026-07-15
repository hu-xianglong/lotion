# Calendar View Date Field Setting UI Smoke

Status: done

## Why

Calendar views expose a date-field picker. The smoke suite currently verifies
calendar body rendering but not that choosing a specific date field persists in
the saved view.

## Scope

- Add a deterministic `Due Date` date field to the database fixture.
- When switching the created view to calendar, choose `Due Date`.
- Verify the saved view stores `dateFieldId: "due_date"`.
- Keep the final created view type as list for the later duplicate/default
  assertions.

## Gates

- `npm run smoke:database-template-ui` passed.
- `git diff --check` passed.
