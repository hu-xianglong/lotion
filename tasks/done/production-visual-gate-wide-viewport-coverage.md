# Production visual gate wide viewport coverage

## Status

Done.

## Context

The production visual gate covered critical Search/AI-adjacent surfaces, but its
default viewport set only ran desktop and compact. The production UI quality
backlog explicitly calls out wide layout coverage, and several Lotion surfaces
have historically regressed when the content canvas, side panels, and modals had
extra horizontal room.

## Acceptance

- The production visual gate defaults to desktop, compact, and wide viewport
  coverage without changing the default viewport set for every focused smoke.
- The production visual artifact contract fails when a required critical
  surface lacks wide screenshot evidence.
- Release/test artifact expectations and docs describe the expanded default
  viewport set.
- Production critical smokes pass their actual selected viewport names into
  artifact contracts so wide evidence is machine-checkable.

## Implementation Notes

- Added production-only viewport defaults:
  `desktop,compact,wide:1728x1100`.
- Updated the production visual contract to require `desktop`, `compact`, and
  `wide` screenshots for every required surface.
- Updated Notion Import, Search & AI, LLM Chat, Plugin Manager, and Settings
  Center smokes to pass the actual selected viewport names into their artifact
  contracts.
- Updated release artifact fixture expectations and testing docs to include the
  expanded production visual viewport set.

## Verification

- [x] `node --check scripts/smoke-notion-import-ui.mjs && node --check scripts/smoke-search-ai-ui.mjs && node --check scripts/smoke-llm-chat-ui.mjs && node --check scripts/smoke-plugin-manager-ui.mjs && node --check scripts/smoke-settings-center-ui.mjs`
- [x] `node --test --test-name-pattern "production visual" test/ui-harness-artifacts.test.mjs`
- [x] `node --test --test-name-pattern "release UI artifact collection indexes production visual gate results" test/test-release.test.mjs`
- [x] `npm run typecheck`
- [x] `npm run test:production-visual`
  - Artifact: `artifacts/ui-smoke/ui-suite-2026-06-17T21-45-50-101Z`
  - Required viewport names: `desktop`, `compact`, `wide`
  - Required suites: 9
  - Screenshot count: 33
- [x] `git diff --check`
