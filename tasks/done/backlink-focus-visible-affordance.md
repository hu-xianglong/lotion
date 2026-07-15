# Backlink Focus-Visible Affordance

Status: done

Backlog item: tag pages and richer backlink workflows.

## Why

Keyboard activation is only useful if users can see which backlink source has
focus. The backlinks panel should behave like a compact Notion navigation list:
hover and keyboard focus both need a clear, non-overlapping affordance.

## Scope

- Add a visible focus state for backlink source buttons.
- Extend the page backlinks UI smoke to assert the focused backlink has a
  concrete focus affordance at desktop and compact widths.
- Keep this UI-only; backlink data lookup and navigation behavior are
  unchanged.

## Verification

- `node --check scripts/smoke-page-backlinks-ui.mjs`
- `npm run typecheck`
- `npm run smoke:page-backlinks-ui`
- `git diff --check`

Backend tests are not applicable because this only changes renderer CSS and UI
smoke assertions.

## Result

- Backlink buttons now use the same hover background when focused, and expose a
  stronger theme-colored outline for `:focus-visible`.
- The page backlinks UI smoke now verifies focused backlink buttons have a
  concrete visual affordance before keyboard activation.
- The existing desktop and compact viewport checks continue to cover no
  horizontal overflow after navigation.

## Gates

- `node --check scripts/smoke-page-backlinks-ui.mjs`
- `npm run typecheck`
- `npm run smoke:page-backlinks-ui`
- `git diff --check`
