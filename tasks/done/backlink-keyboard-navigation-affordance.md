# Backlink Keyboard Navigation Affordance

Status: done

Backlog item: tag pages and richer backlink workflows.

## Why

Backlink panels are navigation surfaces. Existing coverage verifies mouse
click-through, but a Notion-like navigation affordance should also be
keyboard-friendly and expose a stable accessible name so future visual changes
do not silently break focus or activation.

## Scope

- Give backlink source buttons stable accessible labels that include the human
  title and source type.
- Extend the page backlinks UI smoke to activate both markdown and property
  backlink items by keyboard in the real page context.
- Keep desktop and compact viewport coverage, and assert no horizontal overflow
  after keyboard navigation.

## Verification

- `node --check scripts/smoke-page-backlinks-ui.mjs`
- `npm run typecheck`
- `npm run smoke:page-backlinks-ui`
- `git diff --check`

Backend tests are not applicable because this change only hardens the renderer
affordance and UI smoke coverage; backlink lookup/data behavior is unchanged.

## Result

- Backlink source buttons now expose a stable accessible label containing the
  human source title and source type.
- The page backlinks UI smoke now asserts every backlink item is an enabled
  native button with a non-negative tab index and descriptive accessible label.
- The smoke activates both markdown and property backlink sources from keyboard
  focus, verifies navigation opens the human-titled page/row, and keeps desktop
  plus compact no-horizontal-overflow checks.

## Gates

- `node --check scripts/smoke-page-backlinks-ui.mjs`
- `npm run typecheck`
- `npm run smoke:page-backlinks-ui`
- `git diff --check`
