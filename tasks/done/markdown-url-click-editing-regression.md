# Markdown Link Click Editing Regression

Status: done

Priority: highest

Reported by user: clicking a URL or other link type in the Markdown editor with
the mouse opens/navigates immediately, so the link text cannot be clicked into
and edited.

## Goal

Make all Markdown editor link interactions Notion-like and editor-first: a
normal left-click on visible link text should place the caret and allow editing,
not open/navigate the link. Opening should remain available through an explicit
open gesture such as Cmd/Ctrl-click or another clear affordance.

## Acceptance

- In the normal page editor, clicking a bare URL with an unmodified mouse click
  focuses the CodeMirror editor and places the caret in/near the URL text.
- The same click-to-edit behavior works for Markdown inline links
  (`[label](target)`), internal workspace page/database/row links, attachment or
  source-file links, decoded URL-label links, and link icon/preview-adjacent
  clickable regions.
- The unmodified click does not call `window.lotion.shell.openLink`, navigate
  internal workspace links, or open an external browser.
- After the click, typing edits the Markdown text and autosaves the exact
  updated markdown.
- Cmd/Ctrl-click still opens external URLs through the shell dry-run/capture
  path and still navigates supported internal workspace links.
- Internal Markdown links keep a clear open path without sacrificing ordinary
  click-to-edit behavior.
- The behavior is covered at desktop and compact/narrow viewports with no
  horizontal overflow or editor focus loss.

## Required Tests

- Add or extend a coded UI regression in the shared editor UI harness, preferably
  `scripts/smoke-editor-regression-ui.mjs`.
- The UI test must intercept `window.lotion.shell.openLink` using the existing
  debug dry-run or patching approach so the test never opens a real browser.
- The test must assert both negative and positive behavior: ordinary click does
  not open, then Cmd/Ctrl-click does open.
- Include separate assertions for at least a bare external URL, a Markdown
  `[label](https://...)` link, and an internal workspace Markdown link. Add an
  attachment/source-file link case if the fixture can create one without making
  the smoke brittle.
- Include persistence assertions against the page markdown/model state after
  editing each link text/target.

## Gates

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run typecheck`
- `npm run smoke:editor-regression-ui`
- `git diff --check`

## Result

- Normal unmodified left-clicks on rendered Markdown links now keep the
  CodeMirror editor in edit mode by placing the caret in the link source instead
  of opening/navigating immediately.
- Cmd/Ctrl-click remains the explicit open gesture for external links,
  attachment/source-file links, decoded URL-label links, and internal workspace
  links.
- Decoded URL-label widgets now expose `data-md-url` so they follow the same
  event path as ordinary link text.
- The shared UI harness now waits for the actual random-port Vite renderer page
  instead of occasionally selecting the DevTools page when the harness uses
  isolated ports.

## Verification

- `node --check scripts/ui-harness.mjs`
- `node --check scripts/smoke-editor-regression-ui.mjs`
- `node --check scripts/smoke-markdown-preview-ui.mjs`
- `npm run typecheck`
- `npm run smoke:editor-regression-ui`
  - Desktop and compact viewports.
  - Bare URL, Markdown inline link, decoded URL-label link, attachment link,
    and internal workspace link all assert plain-click edit/no-open behavior.
  - External/attachment/decoded links assert Cmd/Ctrl-click shell dry-run
    requests; internal links assert Cmd/Ctrl-click navigation.
  - Edited link text is verified through persisted page markdown.
- `npm run smoke:markdown-preview-ui`
  - Desktop and compact viewports.
  - Decoded URL labels keep a single click target.
  - Cross-line encoded URL labels remain editable source text instead of being
    replaced by a cross-line widget.
- `git diff --check`
