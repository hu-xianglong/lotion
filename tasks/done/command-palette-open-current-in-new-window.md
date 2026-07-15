# Command Palette Open Current Item In New Window

Status: done

## Source

Split from `tasks/todo/notion-core-parity-sequence.md`:

- Richer command palette workflows beyond basic plugin command execution.

## Scope

Expose the existing current-item pop-out action through the global command
palette so users can open the active page/database in a new window without
finding the tab or page menu affordance.

Keep this as a renderer/search-panel slice. Reuse the existing
`openActiveInNewWindow` action and do not change workspace data or page
persistence behavior.

## Tests

- Extend renderer component coverage for the new built-in command row,
  command count, and built-in source preview.
- Extend the shared multi-resolution search-title UI smoke:
  - discover the new-window command through Cmd-K/global search;
  - assert command badge, label, source preview, focus/layout, and no
    horizontal overflow at desktop and compact widths;
  - activate the command from an actual active page;
  - assert a new renderer window opens with the same page title while the
    original page remains active.

Backend/package-core tests are not applicable because this wires an existing
renderer action into an existing command surface and does not change data or
service behavior.

## Gates

- `node --check scripts/smoke-search-title-ui.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:search-title-ui`
- `git diff --check`

## Result

- Added the built-in command `lotion.open-current-in-new-window` with the
  visible title `在新窗口打开当前项目`.
- Reused the existing `openActiveInNewWindow` renderer action, so no data or
  service behavior changed.
- Extended renderer component coverage for command count, title, and built-in
  source preview.
- Extended the shared search-title UI smoke across desktop and compact
  viewports to discover and activate the command from an active page, assert a
  new renderer window opens with the same page title, assert the original page
  remains active, and check spawned/original window layout for overflow.

Verification passed:

- `node --check scripts/smoke-search-title-ui.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run smoke:search-title-ui`
- `git diff --check`
