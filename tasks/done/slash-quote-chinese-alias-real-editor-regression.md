# Slash Quote Chinese Alias Real Editor Regression

Status: done

Split from `tasks/todo/ui-regression-lab-and-renderer-coverage.md` and
`tasks/todo/notion-core-parity-sequence.md` editor interaction coverage.

## Why

Quote blocks are part of the Notion-like writing surface and imported Markdown
fidelity. The English `/quote` path has real editor coverage, but localized
users should be able to type `/引用` and get the same editable blockquote,
markdown persistence, continuation typing, and layout guarantees.

## Acceptance Criteria

- Slash command unit coverage asserts that the `/引用` alias resolves to Quote.
- Typing `/引用` in the real editor opens the slash menu and selects the Quote
  command.
- Committing the command removes the localized slash query, keeps editor focus,
  and lets the user type quote text immediately.
- The inserted text persists as blockquote markdown, renders as a blockquote
  preview, exits cleanly for subsequent plain text, and stays layout-safe across
  desktop and compact viewports.

## Backend Tests

No backend service changes are expected. This task adds shared slash command
lookup coverage plus real renderer/editor smoke coverage.

## Changes

- Added slash-command unit coverage that verifies the Chinese `引用` alias
  resolves to the Quote command.
- Parameterized the real editor quote smoke and added `/引用` across desktop
  and compact viewports.
- Made the quote smoke start from a clean paragraph line even after CodeMirror
  auto-continues a blockquote, so quote-specific state cannot mask later slash
  command behavior.
- Verified the localized quote command selection, slash query cleanup,
  blockquote markdown persistence, rendered blockquote preview, continuation
  typing, editor focus, and layout safety.

## Verification

- [x] `node --check scripts/smoke-editor-regression-ui.mjs`
- [x] `node scripts/test-slash-commands.mjs`
- [x] `npm run test:renderer-components`
- [x] `npm run typecheck`
- [x] `npm run smoke:editor-regression-ui`
- [x] `git diff --check`
