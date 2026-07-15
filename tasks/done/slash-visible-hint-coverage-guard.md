# Slash Visible Hint Coverage Guard

Status: done

## Source

- Split from `tasks/todo/ui-regression-lab-and-renderer-coverage.md`.
- Follow-up from item 442, where a visible slash-menu hint (`链接`) no longer
  mapped to the base URL link command because the same Chinese query was also
  used for internal page links.

## Problem

The editor slash menu has many localized visible hints. Individual smoke tests
  cover specific commands, but there is no broad guard that every base command's
  visible hint can be typed and resolves back to the same command. This lets
  copy/UI labels drift from command matching logic.

## Acceptance

- `scripts/test-slash-commands.mjs` asserts every non-empty visible base slash
  command hint resolves to that command as the top result.
- Dynamic page/database command aliases remain covered separately.
- No product behavior changes unless the guard exposes another mismatch.

## Verification

- `npm run test:slash`
- `npm run typecheck`
- `git diff --check`

No backend or Electron UI smoke was added for this item because the change is a
focused test guard over existing slash command matching behavior; no product UI,
data model, service, or persistence code changed.
