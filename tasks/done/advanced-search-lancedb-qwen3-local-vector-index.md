# Advanced Search LanceDB And Qwen3 Local Embedding

Status: done

## Why

Advanced Search currently uses a custom JSON vector index and deterministic
local hash embeddings. That is useful for zero-cost testing, but it is not a
strong long-term semantic search foundation. The next iteration should evaluate
a mature local vector store and a real local embedding model while preserving
Lotion's privacy and cost boundaries.

## Decision

- Use LanceDB as the first vector-store candidate.
- Use Qwen3-Embedding-0.6B through Ollama as the default high-quality local
  embedding provider candidate.
- Keep the existing deterministic local embedding path as a test/fallback mode.
- Do not treat DeepSeek as an embedding provider. DeepSeek remains a generation
  model for LLM Chat unless a documented embedding API exists later.
- Start with manual full rebuild, then add stale detection. Idle incremental
  local indexing is a follow-up after the POC is stable.
- External/cloud embedding providers must never rebuild automatically by
  default.

## Scope

- Add a vector index adapter boundary so Advanced Search is not hard-wired to
  one storage implementation.
- Build a LanceDB-backed adapter proof of concept for workspace chunks.
- Add an Ollama embedding provider adapter for `qwen3-embedding:0.6b`.
- Detect Ollama availability and missing model state with actionable UI copy.
- Preserve current Advanced Search coverage for pages, databases, and row
  pages.
- Persist metadata needed to open results, filter by entity kind, and merge
  with normal keyword search.
- Preserve stable source metadata for later AI Q&A citations, including page,
  database, row-page, field/property, and chunk identity where available.
- Keep manual `Rebuild index` for the first implementation.
- Mark the index stale when workspace content changes instead of silently
  running embeddings.
- Show rebuild status with chunk count, local provider name, and elapsed time.
- Keep external provider support explicit and opt-in only.

## Product Behavior

- Default local quality mode should be labeled clearly, for example:
  `Qwen3 local semantic index`.
- The UI should explain that workspace content stays on this device when using
  Ollama.
- If Ollama is not running, show setup guidance rather than a generic failure.
- If `qwen3-embedding:0.6b` is missing, show the exact model pull command.
- If the index is stale, searches should still work against the old index and
  show an `Update index` affordance.
- Advanced Search should continue to feel search-first; provider and vector
  storage details belong in advanced/settings UI, not ahead of the query box.
- Search results should be structured enough that the assistant can later cite
  the same sources without reparsing display-only UI text.

## Indexing Strategy

- First slice: manual full rebuild only.
- Content changes: mark stale.
- Search while stale: return existing results with a clear stale indicator.
- Later slice: automatic local incremental indexing when the app is idle.
- External embeddings: manual rebuild with explicit confirmation only.

## Benchmark Targets

Measure at minimum:

- Electron packaging/build compatibility with LanceDB native dependencies.
- Index size for 10k and 100k chunks.
- Full rebuild time for 10k and 100k chunks with Qwen3-Embedding-0.6B.
- Query latency for vector-only and hybrid search.
- Memory usage during rebuild and query.
- Result quality on a mixed Chinese/English/code workspace fixture.
- Metadata filter behavior for page, database, and row-page results.

## Acceptance

- Advanced Search can build and query a LanceDB-backed local index.
- Qwen3-Embedding-0.6B via Ollama can embed workspace chunks and queries.
- Missing Ollama or missing model states are handled with useful UI messages.
- The old deterministic embedding mode remains available for tests/fallback.
- Manual rebuild produces a ready index with page, database, and row-page hits.
- Search hits expose stable source labels and open targets suitable for future
  assistant citations.
- Stale index state is visible after content changes.
- No external provider is called without explicit configuration and rebuild.
- Benchmarks record index size, rebuild time, query latency, and memory for at
  least 10k chunks.

## Gates

- Package/core tests for vector adapter behavior and stale-index semantics.
- Advanced Search service tests using deterministic embeddings.
- Ollama provider tests with mocked `/api/embed` responses.
- UI smoke for missing Ollama, missing model, rebuild progress, stale state,
  and query results.
- Benchmark script for 10k chunk rebuild/query latency.
- `npm run typecheck`
- `git diff --check`

## Result

- Added a plugin-owned Advanced Search provider boundary with local hash,
  Ollama `/api/embed`, OpenAI-compatible `/embeddings`, JSON vector storage,
  and LanceDB vector storage adapters.
- Defaulted the UI to `Qwen3 local semantic index` through Ollama with clear
  local privacy/setup copy and explicit fallback/provider controls.
- Added deterministic UI smoke coverage for missing Ollama, missing model,
  stale index, rebuild/results, page/database/row-page navigation, external
  provider errors, and the renderer-side LanceDB adapter error across desktop
  and compact viewports.
- Added package-core coverage for Ollama `/api/embed` request shape, missing
  model/rate/error handling, JSON vector adapter behavior, and a real LanceDB
  adapter query path.
- Added a 10k+ chunk benchmark gate. Latest check indexed 19,182 chunks:
  JSON rebuild 1.52s/query 48ms, LanceDB rebuild 2.57s/query 26ms, RSS delta
  594 MB.

## Verification

- `node --check scripts/smoke-advanced-search-ui.mjs`
- `npm run smoke:advanced-search-ui`
- `npm run typecheck`
- `npm exec -- tsc -p tsconfig.main.json && node --test --test-name-pattern "advanced search" test/package-core.test.mjs`
- `npm run test:renderer-components`
- `npm run benchmark:advanced-search-index -- --check`
- `git diff --check`
