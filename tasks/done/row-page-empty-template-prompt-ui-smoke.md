# Row Page Empty Template Prompt UI Smoke

Status: done

Goal: cover the Notion-style empty row-page template prompt.

Checks:

- A blank row page with database templates shows the empty-page prompt.
- Clicking a template in that prompt applies markdown body content.
- Template field defaults update the row record.
- The row-page body is persisted after the editor debounce flushes.

Fix included:

- Applying an empty-page row template now persists the template markdown at
  App level as well as updating the editor state, so subsequent field/full-width
  updates cannot overwrite the cached row page with an empty body.

Verified:

- `npm run typecheck`
- `npm run smoke:database-template-ui`
- `npm run smoke:ui`
- `git diff --check`
