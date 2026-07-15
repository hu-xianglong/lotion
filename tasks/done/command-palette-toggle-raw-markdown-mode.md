# Command Palette Toggle Raw Markdown Mode

Status: done

## Source

Split from `tasks/todo/notion-core-parity-sequence.md` and prior user feedback
around raw/source-mode reliability:

- Richer command palette workflows beyond basic plugin command execution.
- CodeMirror live preview writing surface should keep raw Markdown mode easy to
  access and regression-covered.

## Scope

Expose the existing raw Markdown display setting through the global command
palette. This should reuse the existing `SettingsProvider` state and persistence
path; do not introduce another copy of the setting.

## Tests

- Extend renderer component coverage for the built-in raw Markdown command
  label, source preview, and command count.
- Extend the shared multi-resolution search-title UI smoke to:
  - discover the raw Markdown command with command badge/source preview;
  - activate it from the command palette;
  - assert the setting toggles from its prior state, persists to localStorage,
    updates the visible sidebar settings control, closes search, and does not
    horizontally overflow at desktop or compact widths.

Backend/package-core tests are not applicable because this only toggles an
existing renderer/localStorage setting.

## Gates

- `node --check scripts/smoke-search-title-ui.mjs` passed.
- `npm run test:renderer-components` passed.
- `npm run typecheck` passed.
- `npm run smoke:search-title-ui` passed.
- `git diff --check` passed.

## Result

- Added the built-in `lotion.toggle-raw-markdown` command palette action.
- Reused the existing `SettingsProvider` raw Markdown state and persistence
  path instead of adding a parallel setting.
- Added renderer component assertions for the command count, label, and source
  preview.
- Added multi-resolution UI smoke coverage that toggles raw Markdown mode,
  verifies localStorage and sidebar settings controls stay in sync, closes the
  search dialog, and asserts no horizontal overflow.
