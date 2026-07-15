# Bug: Imported Notion toggle is broken on 2022 parents vision check page

Status: done

## Priority

High

## Context

The imported Notion page `Family Vision Check` has a toggle-related rendering or
interaction bug.

Workspace:

`$HOME/Documents/Lotion Workspaces/Notion Import`

Observed page title:

`Family Vision Check`

This should be treated as a real imported-content regression, not just a generic
toggle editor issue. Existing toggle regressions cover creation/editing paths,
but this page may expose an import-specific shape or nested content case.

## Expected behavior

Imported Notion toggle blocks on this page should render and behave like normal
Lotion toggle blocks:

- Toggle disclosure control is visible and clickable.
- Expanding/collapsing does not corrupt layout or hide unrelated content.
- Toggle summary/body preserve imported Chinese text and nested content.
- Page remains editable after interacting with the toggle.
- Reloading the page preserves the same rendered toggle state/content.

## Acceptance criteria

- [x] Reproduce the bug on `Family Vision Check` in the `Notion Import` workspace.
- [x] Identify the underlying imported Markdown/HTML shape that breaks the toggle.
- [x] Fix the renderer/import normalization so this page works.
- [x] Add focused regression coverage using the smallest fixture that represents
  the broken imported toggle shape.
- [x] Include a screenshot artifact of the fixed page section.
- [x] Run focused toggle/import UI smoke plus typecheck before moving to done.

## Result

The current user workspace is stale: `2022 Sample Journal` still links to the original
URL-encoded Notion export path for `Family Vision Check`, and the target page hash
`aaaaaaaa111122223333444455556666` is missing from that imported workspace.
The original Notion export contains a bare `<details open><summary>收据</summary>`
block with nested receipt content.

The importer path now has a regression fixture for that exact shape:

- parent page link to `Family Vision Check aaaaaaaa111122223333444455556666.html`
- nested standalone page import with bare Notion `<details>`
- `lotion-toggle` Markdown output preserving summary, open state, nested receipt
  image Markdown, Chinese body text, and the following log table
- parent link rewritten to the generated Lotion page body path instead of the
  original Notion export path

Renderer/UI coverage now also exercises an imported Notion-style toggle in the
shared markdown preview smoke at desktop and compact viewports. The smoke asserts
editable summary/body controls, disclosure visibility, preserved nested image
Markdown/body text, collapse/expand behavior, no horizontal overflow, and writes
imported-toggle screenshot artifacts.

Latest artifact:

`artifacts/ui-smoke/markdown-preview-ui-2026-06-17T20-29-35-062Z`

## Verification

- `node --check scripts/smoke-markdown-preview-ui.mjs`
- `node --check scripts/lib/markdown-preview-artifacts.mjs`
- `node --check scripts/test-notion-import-service.mjs`
- `npm exec -- tsc -p tsconfig.main.json`
- `node scripts/test-notion-import-service.mjs`
- `npm run typecheck`
- `npm run smoke:markdown-preview-ui`
- `git diff --check`

## Follow-up

The existing `Notion Import` workspace needs to be reimported to materialize the
missing nested page in that local data set. This task added regression coverage
so future imports keep the nested toggle page and its parent link intact.
