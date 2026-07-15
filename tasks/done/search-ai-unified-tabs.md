# Search And AI Unified Tabs

Status: done

Decision state: ready

## Why

Search and LLM Chat are part of the same daily knowledge workflow. Treating
Advanced Search as a standalone plugin page makes the product feel fragmented:
users should search normally, switch to advanced/vector results when useful,
and ask AI about the same result set without changing mental context.

The accepted frontend direction is captured in the local design artifact:

- `artifacts/design/llm-chat-advanced-search-frontend-mockup.html`

## Scope

- Create a unified `Search & AI` workspace surface.
  - Expose `Search` and `LLM Chat` as sibling tabs inside that surface.
  - Keep `Search & AI` as the single sidebar/workspace entry rather than
    separate Advanced Search and LLM Chat entries.
- Integrate Advanced Search into the normal Search tab.
  - Keep normal keyword/page/database result tabs.
  - Add an `Advanced` results tab for semantic/vector results.
  - Show Advanced index state compactly without making indexing the main
    workflow.
- Move Advanced Search configuration into `Search & AI Settings`.
  - Provider/model, LanceDB/vector-store, indexed content, rebuild policy,
    rebuild progress, privacy, and index health live in settings.
  - Manual rebuild remains available there for repair or after large imports.
- Make LLM Chat use the same indexed/search source model.
  - Chat citations and source cards should open/search against the same result
    surfaces.
  - "Ask AI from results" should carry selected Search/Advanced results into
    the chat tab.
  - Editing actions must stay preview-and-confirm before apply.
- Preserve existing saved settings and chat/index storage formats unless a
  narrow migration is required.

## Out Of Scope

- Changing the embedding provider decision.
- Replacing LanceDB/Qwen3 backend behavior.
- Building a full external telemetry or analytics dashboard.
- Expanding agent write permissions beyond preview-and-confirm edits.

## Acceptance

- Sidebar/workspace navigation presents one `Search & AI` entry for this
  workflow.
- The `Search & AI` page has stable `Search` and `LLM Chat` tabs.
- The Search tab includes an `Advanced` result tab, not a separate Advanced
  Search page.
- Advanced Search settings are reachable from the Search surface and live in a
  settings view, not in the daily results UI.
- LLM Chat can consume selected search results and displays citations/source
  cards that can return to the Search surface.
- Desktop and compact layouts have no overlapping text, clipped controls, or
  horizontal overflow.

## Gates

- Search title / global search focused UI smoke.
- Advanced Search UI smoke updated for the Search tab.
- LLM Chat UI smoke updated for the sibling tab.
- Renderer component coverage for `Search & AI` tab state and settings entry.
- `npm run typecheck`
- `npm run build`
- `git diff --check`

## Result

- Added a unified `Search & AI` sidebar entry and hid the separate Advanced
  Search / LLM Chat sidebar entries while preserving their commands.
- Added a Search & AI surface with Search and LLM Chat sibling tabs.
- Added lexical result tabs plus an Advanced tab that links to Advanced Search
  results and settings from the same workflow.
- Updated Advanced Search and LLM Chat smokes to enter through Search & AI.
- Added a focused multi-viewport `smoke:search-ai-ui` regression covering the
  unified entry, Search tab, Advanced tab, selected-source handoff, LLM Chat tab,
  focusability, snapshots, and no horizontal overflow.

## Verification

- `node --check scripts/smoke-search-ai-ui.mjs`
- `node --check scripts/smoke-advanced-search-ui.mjs`
- `node --check scripts/smoke-llm-chat-ui.mjs`
- `npm run test:renderer-components`
- `npm run smoke:search-ai-ui`
- `npm run smoke:advanced-search-ui`
- `npm run smoke:llm-chat-ui`
- `npm run smoke:search-title-ui`
- `npm run typecheck`
- `npm run build` (passes; Vite still warns Node 20.18.1 is below 20.19+ and
  the renderer chunk exceeds 500 kB)
- `git diff --check`
