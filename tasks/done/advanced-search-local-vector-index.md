# Advanced Search And Local Vector Index

Status: done

## Scope

Build Advanced Search as a built-in Lotion plugin that owns its local semantic
index and exposes a Notion-like Advanced Search mode in the UI. Do not attach
embedding/index work to Notion import; the plugin uses a small deterministic
local index by default and only rebuilds manually so importing a large Notion
export cannot accidentally spend provider calls.

Before implementation, verify the current DeepSeek API shape from primary
DeepSeek documentation or the configured provider assumptions. Use DeepSeek for
embeddings only if it exposes a stable embeddings-compatible endpoint/model. If
DeepSeek embeddings are unavailable or incompatible, make embedding provider,
base URL, and model configurable and record the blocker instead of hardcoding a
fake endpoint.

## Product Behavior

- Persist a local semantic index under the workspace's plugin storage.
- Deterministically chunk pages, databases, row pages, and imported content.
- Support incremental reindex when content changes.
- Provide a full rebuild action.
- Show stale-index, indexing, progress, empty, and error states.
- Keep storage privacy-aware and local by default; external embedding providers
  must be explicitly configured and triggered by a manual rebuild.
- Handle rate limits and provider failures cleanly.
- Prefer hybrid ranking with existing lexical search when practical.
- UI should feel Notion-like:
  - clear search mode toggle,
  - semantic result explanations/snippets,
  - source badges for page/database/row page,
  - keyboard navigation,
  - loading/progress states,
  - empty/error states,
  - no layout overlap.

## Tests

- Backend/package-core tests for chunking, index persistence, rebuild,
  incremental update, embedding adapter mocks, ranking, and error handling.
- Use small deterministic fixtures for provider/index tests; do not use the
  full Notion import dataset as the default test target.
- Coded UI smoke/regression tests for enabling advanced search, indexing state,
  semantic query results, navigation to page/database/row-page results,
  empty/error states, and keyboard behavior.

## Gates

- `npm run typecheck`
- `npm exec -- tsc -p tsconfig.main.json && node --test test/package-core.test.mjs`
- `npm run smoke:advanced-search-ui`
- `git diff --check`

## Result

- Implemented Advanced Search as a built-in plugin, not a Notion import step.
  The plugin owns its index in workspace plugin storage and only rebuilds when
  the user explicitly clicks `Rebuild index`.
- Added plugin storage JSON APIs so plugins can persist structured local state
  without direct filesystem access.
- Added deterministic local embeddings for offline development, predictable
  tests, and no provider cost by default.
- Added configurable OpenAI-compatible embedding settings. External embeddings
  require base URL, model, and API key; the UI blocks rebuild immediately when
  any required setting is missing so no accidental network call is made.
- Verified DeepSeek's official API reference currently documents Chat
  Completions and Models endpoints but does not confirm a stable embeddings
  endpoint/model. Because of that, DeepSeek is not hardcoded as an embeddings
  provider; users can configure a compatible `/embeddings` provider explicitly.
- Added package-core coverage for chunking, persisted index storage,
  incremental rebuild vector reuse, mocked embedding ranking, stale/error
  status, and provider configuration failure.
- Added multi-resolution UI smoke coverage for the Advanced Search plugin:
  sidebar discovery, local rebuild/progress, empty state, result snippets and
  source badges, page/database/row-page navigation, no horizontal overflow, and
  external provider error state.
