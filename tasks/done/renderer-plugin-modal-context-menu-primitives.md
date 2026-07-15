# Renderer plugin modal and context menu primitives

Status: done

## Why

Renderer plugins expose `ctx.ui.modal` and `ctx.ui.contextMenu`, but both still
throw stub errors. That blocks small plugin UI flows from using the public UIAPI
without reaching into app internals.

## Scope

- Implement `ctx.ui.modal` with a lightweight DOM modal that reuses the app's
  existing dialog styling.
- Implement `ctx.ui.contextMenu` with a lightweight anchored DOM menu.
- Keep this as a renderer-only primitive; no new plugin settings framework or
  external plugin loader.

## Gates

- `npm run typecheck`
- `git diff --check`

## Result

- `ctx.ui.modal` now opens a lightweight DOM modal, resolves with the plugin
  value, and closes on backdrop click, close button, or Escape.
- `ctx.ui.contextMenu` now opens an anchored menu, clamps it to the viewport,
  closes on outside click or Escape, and reports plugin action errors through
  the app notification surface.
