# LLM Chat Page Assistant Redesign

Status: done

## Why

The current LLM Chat is functional, but it still feels like a plugin modal. It
should become a page-aware workspace assistant that users can keep open while
reading or editing, with clear context, visible tool activity, and safe write
flows.

## Current Capabilities

The existing LLM tool surface can already:

- search the workspace,
- list pages,
- read a page by id,
- read the active page,
- list databases,
- read database schema/views/sample rows,
- create a page,
- replace a page's full markdown,
- create a database,
- add a database row,
- update a database cell.

## Requirements

- Redesign LLM Chat as a right-side assistant panel first, while keeping command
  palette/sidebar entry points.
- Keep provider and model selection available inline, but make them secondary
  to the conversation and context.
- Add a clear context selector:
  - current page,
  - workspace search,
  - selected text when selection support exists,
  - no context.
- Add fast actions for common workflows:
  - summarize current page,
  - continue writing,
  - rewrite selected text,
  - create action items,
  - search workspace,
  - draft new page.
- Show tool activity in the transcript, for example:
  - searched workspace,
  - read current page,
  - read database,
  - proposed page update,
  - created page.
- Replace the raw "N tools enabled" state with user-facing modes:
  - read-only,
  - ask before editing,
  - direct create.
- Default to ask-before-editing for any write-capable configuration.
- Treat full-page replacement as a dangerous operation. The assistant must show
  a preview or diff before applying `lotion_update_page`.
- Provide explicit actions for proposed writes:
  - apply,
  - copy,
  - discard.
- Keep chat history available but visually lighter than the main conversation,
  such as a compact dropdown or collapsible rail.
- Preserve useful empty, loading, failure, compact-width, and keyboard states.

## Safety Rules

- Read-only mode must not expose write tools to the model.
- Ask-before-editing mode may let the model propose writes, but front-end UI
  must require user confirmation before applying them.
- Direct create may allow creation workflows such as new pages, but destructive
  or replacing edits still need preview/confirmation.
- Do not let `lotion_update_page` silently replace an entire page from a normal
  chat response.
- Tool calls and resulting changes should be inspectable enough for users to
  understand what happened.

## Non-goals

- Do not add deletion tools in this task.
- Do not auto-apply page rewrites without preview.
- Do not redesign the entire plugin manager/settings surface as part of this.
- Do not require a live external LLM for smoke coverage; use the existing
  deterministic mocked completion hook where possible.

## Acceptance

- Users can open LLM Chat as a page-side assistant and continue seeing the page.
- Users can choose the active context from the assistant UI.
- Common prompt workflows are available as quick actions.
- Tool calls appear as readable transcript events or status rows.
- Write-capable responses show a preview/diff and require an explicit Apply.
- Read-only mode disables all write tools.
- Existing provider/model, transcript history, and current-page context behavior
  continue to work.
- Desktop and compact layouts have no overlap or horizontal overflow.

## Gates

- Renderer component coverage for the assistant panel states.
- LLM chat UI smoke covering desktop and compact layouts.
- Mocked tool-call smoke for read actions and proposed write previews.
- Package/core tests for tool filtering by mode.
- `npm run typecheck`
- `git diff --check`

## Verification

- `node --check scripts/smoke-llm-chat-ui.mjs`
- `node --check scripts/smoke-white-theme-ui.mjs`
- `npm run typecheck`
- `npm exec -- tsc -p tsconfig.main.json && node --test test/package-core.test.mjs`
- `npm run smoke:llm-chat-ui`
- `npm run smoke:white-theme-ui`
- `git diff --check`

## Result

- Replaced the real Electron chat entry with a right-side page assistant panel
  while preserving the modal fallback used by package-level tests.
- Added inline provider/model controls, context selection, quick actions,
  visible tool/mode state, history restore, and ask-before-editing as the
  default write-safe mode.
- Filtered available Lotion tools by assistant mode so read-only and
  ask-before-editing do not expose write tools; direct-create only exposes
  read tools plus create-page/create-database.
- Added safe write previews using `lotion-page-update-preview` fenced blocks
  with Apply/Copy/Discard controls; Apply does not silently rewrite the page.
- Strengthened multi-resolution LLM Chat UI smoke coverage for empty,
  loading/disabled, transcript, history restore, preview, error, clear,
  keyboard send, focus, overflow, and clipped-composer geometry states.
- Updated the white-theme smoke to verify the new assistant panel surface.
