# Deterministic Notion Import UI smoke

## Goal

Make `smoke:notion-import-ui` deterministic by running the real audit service
against a generated source export and matching imported workspace.

## Scope

- Remove the renderer-side audit mock.
- Create a temporary Notion-like source export with one CSV and one HTML row
  page.
- Create a temporary Lotion workspace that preserves matching original
  HTML/CSV links.
- Open the workspace in Electron, open the Notion Import plugin page, run audit
  with `Audit every HTML body`, and assert the expected summary.
- Restore the previous workspace after the smoke.

## Gates

- `npm run smoke:notion-import-ui`
- `npm run smoke:ui`
- `git diff --check`
