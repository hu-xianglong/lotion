# LLM chat shared harness migration

## Goal

Move the LLM Chat UI smoke onto the shared UI harness so the assistant surface is
covered with deterministic app lifecycle, workspace cleanup, failure artifacts,
and multiple viewport sizes.

## Acceptance

- `scripts/smoke-llm-chat-ui.mjs` uses `withLotionUIHarness` instead of
  hand-rolled CDP connection, workspace restore, and temp cleanup.
- The smoke runs against desktop and compact viewport presets with isolated
  fixture workspaces.
- Each viewport continues to verify:
  - the sidebar `LLM Chat` entry is discoverable,
  - the modal opens with current-page context, provider/model controls,
    permissions state, empty state, status, composer, Send, and Clear controls,
  - prompt submission shows user and assistant messages through the deterministic
    debug provider hook,
  - loading disables controls and ready state re-enables them,
  - chat history JSONL persists and can restore the transcript,
  - deterministic error and clear flows render correctly,
  - the chat layout does not overlap at normal and compact widths.
- The visible chat UI has no horizontal document overflow across tested
  viewports.

## Backend Coverage

This item migrates an existing UI smoke to the shared UI infrastructure and does
not change the LLM provider, plugin transport, JSONL persistence, or tool
filtering behavior. Existing package-core/plugin tests cover those lower layers,
so new backend tests are not applicable.

## Gates

- `node --check scripts/smoke-llm-chat-ui.mjs`
- `npm run typecheck`
- `npm run smoke:llm-chat-ui`
- `git diff --check`

## Result

- Migrated `scripts/smoke-llm-chat-ui.mjs` to `withLotionUIHarness`.
- The smoke now runs through desktop and compact viewport presets with isolated
  fixture workspaces.
- Preserved sidebar discovery, modal state, provider/model/permission controls,
  deterministic send loop, disabled/loading behavior, JSONL history restore,
  error flow, clear flow, and layout overlap assertions.
- Added document horizontal overflow assertions for the page, modal,
  interaction, and mobile-ish layout states.

## Verified

- `node --check scripts/smoke-llm-chat-ui.mjs`
- `npm run typecheck`
- `npm run smoke:llm-chat-ui` (desktop + compact)
- `git diff --check`
