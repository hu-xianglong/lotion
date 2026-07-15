# Markdown Preview Multiviewport Emphasis Regression

Status: done

## Scope

Add a focused shared-harness UI smoke for the local editor live preview around
fragile Notion-like markdown rendering: literal `[WIP]` text must not become a
link, nested single-tilde imported strikethrough must not leak markers, bold and
italic markers should collapse into styled text, and long URL labels should be
decoded once while preserving the encoded destination.

This is a first small slice toward migrating the larger legacy markdown preview
smoke into the production UI harness. Keep the fixture small and deterministic.

## Acceptance

- Run through the shared UI harness across desktop and compact viewports.
- Open a deterministic markdown page fixture.
- Assert no horizontal overflow and that the editor/content stays within the
  viewport.
- Assert concrete DOM state for WIP, bold, italic, strikethrough, nested
  strikethrough/bold, and decoded long-link rendering.
- Keep this UI-only; no backend/service tests are expected unless product code
  changes.

## Gates

- `npm run typecheck`
- `npm run smoke:markdown-preview-harness-ui`
- `git diff --check`

## Result

- Added `scripts/smoke-markdown-preview-harness-ui.mjs` and
  `npm run smoke:markdown-preview-harness-ui`.
- The smoke uses the shared UI harness across desktop and compact viewports,
  with a small deterministic page fixture.
- Covered literal `[WIP]`, bold, italic, double-tilde strikethrough, imported
  single-tilde strikethrough containing nested bold, decoded long-link labels,
  encoded link destinations, and basic no-overflow/viewport geometry.
- Backend tests were not added because this item only adds renderer UI
  regression coverage and does not change parsing, storage, or service
  behavior.
