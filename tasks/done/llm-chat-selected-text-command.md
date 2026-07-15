# LLM Chat command uses selected editor text

Status: done

Split from `tasks/todo/notion-gap-backlog-needs-discussion.md` LLM-first
workflow notes.

## Goal

Make the assistant useful for everyday writing: when text is selected in the
local editor, a command palette action should open LLM Chat with that selection
already in the prompt composer instead of forcing the user to copy/paste.

## Acceptance

- Add an `Ask LLM about selection` command to the LLM plugin command palette
  registrations.
- When editor/page text is selected, the command opens the LLM Chat assistant
  panel and prefills the composer with a concise prompt that includes the
  selected text.
- If there is no selected text, the command still opens LLM Chat and focuses the
  composer without inserting stale text.
- The normal `Open LLM Chat` command/sidebar behavior remains unchanged.
- The prefilled prompt is editable and can be submitted through the existing LLM
  Chat send loop.
- Multi-resolution coded UI coverage selects real editor text, executes the
  command through search, verifies the prompt/focus/layout, submits through the
  deterministic LLM debug hook, and verifies no horizontal overflow.

## Verification

- [x] `node scripts/test-renderer-components.mjs`
- [x] `npm run typecheck`
- [x] `npm run smoke:llm-chat-ui`
  - Artifact: `artifacts/ui-smoke/llm-chat-ui-2026-06-16T07-57-56-201Z`
  - Covered desktop and compact viewports, real editor selection, command
    palette execution, prefilled composer, send loop, no-selection fallback,
    focus, and no horizontal overflow.
- [x] `git diff --check`
