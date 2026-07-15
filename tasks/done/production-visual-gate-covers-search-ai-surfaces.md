# Production visual gate covers Search AI surfaces

## Status

Done.

## Context

The first production visual gate slice focused on the most recent fragile
surfaces: Notion Import, Markdown preview, embedded views, and row-page
properties. The release-critical UI gate now also covers Search & AI, LLM Chat,
Plugin Manager, Settings Center, and Advanced Search by default.

## Acceptance

- The default production visual gate filter includes Notion Import, Markdown
  preview, embedded views, row-page properties, Search & AI, LLM Chat, Plugin
  Manager, Settings Center, and Advanced Search UI smokes.
- The required-suite contract matches that expanded default filter, so the gate
  fails if a critical surface is absent from the artifact index.
- Focused artifact-contract unit coverage proves the expanded list passes with
  screenshot/detail evidence and tolerates the reload-timeout path used by
  slower Electron starts.
- Production visual docs describe the expanded Search & AI / AI-adjacent
  critical surfaces.

## Implementation Notes

- Expanded `DEFAULT_PRODUCTION_VISUAL_SCRIPTS` and the default production visual
  filter to include all nine critical UI surfaces.
- Preserved representative screenshot/metadata paths for aggregated LLM Chat and
  Advanced Search artifacts so the release gate can audit them like the other
  multi-viewport suites.
- Expanded UI artifact summaries to keep richer Search & AI / LLM / Advanced
  Search evidence fields.
- Made workspace reload handling tolerate Playwright reload navigation timeouts
  while still waiting for the Lotion workspace bridge before continuing.

## Verification

- [x] `node --test --test-name-pattern "Advanced Search artifact contract validates|LLM Chat artifact contract validates|result manifests|production visual|workspace reload" test/ui-harness-artifacts.test.mjs`
- [x] `npm run typecheck`
- [x] `npm run test:production-visual`
  - Artifact: `artifacts/ui-smoke/ui-suite-2026-06-17T21-33-05-953Z`
- [x] `git diff --check`
