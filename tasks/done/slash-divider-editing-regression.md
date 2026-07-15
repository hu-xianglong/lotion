# Slash Divider Editing Regression

Status: done

Split from `tasks/todo/notion-core-parity-sequence.md` slash/live-preview
editing.

## Goal

The Notion-like `/divider` writing path should be protected by coded UI
coverage: insert a divider from the slash menu, see a real divider preview in
the editor, continue typing after it, and persist the Markdown exactly.

## Acceptance

- In the normal page editor, typing `/divider` and pressing Enter inserts a
  horizontal divider without leaving raw slash text behind.
- The divider row renders as a visible horizontal-rule preview when inactive.
- The cursor lands after the divider so the user can continue typing body text
  without manual repositioning.
- The persisted markdown contains the divider `---` and following text in the
  expected order.
- The flow remains stable at desktop and compact viewports with no horizontal
  overflow.

## Gates

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run test:slash`
- `npm run typecheck`
- `npm run smoke:editor-regression-ui`
- `git diff --check`

## Result

- Added slash-command unit coverage for `/divider` after text and after a
  blank line.
- Fixed `/divider` insertion after a non-empty paragraph so Markdown parses it
  as a horizontal rule instead of a Setext heading underline.
- Extended the shared editor regression smoke to insert `/divider`, assert the
  rendered divider preview, continue typing after it, persist the divider and
  following text, and verify no horizontal overflow at desktop and compact
  viewports.
- Made page layout toggles await persistence and roll back on save failure.
- Updated the shared UI harness to run smoke tests against an isolated
  current-code Electron process by default instead of reusing a stale manual
  app on port 9222.

## Verified

- `node --check scripts/ui-harness.mjs`
- `node --check scripts/dev.mjs`
- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run test:slash`
- `npm run typecheck`
- `npm run smoke:editor-regression-ui`
- `git diff --check`
