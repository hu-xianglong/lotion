# AI Q&A Agent Search And History

Status: done

## Decision

Search / AI Q&A is a high-priority Notion-parity surface. It should become more
than a chat box: users should be able to ask workspace-level questions, inspect
sources, query database properties, and safely move from an answer to an
action.

## Why

Notion's current Agent/Q&A direction combines workspace search, source-backed
answers, database-aware retrieval, version-history awareness, and safe editing.
Lotion should pursue the local-first version of that workflow:

- use local workspace content and database properties as the trusted knowledge
  source;
- cite every answer back to pages, rows, databases, or page versions;
- use local semantic search instead of a cloud-only retrieval dependency;
- keep write actions previewable and reversible.

## Dependencies

- `tasks/done/llm-chat-page-assistant-redesign.md` provides the assistant panel,
  context controls, visible tool activity, and safe write previews.
- `tasks/done/advanced-search-lancedb-qwen3-local-vector-index.md` provides the
  local semantic retrieval layer.
- `tasks/todo/github-backup-page-history-redesign.md` provides local page
  version APIs that this assistant can later read as history context.

## Scope

- Add a dedicated Q&A/Agent mode to the assistant surface once the assistant
  redesign and Advanced Search foundation are stable.
- Retrieve across pages, database schemas, database rows, row pages, and
  relevant page-history versions when local history is available.
- Return answers with visible source citations:
  - page title and path;
  - database or row-page identity;
  - property name when the answer came from a database field;
  - history version metadata when the answer came from an older page version.
- Let users open cited sources directly.
- Let the model query database properties through structured tools, not only
  through raw text chunks.
- Prefer source-grounded answers. If evidence is missing or ambiguous, the
  assistant should say so and show the closest sources.
- Support multi-step read workflows such as "summarize all project risks from
  this workspace" or "what changed in this page since last week?"
- Reuse the LLM Chat safety model for writes:
  - read-only mode never exposes write tools;
  - proposed writes require preview/diff;
  - destructive or replacing edits require explicit confirmation.

## Out Of Scope

- External connectors such as Slack, Gmail, Drive, Jira, or web search.
- Autonomous background agents.
- Comments/mentions, until Lotion has a comments model.
- Deletion tools.
- Auto-restore from history without the page-history confirmation flow.
- Full Notion Agent parity for maps, forms, or arbitrary database view
  construction.

## Acceptance

- Users can ask a workspace-level question and receive an answer with cited
  sources.
- Q&A can cite page chunks, row pages, database properties, and database schema
  context.
- Q&A can use Advanced Search retrieval without sending embeddings or content
  to an external provider by default.
- When page history is available, Q&A can answer read-only questions about
  previous versions and cite the relevant version.
- Source chips open the cited page, row page, database, or history preview.
- The assistant refuses to present unsupported claims as fact when retrieval
  confidence is low.
- Any proposed write still routes through the assistant preview/diff flow.

## Gates

- Package/core tests for source citation normalization.
- Mocked assistant tool-call tests for page, database, row, and history
  retrieval.
- Advanced Search retrieval tests with deterministic embeddings.
- Assistant UI smoke for source-cited Q&A answers and source opening.
- Typecheck.
- `git diff --check`

## Result

- Added a local Q&A source citation layer in `llm-openai/qa-agent.ts`.
- Added `AdvancedSearchPluginService.queryTransient()` for explicit Q&A-time
  local retrieval using deterministic local embeddings. It does not write a
  persistent index and does not call external embedding providers by default.
- Workspace-mode LLM Chat now injects source-grounded local retrieval context
  into the system prompt and renders source chips under assistant answers.
- Source chips open pages, databases, or row pages through Lotion entity
  navigation.
- Chat history JSONL now preserves assistant citations when present.
- History-version citations remain blocked on 531 because Lotion's GitHub/page
  history API is not available yet. The Q&A system prompt explicitly tells the
  model not to claim history citation support.

## Verification

- `node --check scripts/smoke-llm-chat-ui.mjs`
- `npx tsc --noEmit -p tsconfig.main.json`
- `npx tsc -p tsconfig.main.json && node --test test/package-core.test.mjs`
- `npm run smoke:llm-chat-ui`
- `npm run typecheck`
- `git diff --check`
