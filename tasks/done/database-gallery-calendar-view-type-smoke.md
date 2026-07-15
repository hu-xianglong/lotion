# Database Gallery And Calendar View Type Smoke

Status: done

## Why

List view type persistence is covered, but gallery and calendar are also
existing Notion-core database views. They should be covered by the same view
settings smoke so type switching does not regress silently.

## Scope

- Switch the created view to gallery and verify the gallery body renders.
- Switch the same view to calendar and verify the calendar body renders.
- Verify the saved view stores each type after saving.
- Switch back to list so the existing duplicate/default/delete assertions keep
  exercising a stable non-table view.

## Gates

- `npm run smoke:database-template-ui` passed.
- `git diff --check` passed.
