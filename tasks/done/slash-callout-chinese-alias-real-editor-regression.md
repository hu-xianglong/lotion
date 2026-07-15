# Slash Callout Chinese Alias Real Editor Regression

Status: done

Split from `tasks/todo/ui-regression-lab-and-renderer-coverage.md` and
`tasks/todo/notion-core-parity-sequence.md` editor interaction coverage.

## Why

Callouts are one of the most visible Notion-like writing blocks, and Lotion has
had user-reported callout rendering regressions before. English `/callout` has
real editor coverage, but Chinese users should be able to type `/提示` and get
the same hidden-source callout preview, markdown persistence, continuation
behavior, and layout guarantees.

## Acceptance Criteria

- Slash command unit coverage asserts that the `/提示` alias resolves to
  Callout.
- Typing `/提示` in the real editor opens the slash menu and selects the
  Callout command.
- Committing the command removes the localized slash query, keeps editor focus,
  and lets the user type callout body text immediately.
- The callout persists as `lotion-callout` fenced markdown, renders as a
  callout without source leakage after cursor leaves it, following text lands
  after the fence, and the page stays layout-safe across desktop and compact
  viewports.

## Backend Tests

No backend service changes are expected. This task adds shared slash command
lookup coverage plus real renderer/editor smoke coverage.

## Changes

- Added slash-command unit coverage that verifies the Chinese `提示` query
  resolves to the Callout command.
- Parameterized the real editor callout smoke so it can exercise localized
  slash commands without duplicating the English path.
- Added desktop and compact UI smoke coverage for `/提示`, including localized
  menu selection, slash query cleanup, `lotion-callout` markdown persistence,
  hidden-source preview rendering, continuation after the fence, and layout
  overflow checks.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `node scripts/test-slash-commands.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
