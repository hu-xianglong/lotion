# Align Row Page Property Controls

## Context

Imported row pages expose editable row properties above the markdown body. Text, link, date, and checkbox fields should share a stable value column like Notion. Date pickers and checkboxes inherited table-cell layout behavior, so controls drifted to the right and broke the scan line.

## Changes

- Wrapped row page property cell editors in a property-panel-specific `row-property-editor` container.
- Added compact property-panel CSS for text, URL, entity refs, numbers, dates, and checkboxes.
- Kept database table cell layout unchanged.

## Verification

- `npm run typecheck`
- `git diff --check`
- Manual Electron UI smoke on imported row pages with date/entity-ref fields.
