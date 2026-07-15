# Notion Audit Path Open Smoke

## Goal

Verify the Notion Import audit panel's visible path Open buttons use the same
safe shell-open path as other source and attachment links.

## Scope

- Enable the shell open dry-run debug hook in the Notion audit UI smoke.
- Click the source root and workspace root Open buttons.
- Assert the dry-run requests contain the expected paths.

## Gates

- [x] `npm run smoke:notion-import-ui`
- [x] `npm run smoke:ui`
- [x] `git diff --check`
