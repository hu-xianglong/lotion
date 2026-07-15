# Renderer Plugin Notify Toast Surface

Status: done

## Why

Renderer plugins currently use `window.alert()` for `ctx.ui.notify`, which
blocks the app and feels unlike Notion-style non-modal feedback. Built-in
plugins already call this API for import, Git sync, and LLM feedback.

## Scope

- Route `ctx.ui.notify` through a renderer event instead of `alert()`.
- Add a small app-level toast surface with dismiss support.
- Extend plugin-manager UI smoke to verify a notification renders and can be
  dismissed.

## Gates

- `npm run smoke:plugin-manager-ui`
- `npm run typecheck`
- `git diff --check`
