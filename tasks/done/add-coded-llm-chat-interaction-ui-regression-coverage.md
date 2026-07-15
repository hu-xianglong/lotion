# Add coded LLM Chat interaction UI regression coverage

Status: done

## Goal

Cover the Notion-like LLM Chat prompt loop in coded UI smoke coverage:
typing a prompt, submitting, rendering user and assistant transcript rows,
showing busy/ready state, keeping controls usable, clearing the transcript, and
keeping the composer/transcript layout non-overlapping.

## Changes

- Extend the LLM Chat UI smoke with a deterministic completion hook so it does
  not depend on real provider credentials or network access.
- Cover the hook in package-core tests because it touches chat UI behavior.
- Keep backend/provider transport behavior unchanged.
- No provider transport changes were made; the existing mocked-provider test
  remains the coverage for real provider routing, and the new package-core
  assertion covers only the test seam used by the Electron smoke.

## Gates

- Passed: `npm run typecheck`
- Passed: `npm run smoke:llm-chat-ui`
- Passed: `npm exec -- tsc -p tsconfig.main.json`
- Passed: `node --test test/package-core.test.mjs`
- Passed: `git diff --check`
