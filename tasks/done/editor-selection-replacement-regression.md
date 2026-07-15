# Editor Selection Replacement Regression

Status: done

## Why

The shared editor harness already covers first typing, Enter/Backspace,
undo/redo, paste, slash commands, autosave, reload, page switching, empty row
pages, and large-document scroll stability. It does not directly cover a core
Notion-like editing behavior: selecting existing text and typing should replace
only that selection, preserve surrounding text, keep the editor focused, and
persist the result across reloads.

## Scope

- Extend the shared multi-viewport editor regression smoke.
- Select a known seed phrase in the editor by keyboard/search action.
- Type a replacement token.
- Assert the replacement appears, the original selected text is gone, adjacent
  seed text remains, the editor remains focused, and the markdown persisted
  state matches.
- Keep this focused on renderer/editor behavior; do not change storage or
  backend code unless the test exposes a real bug.

## Gates

- Passed: `npm run typecheck`
- Passed: `npm run smoke:editor-regression-ui`
  - Initial sandboxed run timed out waiting for CDP.
  - Initial elevated run exposed the bad search-selection assumption and failed
    because text inserted at the end instead of replacing the seed text.
  - Final elevated run passed after switching the smoke to real drag selection.
- Passed: `git diff --check`

## Result

- Extended `scripts/smoke-editor-regression-ui.mjs` with a multi-viewport
  selection replacement assertion.
- The smoke now drags over an existing seed phrase in CodeMirror, types a
  replacement, verifies the original selected text is removed, verifies
  adjacent seed text remains, verifies editor focus is still coherent, and
  verifies the replacement persisted in page markdown.
- Backend/package-core tests were not applicable because this item only adds UI
  regression coverage for existing editor behavior and does not change storage,
  parser, IPC, or service behavior.
