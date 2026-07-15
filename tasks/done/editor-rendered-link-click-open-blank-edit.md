# Editor Rendered Link Click Opens While Line Blank Edits

Status: done

## Why

URL links and page links in the editor should behave like Notion-style rendered
links: clicking the link itself opens or navigates, while clicking blank space
on the same line should enter editing for that line. A regression currently
makes link clicks fall into plain-text/edit mode, so links cannot be opened.

## Scope

- Fix rendered URL link and page link click handling in the real CodeMirror
  editor.
- Preserve blank-space line clicks for editing/caret placement.
- Cover desktop and compact viewports with coded UI regression checks for URL
  and page links, focus/selection/caret stability, and no horizontal overflow or
  toolbar/status overlap.
- Add renderer/unit coverage if the link decoration or editor event path
  changes.

## Gates

- `node --check scripts/smoke-editor-link-click-ui.mjs`
- `node --check scripts/smoke-editor-regression-ui.mjs`
- `node --check scripts/test-renderer-components.mjs`
- `npm run smoke:editor-link-click-ui`
  - Passed desktop and compact viewports.
  - Verified direct external URL click calls `shell.openLink`.
  - Verified direct page link click navigates to the linked Lotion page.
  - Verified blank space on the same line enters editor focus and persists a typed token.
  - Verified no document horizontal overflow in both viewports.
- `npm run test:renderer-components`
  - Added workspace-link routing contract coverage for page, row-page,
    database, and external link lanes.
- `npm run typecheck`
- `git diff --check`

## Result

- Updated the CodeMirror link mouse handling so mousedown on a rendered link
  prevents accidental source editing, while click opens or navigates the target.
- Kept blank-space clicks outside the link target on the same line on the normal
  CodeMirror editing path.
- Added `smoke:editor-link-click-ui` as a focused, multi-viewport regression.
- Updated the larger editor regression helper to match the new direct-click
  contract so future full editor runs do not enforce the old Cmd/Ctrl-only
  behavior.
