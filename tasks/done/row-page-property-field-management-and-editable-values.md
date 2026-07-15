# Row Page Property Field Management and Editable Values

Status: done

## Goal

Make row page properties behave like a first-class database property surface:
fields can be managed from the row page, editable fields expose direct editing
controls, and imported source fields remain visibly read-only/openable.

## Scope

- Added field settings entry points to row page property rows.
- Reused the database field settings dialog for row page properties.
- Made date values directly editable while preserving the calendar picker.
- Made empty entity reference properties editable instead of inert text.
- Kept Original Notion HTML/CSV fields read-only as values, with openable links.

## Gates

- `npm run typecheck`
- `npm run build`
- Manual Electron UI smoke on an imported row page
- `git diff --check`
