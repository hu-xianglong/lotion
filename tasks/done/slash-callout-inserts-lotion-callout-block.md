# Slash Callout Inserts Lotion Callout Block

Status: done

Backlog item: Notion core parity sequence slash/live-preview editing.

## Why

The slash menu exposes a Callout command, but it currently inserts a plain
blockquote-style `> 💡 ...` line. Lotion already has a Notion-like
`lotion-callout` preview widget, so slash insertion should create that first
class block instead of a weaker visual approximation.

## Acceptance

- `/callout` inserts a `lotion-callout` fenced block with a default lightbulb
  icon.
- The cursor lands in the callout body so users can immediately type content.
- The inactive editor renders the inserted block as the Lotion callout preview,
  not raw source or a plain blockquote.
- The inserted callout persists after autosave/reload.
- Multi-resolution editor smoke coverage verifies visibility, no horizontal
  overflow, and continued editing behavior.

## Tests

- `npm run test:slash`
- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run typecheck`
- `npm run smoke:editor-regression-ui`
- `git diff --check`

## Result

- `/callout` now inserts a first-class `lotion-callout` fenced block with the
  default lightbulb icon instead of a plain blockquote approximation.
- The slash template cursor lands inside the callout body, so typed content is
  immediately part of the callout.
- Editor regression smoke now covers inserting the callout from the slash menu,
  typing callout body text, leaving the source fence, rendering the Lotion
  callout preview, continuing to type after the fence, and autosave persistence
  across desktop and compact viewports.
- The existing page tag search smoke path was updated to pin the auto-hidden
  Page details panel before interacting with tag chips, matching the current
  product behavior after the page secondary panel work.

## Backend Tests

`npm run test:slash` covers the pure slash command template behavior. Additional
backend persistence tests are not applicable because page save/autosave,
workspace storage, and renderer callout parsing were not changed.
