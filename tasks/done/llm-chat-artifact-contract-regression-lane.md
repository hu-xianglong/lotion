# LLM Chat Artifact Contract And Regression Lane

Status: done

Queue item: 570

## Goal

Make the LLM Chat UI smoke publish a reusable artifact contract and include it
in the focused UI regression lane. LLM Chat is a user-facing assistant surface,
so the regression gate should validate more than a manual-visible smoke log:
desktop and compact screenshots, model/provider/permission controls, empty
state, prompt loop, history restore, error state, selected-text command, local
Q&A citations, and stable geometry.

## Acceptance

- Add an LLM Chat artifact contract helper that validates:
  - desktop and compact viewport coverage;
  - empty, conversation, error, Q&A source, and selected-text command snapshot
    evidence;
  - provider/model/permission/status metadata in snapshots;
  - user and assistant transcript evidence;
  - history restore evidence and JSONL persistence evidence from the smoke;
  - source-grounded Q&A citation evidence;
  - non-empty screenshots and matching metadata for each viewport.
- Update the LLM Chat UI smoke to return the artifact contract in the harness
  result.
- Add unit coverage for the artifact contract, including a negative regression.
- Include LLM Chat in `test:ui-regression`.
- Stabilize the plugin-manager smoke entry point used by `test:ui-regression`
  so the aggregate lane opens the plugin manager through the app-level manage
  event and waits for the actual plugin manager rows instead of inheriting a
  stale plugin detail state from earlier command-palette checks.

## Backend Tests

Not applicable unless this task touches LLM provider transport, chat history
storage, or workspace tool behavior. This slice is intentionally limited to UI
harness/artifact coverage and package script wiring.

## Verification

- [x] `node --check scripts/lib/llm-chat-artifacts.mjs`
- [x] `node --check scripts/smoke-llm-chat-ui.mjs`
- [x] `node --check scripts/smoke-plugin-manager-ui.mjs`
- [x] `node --test test/ui-harness-artifacts.test.mjs`
- [x] `npm run typecheck`
- [x] `LOTION_UI_SUITE_FILTER=llm-chat npm run smoke:ui`
- [x] `LOTION_UI_SUITE_FILTER=plugin-manager npm run smoke:ui`
- [x] `npm run test:ui-regression`
- [x] `git diff --check`

## Notes

- Focused LLM Chat artifact: `artifacts/ui-smoke/llm-chat-ui-2026-06-17T05-06-10-152Z`.
- Aggregate UI regression artifact: `artifacts/ui-smoke/ui-suite-2026-06-17T05-25-25-223Z`.
