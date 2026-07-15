# Built-in Command Palette Navigation Actions

Status: done

## Source

Split from `tasks/todo/notion-core-parity-sequence.md`:

- Richer command palette workflows beyond basic plugin command execution.

## Scope

Add the first small set of built-in Lotion commands to global search so the
command palette is useful without relying on plugins:

- Create a page.
- Create a database.
- Open all pages.
- Open all databases.
- Open plugins.

Keep this as a renderer/search-panel slice. Do not change the search backend or
workspace data model.

## Tests

- Extend coded UI coverage in the shared search harness across desktop and
  compact viewports:
  - built-in commands appear in typed command search with command badges,
    source text, and no layout overflow;
  - command activation can open the all-pages management page;
  - command activation can create a new page and keep it visible in Recent.
- Add renderer/component coverage for the built-in command result copy if the
  rendered command result changes.

## Gates

- `node --check scripts/smoke-search-title-ui.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:search-title-ui`
- `git diff --check`

## Result

- Added built-in Lotion commands to global search:
  - `lotion.new-page`
  - `lotion.new-database`
  - `lotion.open-pages`
  - `lotion.open-databases`
  - `lotion.open-plugins`
- Kept plugin command indexing intact and renders built-in commands as
  `Lotion · 内置 · <id>`.
- Fixed `createPage()` so command-triggered page creation replaces the active
  tab with the new page instead of leaving the old management tab label visible.
- Extended renderer component coverage for built-in command result copy.
- Extended the shared search UI smoke across desktop and compact viewports to
  verify:
  - built-in command discovery and command badge/source text;
  - click activation opens All pages;
  - Enter activation creates a new page;
  - the created page is immediately first in Recent;
  - the search dialog remains within viewport bounds without horizontal
    overflow.
