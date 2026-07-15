# Add Coded LLM Chat UI Regression Coverage

Status: done

## Goal

Add a coded Electron UI smoke test for the LLM Chat frontend surface so the
sidebar entry, modal opening path, and initial chat modal state are covered by
automation instead of manual smoke only.

## Changes

- Added `scripts/smoke-llm-chat-ui.mjs`.
- Added `npm run smoke:llm-chat-ui`.
- Added the LLM Chat smoke to `scripts/smoke-ui-suite.mjs`.
- Registered the LLM Chat temp workspace prefix for smoke cleanup.

## Coverage

The smoke creates an isolated workspace, opens it in the running Electron
renderer, verifies the `LLM Chat` sidebar item is discoverable, opens the chat
modal, and asserts user-visible modal state:

- `LLM Chat` modal title
- `No conversation yet.` empty transcript
- `Ask a question or request a workspace action.` status text
- textarea placeholder and row count
- `Clear` and `Send` action buttons

Backend/plugin transport tests were not added because this item only adds
frontend UI regression coverage and does not change LLM provider, transport, or
workspace-tool behavior.

## Gates

- `npm run typecheck` passed.
- `npm run smoke:llm-chat-ui` passed.
- `git diff --check` passed.
