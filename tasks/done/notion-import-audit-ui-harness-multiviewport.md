# Notion Import Audit UI Harness Multiviewport

Status: done

## Why

The Notion Import audit panel is one of the main ways to avoid manual import
spot-checking, but its smoke test still uses the older single-viewport CDP
script. User-facing import/audit UI should be covered by the shared harness and
desktop plus compact layouts.

## Scope

- Migrate `smoke-notion-import-ui` to the shared UI harness.
- Run the audit panel smoke across desktop/laptop and compact/narrow
  viewports.
- Keep the deterministic small Notion export/workspace fixture.
- Assert audit summary counts, path Open actions, and shell dry-run behavior.
- Add layout assertions for the audit panel/result:
  - no document horizontal overflow,
  - source row/options/results remain within the viewport,
  - result table/path actions remain visible and non-overlapping enough for
    keyboard/mouse users.

## Gates

- `npm run typecheck`
- `npm run smoke:notion-import-ui`
- `git diff --check`

## Result

- Migrated `smoke-notion-import-ui` to the shared UI harness so it gets app
  lifecycle, cleanup, and failure artifacts consistently.
- Parameterized the Notion Import audit smoke across desktop and compact
  viewports with isolated source/workspace fixtures per viewport.
- Added layout assertions for the audit panel before running and the result
  panel after running, including horizontal overflow checks and viewport bounds
  for source input, options, summary, success state, and path Open actions.
- Kept deterministic audit assertions for source CSV/HTML counts, imported
  mapping counts, issue/warning counts, and shell-open dry-run requests.
- Fixed the Notion Import audit panel to scroll the completed result into view
  automatically, so users do not need to hunt for the audit result after
  clicking Run audit.

Verified:

- `npm run typecheck`
- `npm run smoke:notion-import-ui`
