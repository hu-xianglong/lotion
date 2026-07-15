# Command Palette Toggle Current Page Full Width

Status: done

## Why

Notion exposes common page layout settings through fast command surfaces. Lotion
already supports full-width page and row-page settings, but users still have to
find the page menu. The command palette should make this setting reachable from
keyboard-first workflows.

## Scope

- Add a built-in command palette command to toggle full width for the currently
  active page or row page.
- Reuse existing page/row-page persistence paths; do not add a new storage
  format.
- Keep the command visible, typed-searchable, keyboard-friendly, and covered in
  the shared multi-resolution search title smoke.

## Acceptance

- Searching command palette for "full width" shows a Lotion built-in command.
- Activating the command on a normal page toggles the page to full-width and
  persists via the existing page settings model.
- The command remains visible and usable at desktop and compact widths with no
  horizontal overflow.
- Renderer component coverage includes the new command index entry.

## Verification

- `node --check scripts/smoke-search-title-ui.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:search-title-ui`
- `git diff --check`

## Result

- Added a built-in `lotion.toggle-full-width` command surfaced as
  `切换当前页面全宽`.
- Reused the existing page and row-page full-width persistence paths.
- Extended renderer component coverage for the new command row/counts.
- Extended the multi-resolution search-title UI smoke to search for the command,
  activate it on a newly-created page, assert the full-width class, verify
  persisted page metadata, and check no horizontal overflow at desktop and
  compact widths.
