# UI Harness Focused Region Assertion Helper

Status: done

## Why

Editor and command/search smokes repeatedly checked `document.activeElement`
with local snippets. That duplicated fragile focus logic and made future
Notion-like editing regressions harder to test consistently.

## Changes

- Added `assertFocusWithin` to `scripts/ui-harness.mjs`.
- The helper treats normal focused descendants and CodeMirror's `.cm-focused`
  wrapper as valid focused states.
- Migrated `scripts/smoke-ui-harness-foundation.mjs` to use the shared helper
  after clicking the editor.
- Added unit coverage for active descendants, CodeMirror focused wrappers, and
  unfocused failure diagnostics.
- Documented the helper for future UI/editor smokes.

## Verification

- `node --check scripts/ui-harness.mjs`
- `node --check scripts/smoke-ui-harness-foundation.mjs`
- `node --test test/ui-harness-artifacts.test.mjs`
- `npm run typecheck`
- `npm run smoke:ui-harness-foundation`
  - Artifact:
    `artifacts/ui-smoke/ui-harness-foundation-2026-06-15T18-13-10-250Z/harness-result.json`
  - Covered `desktop` and `compact` viewports and recorded focused editor
    state for both.
- `git diff --check`
