# Global Search Escape Focus Restoration

Status: done

## Problem

Opening global search from the editor should behave like a lightweight
Notion-style quick switcher. If the user cancels with Escape or by clicking the
backdrop, focus should return to the editor so typing can continue immediately.
The current search-title smoke covers recent keyboard navigation, but not this
focus restoration path.

## Scope

- Remember the focused element before global search takes focus.
- Restore that focus only for cancellation paths: Escape and backdrop click.
- Keep result navigation and command execution close behavior unchanged.
- Add coded multi-resolution UI smoke coverage from a real page editor context.

## Acceptance

- From a focused CodeMirror editor, opening global search focuses the search
  input.
- Escape closes the panel and restores focus to the editor at desktop and
  compact viewport sizes.
- The search panel and editor restoration path have no horizontal overflow.
- Navigation/command close paths remain unchanged.

## Verification

- [x] `node --check scripts/smoke-search-title-ui.mjs`
- [x] `npm run typecheck`
- [x] `npm run smoke:search-title-ui`
  - Artifact: `artifacts/ui-smoke/search-title-2026-06-14T16-34-30-748Z`
  - Covered desktop and compact viewports. Both assert the search input takes
    focus and Escape restores `.cm-content` / `.cm-editor.cm-focused`.
- [x] `git diff --check`

## Result

- Global search now captures the previously focused element before focusing the
  search input, which avoids React dev effect re-runs overwriting the original
  editor focus.
- Escape and backdrop cancellation restore the captured focus when it still
  exists.
- Result navigation and command activation keep their previous close behavior.
