# Surface LLM Chat Window In The Frontend

Status: done

## What Changed

- Added an `LLM Chat` modal inside the OpenAI-compatible LLM plugin.
- Registered a visible `LLM Chat` sidebar entry.
- Registered an `Open LLM Chat` command for the command palette.
- Rendered plugin sidebar items in the app sidebar.
- Kept active-page context in chat requests so the model can use Lotion tools
  when the current page matters.

## Verification

- `npm run typecheck`
- `node --test test/package-core.test.mjs`
- `git diff --check`
- Manual Electron UI smoke:
  - Started Lotion with `npm run dev`.
  - Verified `LLM Chat` appears in the left sidebar.
  - Clicked `LLM Chat` and verified the chat modal opens.
