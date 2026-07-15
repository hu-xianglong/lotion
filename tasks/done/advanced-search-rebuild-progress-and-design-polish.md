# Advanced Search Rebuild Progress And Design Polish

Status: done

## Why

The Advanced Search page now works, but the index rebuild flow still feels too
opaque: users only see short status text while a potentially slow local
embedding/index build is running. The page also still looks like a rough plugin
settings panel rather than a polished search product surface.

## Scope

- Add a clear rebuild progress surface for `Build/Rebuild index`.
- Show progress details while indexing:
  - current phase, for example collecting workspace content, embedding chunks,
    writing vector index, finalizing metadata;
  - current/total counts when known;
  - percent complete when total is known;
  - elapsed time;
  - provider/model and vector store being used;
  - last completed document/chunk summary when useful.
- Keep an indeterminate state for phases where total work is not known yet.
- Keep search usable against the previous index while a stale index exists.
- Make failure states actionable:
  - missing Ollama;
  - missing Qwen3 model;
  - external provider config missing;
  - rebuild interrupted or failed.
- Redesign the Advanced Search page layout:
  - search-first header and query area;
  - compact provider/index status summary;
  - advanced provider settings moved out of the main page into a dedicated
    settings surface;
  - the main page exposes a compact Settings affordance, not inline setup
    forms;
  - clearer empty, stale, rebuilding, ready, and error states;
  - result rows with stronger hierarchy, source metadata, score/context, and
    open target affordance.
- Dedicated Advanced Search settings should own provider/model/vector-store
  configuration, base URL/API-key inputs, privacy/cost copy, and model setup
  help. The search page should only show a read-only summary of those choices.
- Preserve the local-first privacy messaging without making the page feel like
  setup documentation.

## Out Of Scope

- Automatic idle incremental indexing.
- New embedding provider selection.
- Changing the LanceDB/Qwen3 decision.
- External/cloud embedding auto-rebuild.
- Replacing Advanced Search with LLM Chat Q&A.

## Acceptance

- Rebuilding the index shows visible progress beyond a single text message.
- Progress updates are stable and do not cause layout shift.
- Missing provider/model states are visually distinct from rebuild failures.
- The Advanced Search page reads as a polished search tool, not a raw settings
  form.
- Provider/model/vector-store settings are editable from a separate settings
  view, while the main search page stays focused on query, results, index
  status, and rebuild progress.
- Desktop and compact layouts have no overlap or horizontal overflow.
- Existing deterministic fallback mode and tests still work.

## Gates

- Advanced Search service/progress tests with deterministic embeddings.
- Advanced Search UI smoke covering rebuild progress, ready, stale, error, and
  results states.
- Renderer component coverage for progress and redesigned layout states.
- `npm run typecheck`
- `git diff --check`

## Verification

- `node --check scripts/smoke-advanced-search-ui.mjs`
- `npm run test:renderer-components`
- `node --test test/package-core.test.mjs`
- `npm run smoke:advanced-search-ui`
  - artifact: `artifacts/ui-smoke/advanced-search-ui-2026-06-16T22-13-10-207Z/harness-result.json`
  - viewports: desktop, compact
- `npm run typecheck`
- `git diff --check`
