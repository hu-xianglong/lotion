# Unified Command Palette Navigation And Actions

Status: done

## Decision

The command palette is a required Notion-parity surface. It should support both
navigation and command execution, not a navigation-only quick switcher.

## Why

Global search already has enough pieces to act as a command palette: page and
database search, recent entities, built-in commands, plugin commands, command
filtering, and keyboard activation. The remaining gap is product shape. Users
should understand this as one fast `Cmd-K` entry point for going somewhere or
doing something.

## Scope

- Make the global command/search surface explicitly behave as a unified command
  palette.
- Keep page, database, row-page, recent, and content search navigation in the
  same surface.
- Keep built-in commands and plugin commands in the same surface.
- Ensure commands and navigation hits are visually distinct but comparable:
  stable icon/type badge, source label, title, and secondary context.
- Make command filtering and mixed-result ranking predictable:
  - exact command/title match first;
  - recent/openable entities before deep content hits for short queries;
  - plugin and built-in commands discoverable by title, category, and id.
- Support keyboard-first use:
  - open from the existing global shortcut;
  - arrow through mixed results;
  - Enter activates either navigation or command execution;
  - Escape closes and restores prior focus.
- Keep shortcut display labels compatible with the future shortcut registry in
  `tasks/todo/keyboard-shortcut-settings-and-registry.md`.
- Keep command execution confirmation out of this task unless a command is
  destructive; destructive command confirmation should be handled per command.
- Preserve the existing global search API and search backend unless a small
  presentation-layer helper is needed.

## Out Of Scope

- New plugin permission model.
- External plugin loading.
- Full shortcut settings UI.
- Semantic/vector search integration.
- Large command registry refactor.
- Full fuzzy-search engine replacement.

## Tests

- Extend the shared search/command palette UI smoke across desktop and compact
  viewports:
  - page/database/row-page navigation hits still open correctly;
  - built-in commands and plugin commands are discoverable in the same surface;
  - command-only filtering still works;
  - mixed results remain visually distinct and viewport bounded;
  - Enter activation works for one navigation hit and one command hit;
  - Escape restores focus to the previous editor/search entry.
- Extend renderer component coverage for command palette result grouping/copy if
  presentation markup changes.

## Gates

- `node --check scripts/smoke-search-title-ui.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:search-title-ui`
- `git diff --check`

## Result

- Empty global search now behaves as a unified command palette: recent page,
  database, and row-page entries remain first, followed by executable commands.
- Command rows expose stable item-type metadata, a command badge, source, and
  command id so navigation and actions are distinct but comparable.
- The panel copy and input label explicitly describe the command palette role.
- Coded coverage now verifies default command discovery, Enter activation for a
  default command, Enter activation for typed navigation, typed command
  activation, command filtering labels, plugin commands, focus restoration, and
  no horizontal overflow across desktop and compact viewports.

## Verification

- `node --check scripts/smoke-search-title-ui.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:search-title-ui`
- `git diff --check`
