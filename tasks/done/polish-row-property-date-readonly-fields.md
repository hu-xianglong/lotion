# Polish Row Property Date And Read-Only Import Fields

Status: done

## Why

Row page properties should visually distinguish editable fields from imported
source references. Date fields currently render with overlapping text and the
native calendar icon in the row property panel.

## Scope

- Make date fields align cleanly in row property and database cells.
- Keep date editing available without the formatted value colliding with the
  picker icon.
- Render Original Notion HTML/CSV fields as read-only source links, with a
  quieter affordance than editable fields.

## Gates

- `npm run typecheck`
- manual Electron UI smoke
- `git diff --check`

## Result

- Date fields now render formatted text and the native picker as separate grid
  cells, avoiding overlap in row property panels and database cells.
- Original Notion HTML/CSV properties render as read-only source links instead
  of editable fields.
- The automated source attachment smoke could not attach to a Lotion renderer
  on the current Electron devtools port, so this item was manually verified in
  the Electron window.
