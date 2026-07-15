# LLM Chat Visual Design Polish

Status: done

## Why

LLM Chat is now functionally capable, but the page/assistant surface still feels
visually rough: too many controls compete with the conversation, history/tool
state looks heavy, and the composer/transcript hierarchy does not yet feel like
a polished Notion-style assistant.

## Scope

- Redesign the LLM Chat page/assistant visual hierarchy.
- Make conversation the primary surface:
  - quieter history rail;
  - compact context/provider/tool-mode summary;
  - clearer current context state;
  - cleaner transcript spacing and message bubbles;
  - source citations that look like useful references, not debug output.
- Improve the composer:
  - stronger input affordance;
  - visible send/stop/loading states;
  - quick actions that feel integrated rather than pill clutter;
  - better disabled/error states.
- Improve tool activity:
  - group tool events into a compact activity strip or collapsible detail;
  - distinguish reading, searching, proposing writes, and completed actions.
- Improve write preview/diff presentation:
  - make apply/copy/discard visually clear;
  - keep dangerous replacement actions visually distinct.
- Move durable settings out of the chat surface:
  - provider credentials, default provider/model, base URLs, and tool
    permissions belong in a dedicated LLM settings view;
  - the chat surface may keep a compact current-model/context indicator and a
    Settings affordance, but should not read as a configuration form.
- Ensure the assistant panel feels stable next to the page editor and does not
  crowd or obscure page content.

## Out Of Scope

- Adding new LLM tools.
- Changing provider/model semantics.
- Removing ask-before-editing safeguards.
- Autonomous background agents.
- Full chat markdown renderer replacement unless needed for layout polish.

## Acceptance

- LLM Chat feels like a first-class workspace assistant rather than a plugin
  modal.
- Conversation, context, source citations, tool activity, and write previews
  have clear visual hierarchy.
- Provider/model/API-key/tool permission settings live in a separate settings
  view; the chat page remains focused on conversation and actions.
- Desktop and compact layouts have no overlap, clipped controls, or horizontal
  overflow.
- Keyboard send/focus behavior remains intact.
- Existing mocked tool-call and source-cited Q&A tests continue to pass.

## Gates

- Passed `node --check scripts/smoke-llm-chat-ui.mjs`.
- Passed `npm run test:renderer-components`.
- Passed `npm run smoke:llm-chat-ui`.
  - Artifact:
    `artifacts/ui-smoke/llm-chat-ui-2026-06-16T22-58-04-940Z/`
  - Covered desktop and compact assistant surfaces for empty, conversation,
    source-cited Q&A, write preview, error, and command-open flows.
- Passed `npm exec -- tsc -p tsconfig.main.json && node --test
  test/package-core.test.mjs`.
- Passed `npm run typecheck`.
- Passed `git diff --check`.

## Result

- Added a stable LLM Chat visual contract and test IDs for surface, history,
  toolbar, quick actions, activity, transcript, and composer regions.
- Polished the assistant panel visual hierarchy around a quieter white history
  rail, integrated quick actions, compact tool activity, clearer source cards,
  stronger composer focus affordance, and a primary Send action.
- Strengthened renderer and Electron UI coverage so the smoke now asserts
  polished visual contract, light surfaces, no overlap/overflow, desktop and
  compact geometry, history restore, source navigation, write preview, error,
  and keyboard send/clear behavior.
