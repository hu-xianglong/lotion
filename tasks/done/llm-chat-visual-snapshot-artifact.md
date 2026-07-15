# LLM Chat Visual Snapshot Artifact

Status: done

## Why

The LLM Chat smoke covers the prompt loop, history restore, provider/model
controls, permission state, errors, clear behavior, and geometry. It still
needed durable visual artifacts for reviewing whether the assistant modal feels
polished and Notion-like across desktop and compact viewports.

## Changes

- Extended the shared LLM Chat UI smoke to capture desktop and compact
  screenshots of representative modal states.
- Captured empty, successful conversation, and error states.
- Stored metadata with provider/model, permission state, status text, visible
  message counts, page identity, and layout geometry.
- Kept the existing interaction, history, keyboard, disabled-state, error,
  clear, mobile-ish geometry, and no-horizontal-overflow assertions.
- Did not change LLM transport, plugin storage, provider settings, or tool
  behavior in this item, so no backend/service tests were applicable.

## Verification

- `node --check scripts/smoke-llm-chat-ui.mjs`
- `npm run typecheck`
- `npm run smoke:llm-chat-ui`
- `git diff --check`

## Artifacts

The focused smoke generated desktop and compact PNG/JSON artifacts under:

- `artifacts/ui-smoke/llm-chat-ui-2026-06-12T17-04-00-448Z/snapshots/llm-chat-empty-desktop.png`
- `artifacts/ui-smoke/llm-chat-ui-2026-06-12T17-04-00-448Z/snapshots/llm-chat-conversation-desktop.png`
- `artifacts/ui-smoke/llm-chat-ui-2026-06-12T17-04-00-448Z/snapshots/llm-chat-error-desktop.png`
- `artifacts/ui-smoke/llm-chat-ui-2026-06-12T17-04-00-448Z/snapshots/llm-chat-empty-compact.png`
- `artifacts/ui-smoke/llm-chat-ui-2026-06-12T17-04-00-448Z/snapshots/llm-chat-conversation-compact.png`
- `artifacts/ui-smoke/llm-chat-ui-2026-06-12T17-04-00-448Z/snapshots/llm-chat-error-compact.png`
