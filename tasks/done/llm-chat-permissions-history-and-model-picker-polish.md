# LLM Chat Permissions, History, and Model Picker Polish

Status: done

## Scope

- Replace the single LLM write-tools toggle with per-tool permission checkboxes in the LLM settings UI.
- Default all available workspace tools to enabled, while still letting the user disable individual tools.
- Let the chat window choose provider/model directly without forcing users back into settings.
- Persist LLM chat transcript history as JSONL through a narrow plugin storage API rather than direct filesystem access.
- Redesign the chat modal as a product-quality Notion-like assistant surface, not just a wired test panel:
  - compact polished modal and refined visual hierarchy consistent with Lotion,
  - low-friction prompt composer with keyboard-friendly send/clear/focus behavior,
  - readable conversation history with restore behavior,
  - clear current-page/workspace context,
  - inline provider/model controls,
  - obvious tool/permission state,
  - useful empty, loading, error, and cleared states,
  - stable desktop and mobile-ish layout with no visual overlap.

## Tests

- Add/extend coded LLM Chat UI smoke coverage for the redesigned experience:
  - expected controls and context/permission state,
  - stable layout/geometry at desktop and mobile-ish widths,
  - no horizontal overflow or clipped primary actions across desktop and compact viewports,
  - history restore,
  - model picker,
  - send loop,
  - disabled/loading state,
  - deterministic error state,
  - clear behavior,
  - keyboard send/focus behavior.
- Add package-core tests for settings normalization, tool filtering, and chat history persistence seams.

## Gates

- `npm run typecheck` passed.
- `npm exec -- tsc -p tsconfig.main.json` passed.
- `node --test test/package-core.test.mjs` passed.
- `npm run smoke:llm-chat-ui` passed.
- `git diff --check` passed.

## Result

- Added per-tool Lotion API permission settings for the LLM plugin, defaulting
  all current tools to enabled while allowing individual tools to be disabled.
- Added a narrow plugin JSONL storage API and persisted chat history under each
  workspace.
- Reworked LLM Chat into a polished assistant modal with history, current page
  context, inline provider/model controls, permission state, loading/error/empty
  states, keyboard send, and clear behavior.
- Strengthened coded coverage for LLM Chat desktop and compact layouts,
  transcript/history restore, model selection, JSONL persistence, disabled
  loading state, deterministic error state, keyboard send, and geometry overlap
  checks.
