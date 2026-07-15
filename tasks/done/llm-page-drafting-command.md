# LLM Page Drafting Command

## Goal

Add a first write-oriented LLM workflow that creates a new page from an explicit
user prompt while keeping the write path deterministic in Lotion code.

## Completed

- Added `Draft Page with LLM`.
- Prompted for page title and drafting instructions.
- Generated Markdown through the configured LLM provider.
- Created the page and persisted the generated body through `WorkspaceAPI`.
- Opened the created page after success.
- Covered the command with mocked provider tests.

## Verification

- `npm run typecheck`
- `npm run build`
- `node --test test/package-core.test.mjs`
- `git diff --check`
