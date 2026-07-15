# Editor scroll latency benchmark

## Goal

Measure CodeMirror scroll responsiveness on a large imported-style markdown page
with images, iframes, and an embedded database view.

## Scope

- Generate an isolated temporary workspace.
- Start on a blank page, then navigate to a large benchmark page.
- Wait for the CodeMirror editor and embedded table to mount.
- Scroll the editor through multiple requestAnimationFrame steps and report
  duration plus long-task observations when Chromium exposes them.
- Restore the previous workspace after the smoke run.

## Result

- Added `scripts/smoke-editor-scroll-ui.mjs`.
- Added `npm run smoke:editor-scroll-ui` and
  `npm run benchmark:editor-scroll-ui`.
- The smoke creates a temporary workspace with a large markdown page containing
  an embedded table, missing-image widgets, iframe fences, and 2500 text lines.
- It navigates from a blank page to the large page, waits for CodeMirror and the
  embedded table, then scrolls the editor through 24 animation-frame steps.
- Checked threshold: total scroll <= 600ms.

## Verified

- `npm run smoke:editor-scroll-ui`
  - total scroll: 203.1ms
  - average step: 8.46ms
  - long tasks: 0
  - embedded table remained mounted after scroll: 1
- Confirmed Electron restored to `Import Notion` workspace after the smoke.
- `git diff --check`
