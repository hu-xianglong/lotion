# Toggle Direct Editing Regression

Status: done

Priority: highest

Reported by user: the current toggle block experience is not acceptable because
editing requires `Edit source`. Toggle content should be editable immediately in
place.

## Goal

Make Lotion toggle blocks feel Notion-like and editor-first. Users should be
able to click into a rendered toggle summary/body and edit text directly, while
the markdown/source representation stays in sync and remains available only as a
fallback or advanced affordance.

## Acceptance

- A rendered `lotion-toggle` block allows direct in-place editing of the toggle
  summary without first clicking `Edit source`.
- Toggle body content is directly editable when the toggle is open, including
  plain text, multiple lines, list-like markdown, and pasted text.
- Clicking the disclosure triangle/summary affordance still expands/collapses
  the toggle without stealing the caret when the user is editing text.
- Keyboard behavior is coherent: Tab/Shift-Tab, Enter, Backspace, arrow keys,
  Escape, undo/redo, and selection work without losing the editor state.
- Edits to summary/body autosave to the underlying markdown fence with stable
  `summary`, `open`, and body content serialization.
- Reloading the page preserves the edited toggle content and open/collapsed
  state.
- The primary path does not require or visually emphasize `Edit source`; if a
  source fallback remains, it must be secondary and not necessary for ordinary
  editing.
- The behavior works at desktop and compact/narrow widths with no overlap,
  horizontal overflow, hidden caret, or clipped toggle controls.
- Imported Notion toggle blocks continue to render and become directly editable
  after import.

## Required Tests

- Add or extend coded UI coverage in `scripts/smoke-markdown-preview-ui.mjs`
  using the shared UI harness.
- Tests must create/open a page with a `lotion-toggle` block, edit the summary
  directly, edit body text directly, paste multi-line content, undo/redo, toggle
  collapse/expand, and assert the saved markdown/model state.
- Tests must reload the page and verify the edited rendered toggle state and
  underlying markdown persist.
- Tests must run across at least desktop and compact/narrow viewports and assert
  no horizontal overflow, no overlap with editor chrome, and visible caret/focus
  during editing.
- Keep existing import converter/package coverage passing for Notion
  `<details><summary>` conversion. Add package-core coverage if the markdown
  serialization/parsing model changes.

## Gates

- `node --check scripts/smoke-markdown-preview-ui.mjs`
- `npm run typecheck`
- `npm run smoke:markdown-preview-ui`
- package-core/import converter tests if parsing or serialization changes
- `git diff --check`

## Result

- Replaced the rendered toggle's native `<details>/<summary>` editing path with
  a custom disclosure button plus direct summary/body controls, so ordinary
  editing no longer requires revealing source markdown.
- Toggle edits now serialize back to the `lotion-toggle` fence for summary,
  open state, and multi-line body content.
- Kept `Edit source` as a secondary fallback affordance.
- Extended the markdown preview UI smoke to edit toggle summary/body directly,
  verify undo/redo, collapse/expand persistence, multi-line body persistence,
  and no horizontal overflow across desktop and compact viewports.

## Verification

- `node --check scripts/smoke-markdown-preview-ui.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:markdown-preview-ui`
- `git diff --check`

Package/import converter tests were not added because this item did not change
Notion import parsing or the converter; it only changed the rendered editor
widget and the UI smoke coverage around that widget.
