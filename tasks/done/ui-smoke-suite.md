# UI smoke suite

## Goal

Provide one command that runs the focused Electron UI smoke scripts added for
Notion import, search, embedded views, editor scroll, sidebar navigation,
row-page navigation, source/attachment links, and image lightbox behavior.

## Scope

- Add `npm run smoke:ui`.
- Keep individual smoke commands available for focused debugging.
- Run the suite once against the current Electron app.

## Gates

- `npm run smoke:ui`
- `git diff --check`
