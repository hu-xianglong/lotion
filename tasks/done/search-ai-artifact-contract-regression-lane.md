# Search & AI Artifact Contract And Regression Lane

Status: done

Queue item: 596

Backlog source: `tasks/todo/ui-regression-lab-and-renderer-coverage.md`.

## Why

The unified Search & AI surface is a user-facing navigation and assistant entry
point, but its smoke was not part of the aggregate UI regression suite and did
not publish a machine-readable artifact contract. Its snapshot call also used a
nonexistent `label` option, so desktop and compact screenshots were not named
independently.

## Acceptance

- Add a Search & AI artifact contract that requires desktop and compact
  viewport evidence.
- The contract verifies unified Search & AI sidebar entry behavior, search
  result evidence, Advanced Search tab controls, LLM Chat tab controls, selected
  source context, and screenshot/metadata files.
- Fix Search & AI snapshot names so desktop and compact artifacts are distinct.
- Include Search & AI in the aggregate UI suite and focused UI regression gate.
- Keep this scoped to UI harness/regression coverage; no product behavior
  changes.

## Verification

- `node --check scripts/lib/search-ai-artifacts.mjs` - passed
- `node --check scripts/smoke-search-ai-ui.mjs` - passed
- `node --check scripts/smoke-ui-suite.mjs` - passed
- `node --test test/ui-harness-artifacts.test.mjs` - passed
- `npm run smoke:search-ai-ui` - passed
  - Artifact: `artifacts/ui-smoke/search-ai-ui-2026-06-17T15-01-05-832Z/harness-result.json`
- `LOTION_UI_SUITE_FILTER=search-ai npm run smoke:ui` - passed
  - Artifact index: `artifacts/ui-smoke/ui-suite-2026-06-17T15-02-00-597Z/ui-suite-artifacts.json`
  - Report: `artifacts/ui-smoke/ui-suite-2026-06-17T15-02-00-597Z/ui-suite-artifacts.md`
- `npm run typecheck` - passed
- `git diff --check`

## Result

- Added `assertSearchAiArtifactContract` for the unified Search & AI surface.
- Fixed the Search & AI smoke to name desktop and compact snapshots separately.
- The smoke now records search results, Advanced Search state, LLM Chat selected
  source state, and screenshot metadata in the contract.
- Added Search & AI to the aggregate UI suite and `test:ui-regression` filter.
- No backend/service tests are applicable because this item only adds UI harness
  coverage and smoke artifact validation.
