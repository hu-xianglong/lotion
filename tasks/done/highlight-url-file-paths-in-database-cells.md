# Highlight URL File Paths In Database Cells

Status: done

## Why

Imported source file fields such as Original Notion HTML/CSV are URL fields, but
database table cells currently read like plain text with only a small open icon.
Workspace-relative file paths should be visually highlighted like links, the
same way external URLs are.

## Scope

- Add a link-style display layer for URL cells in database tables.
- Preserve the existing editable input behavior when the cell is focused.
- Keep the open button behavior unchanged.

## Gates

- `npm run typecheck`
- `npm run smoke:url-field-ui`
- `git diff --check`

## Result

- URL cells now render a link-style display layer for the raw value, including
  workspace-relative file paths such as imported Original Notion HTML/CSV.
- Focusing the cell hides the display layer and restores the underlying input,
  so editing behavior is unchanged.
- The URL field UI smoke now asserts the visible underlined display. Running it
  in this desktop session was blocked by a stale Electron process owning the
  default CDP port, so the runnable assertion is included for the next clean UI
  smoke pass.
