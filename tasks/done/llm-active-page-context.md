# LLM Active Page Context

## Goal

Let LLM providers read the page currently open in Lotion through the public plugin
workspace API, without introducing a write path or coupling plugins directly to
React state.

## Completed

- Wired renderer `WorkspaceAPI.activePage()` through an injected reader.
- Registered the active page reader from `App`, including current in-memory
  markdown edits when `savePage` is called.
- Added a read-only `lotion_get_active_page` LLM tool.
- Covered the tool in package/plugin tests.

## Verification

- `npm run typecheck`
- `npm run build`
- `node --test test/package-core.test.mjs`
- `git diff --check`
