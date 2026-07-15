# Source and attachment link smoke

## Goal

Cover imported source links and page attachment links in the row-page UI.

## Scope

- Generate an isolated temporary workspace with one row page.
- Add `notion_original_html` and `notion_original_csv` fields pointing at
  workspace files that exist.
- Add markdown body links for a document attachment and image attachment.
- Open the row page in Electron.
- Verify the source properties render as clickable link buttons.
- Verify markdown attachment links/images render with workspace-relative hrefs.
- Restore the previous workspace after the smoke.

## Gates

- `npm run smoke:source-attachments-ui`
- `git diff --check`
