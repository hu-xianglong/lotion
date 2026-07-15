# Git Sync Command Palette Squash Safety Check

Status: done

## Source

Split from `tasks/todo/git-sync-plugin.md` history compaction safety notes.

## Goal

Expose the existing Git Sync squash preflight as a command palette action so
users can check whether advanced monthly snapshot maintenance would be safe
without opening settings and without running any history rewrite.

## Acceptance

- Register a `Check Git squash safety` command under the Git Sync plugin.
- Running the command calls only `window.lotion.git.squashPreflight()` and
  shows a clear notification with the preflight state.
- The command metadata is visible in the command palette with plugin/category/id
  context.
- Desktop and compact search UI smoke can find and run the command without
  opening a modal or triggering dangerous Git operations.
- Renderer coverage includes the command in the static search fixture.

## Verification

- [x] `node --check scripts/smoke-search-title-ui.mjs`
- [x] `node scripts/test-renderer-components.mjs`
- [x] `npm run typecheck`
- [x] `npm run smoke:search-title-ui`
  - Artifact: `artifacts/ui-smoke/search-title-2026-06-16T08-37-15-383Z`
- [x] `git diff --check`

## Result

- Added `git-sync.squash-preflight` as a Sync command palette action.
- The action reuses the existing Git service preflight and only shows an
  info/warn notification; it does not run squash, force push, or open the Git
  Sync settings modal.
- Extended static renderer search coverage and multi-resolution command palette
  smoke coverage for the command metadata, notification, focus/layout, and
  modal absence.
