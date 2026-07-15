# Command Palette Open Sidebar Settings

Status: done

## Source

Split from `tasks/todo/notion-core-parity-sequence.md`:

- Richer command palette workflows beyond basic plugin command execution.

## Scope

Expose the existing sidebar settings panel through the global command palette.
Users can already reach core navigation and page actions from Cmd-K; settings
should be reachable without moving to the bottom-left sidebar.

Keep this as renderer/UI wiring. Reuse the existing sidebar settings panel and
state; do not change settings persistence behavior.

## Tests

- Extend renderer component coverage for the built-in sidebar settings command
  label, source preview, and command count.
- Extend the shared multi-resolution search-title UI smoke to:
  - discover the sidebar settings command with command badge/source preview;
  - activate it from the command palette;
  - assert the settings panel opens, focus moves to the settings summary, the
    search dialog closes, primary settings controls remain visible, and desktop
    and compact widths do not horizontally overflow.

Backend/package-core tests are not applicable because this only opens an
existing renderer settings panel and does not change persisted settings APIs.

## Gates

- `node --check scripts/smoke-search-title-ui.mjs` passed.
- `npm run test:renderer-components` passed.
- `npm run typecheck` passed.
- `npm run smoke:search-title-ui` passed.
- `git diff --check` passed.

## Result

- Added the built-in `lotion.open-sidebar-settings` command palette action.
- Lifted sidebar settings opening into the app action path so Cmd-K can open
  the existing settings panel without DOM-only wiring.
- Added renderer component assertions for the command count, label, and source
  preview.
- Added multi-resolution UI smoke coverage that opens the command, verifies the
  settings panel opens and receives focus, checks visible settings controls, and
  asserts no horizontal overflow.
