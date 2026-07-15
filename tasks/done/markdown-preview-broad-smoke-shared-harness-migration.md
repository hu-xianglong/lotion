# Markdown Preview Broad Smoke Shared Harness Migration

Status: done

## Scope

Move the broad markdown preview smoke onto the shared Electron UI harness so
the highest-risk markdown rendering regressions use deterministic app
lifecycle, cleanup, failure artifacts, and desktop plus compact viewport
coverage.

## Acceptance

- Use `withLotionUIHarness` instead of hand-rolled CDP lifecycle logic.
- Preserve the broad markdown preview fixture and assertions for emphasis,
  strikethrough, imported single-tilde strikethrough, escaped link labels,
  decoded long URL labels, Notion colors, callout preview/source hiding, image
  edit-source hover/focus behavior, iframe preview, toggle preview, equation
  preview, rendered table editing, raw markdown toggle stability, and raw-mode
  modifier-click link opening.
- Run the smoke across desktop and compact viewports.
- Assert the editor remains visible and does not introduce document horizontal
  overflow at key states.
- Keep this as UI smoke coverage only; no renderer, parser, backend, or service
  behavior changes are expected.

## Gates

- `node --check scripts/smoke-markdown-preview-ui.mjs`
- `npm run typecheck`
- `npm run smoke:markdown-preview-ui`
- `git diff --check`

## Result

- Migrated `scripts/smoke-markdown-preview-ui.mjs` to
  `withLotionUIHarness`.
- Preserved broad markdown preview assertions for emphasis, strikethrough,
  imported single-tilde strikethrough, escaped link labels, decoded long URL
  labels, Notion colors, callout preview/source hiding, image edit-source
  hover/focus behavior, iframe preview, toggle preview, equation preview,
  rendered table editing, raw markdown toggle stability, and raw-mode
  modifier-click link opening.
- Ran the smoke across desktop and compact viewports.
- Added no-horizontal-overflow and editor viewport intersection assertions.
- Adapted the smoke to CodeMirror virtual rendering by scrolling before
  sampling lower-page widgets and links instead of assuming every line is
  mounted at once.
- This change only updates UI smoke harness coverage; renderer, parser,
  backend, and service behavior were not changed, so lower-level tests were
  not applicable.
