# Built-in Command Palette Database And Plugin Action Coverage

Status: done

## Source

Follow-up split from `tasks/todo/notion-core-parity-sequence.md`:

- Richer command palette workflows beyond basic plugin command execution.

## Scope

Add coded UI coverage for the built-in commands added in item 367 that were not
fully exercised by smoke coverage:

- Open all databases.
- Open plugins.
- Create database, which should surface the template picker.

This is expected to be primarily test coverage. Do not change product code
unless the smoke exposes a real regression.

## Tests

- Extend the shared search UI smoke across desktop and compact viewports.
- Assert each command is discoverable with the command badge and built-in source
  preview.
- Activate the commands and assert the resulting UI state:
  - database management page;
  - plugin management page;
  - database template picker.
- Keep layout assertions for no horizontal overflow and viewport-bounded search
  UI.

## Gates

- `node --check scripts/smoke-search-title-ui.mjs`
- `npm run typecheck`
- `npm run smoke:search-title-ui`
- `git diff --check`

## Result

- Extended `smoke-search-title-ui` across desktop and compact viewports to cover
  the remaining built-in command palette actions:
  - `lotion.open-databases` opens the database management page;
  - `lotion.open-plugins` opens the plugin management page;
  - `lotion.new-database` opens the database template picker without creating a
    fixture database.
- Asserted each command row has the command badge and `Lotion · 内置 · <id>`
  preview.
- Kept viewport and horizontal-overflow assertions around the search dialog,
  management headers, plugin summary, and template picker.
- Fixed a product polish regression found by the smoke: management tabs no
  longer render a duplicate `管理` type chip, so database management appears as
  `管理数据库` instead of `管理管理数据库`.
