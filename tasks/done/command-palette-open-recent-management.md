# Command Palette Open Recent Management

Status: done

## Source

Split from `tasks/todo/notion-core-parity-sequence.md`:

- Richer command palette workflows beyond basic plugin command execution.

## Scope

Expose the existing Recent management surface through the global command
palette. Users can already reach All pages, All databases, and Plugins from
Cmd-K; Recent should be equally reachable because it is part of the same
quick-switcher workflow.

Keep this renderer/search-panel only. Reuse `openManage("recent")`; do not
change recent persistence or management data behavior.

## Tests

- Extend renderer component coverage for the built-in Recent command label,
  source preview, and command count.
- Extend the shared multi-resolution search-title UI smoke to:
  - discover the Recent command with command badge/source preview;
  - activate it from the command palette;
  - assert the Recent management view opens, shows recent rows, keeps the
    search dialog closed, and does not overflow at desktop or compact widths.

Backend/package-core tests are not applicable because this only wires an
existing renderer navigation action into the existing command palette.

## Gates

- `node --check scripts/smoke-search-title-ui.mjs` passed.
- `npm run test:renderer-components` passed.
- `npm run typecheck` passed.
- `npm run smoke:search-title-ui` passed.
- `git diff --check` passed.

## Result

- Added the built-in `lotion.open-recent` command palette action.
- Added renderer component assertions for the Recent command label, source
  preview, and result counts.
- Added multi-resolution UI smoke coverage that searches for the Recent
  command, opens the Recent management view, verifies rows are visible, and
  checks the dialog closes without horizontal overflow.
