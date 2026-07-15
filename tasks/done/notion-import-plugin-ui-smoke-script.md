# Notion Import Plugin UI Smoke Script

Status: done

## Why

The Notion Import audit UI should be testable without manual clicking. A small
CDP smoke script lets agents verify the plugin panel and audit result rendering
while the dev Electron app is running.

## Scope

- Add a Playwright CDP smoke script for the Notion Import plugin page.
- Mock the audit API in the renderer so no system folder picker is needed.
- Verify the audit result path Open buttons render.
- Add a package script for the smoke.

## Gates

- `npm run smoke:notion-import-ui` against the running dev app.
