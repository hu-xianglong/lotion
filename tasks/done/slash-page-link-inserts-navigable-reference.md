# Slash page link inserts navigable page reference

Status: done

## Why

Notion-like writing depends on quickly linking to another page without leaving
the editor. Lotion has dynamic page slash commands, but the editor regression
suite does not currently protect the real UI path: search a page command,
insert the Markdown link, and navigate through that link from the rendered
editor.

## Acceptance

- A page-specific slash query selects a page command from the slash menu.
- The command inserts a Markdown internal page link with the page title label.
- The inserted link renders as an editor link and persists in page Markdown.
- Cmd/Ctrl-clicking the rendered link opens the target Lotion page rather than
  an external file/browser target.
- The behavior is covered across desktop and compact editor smoke viewports.

## Gates

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `npm run test:slash`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`

## Result

- Added slash-template coverage for applying a dynamic page command, including
  generated internal-page Markdown and cursor placement.
- Extended the shared multi-resolution editor regression smoke so desktop and
  compact viewports search a page-specific slash command, insert the page link,
  assert the persisted Markdown target, verify rendered link geometry, and
  Cmd/Ctrl-click through to the target Lotion page before returning to the
  source page.

Backend tests are not applicable for this item because it wires existing
dynamic slash-command generation and existing internal-link navigation through a
frontend editor flow; no persistence or service behavior changed.
