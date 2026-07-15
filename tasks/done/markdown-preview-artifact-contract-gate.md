# Markdown Preview Artifact Contract Gate

Queue item: 553
Status: done

## Why

Markdown live preview has repeatedly regressed around callouts, source fences,
image source visibility, missing embedded database diagnostics, links,
strikethrough/emphasis, and editable widgets. The smoke already asserts those
behaviors, but its aggregate artifact does not expose a compact contract that
CI and future UI regression lanes can validate quickly.

## Scope

- Add a reusable Markdown preview artifact contract helper.
- Attach the contract to `smoke-markdown-preview-ui` results.
- Cover the contract with unit tests for both passing and missing-widget cases.
- Keep this as test infrastructure plus any minimal gate-stability fixes
  revealed by the focused smoke.

## Acceptance

- The contract validates desktop and compact viewport coverage.
- Each viewport records initial/widgets screenshots with non-empty image files.
- The contract asserts high-risk previews are present and source fences remain
  hidden by default: callout, image, missing database diagnostic, iframe,
  toggle, equation, table, task checkbox, raw mode toggle, and link rendering.
- Aggregate UI suite manifests include a summarized Markdown preview contract.

## Verification

- `node --check scripts/lib/markdown-preview-artifacts.mjs`
- `node --check scripts/smoke-markdown-preview-ui.mjs`
- `node --check scripts/smoke-search-title-ui.mjs`
- `node --check scripts/ui-harness.mjs`
- `node --test test/ui-harness-artifacts.test.mjs`
- `npm run smoke:markdown-preview-ui`
  - Artifact: `artifacts/ui-smoke/markdown-preview-ui-2026-06-16T17-23-49-564Z/harness-result.json`
- `LOTION_UI_SUITE_FILTER=markdown-preview-ui node scripts/smoke-ui-suite.mjs`
  - Artifact: `artifacts/ui-smoke/ui-suite-2026-06-16T17-24-52-479Z/harness-result.json`
- `npm run smoke:search-title-ui`
  - Artifact: `artifacts/ui-smoke/search-title-2026-06-16T17-38-20-023Z/harness-result.json`
- `npm run test:ui-regression`
  - Artifact: `artifacts/ui-smoke/ui-suite-2026-06-16T17-39-42-725Z/harness-result.json`
- `npm run typecheck`
- `git diff --check`

## Notes

- The aggregate UI regression lane exposed a pre-existing search-title smoke
  race: keyboard navigation could begin before debounced command search results
  had settled. The smoke now focuses the search input explicitly and waits for
  the search progress state to leave loading before arrow-key navigation.
