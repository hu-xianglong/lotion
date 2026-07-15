# Renderer Component Advanced Search Panel Regression

Status: done

## Why

Advanced Search is now a built-in plugin with its own semantic index and UI. It
has service tests and Electron smoke coverage, but the plugin panel itself is
not part of the static renderer component regression suite. A small static
fixture should lock down the initial controls, cost warning, query input, and
result container so future UI changes do not silently remove the plugin's key
affordances.

## Scope

- Export the Advanced Search panel for renderer regression testing.
- Add static renderer coverage for the panel's initial plugin UI.
- Assert provider/model/API key controls, explicit embedding-cost warning,
  rebuild/search actions, status text, query placeholder, and results listbox.

## Verification

## Result

- Exported `AdvancedSearchPanel` for static renderer regression coverage.
- Added an embedded Advanced Search panel fixture to the renderer component
  suite.
- Asserted the plugin's initial title/description, provider selector, local and
  OpenAI-compatible provider options, Base URL/Model/API key controls, explicit
  DeepSeek compatibility warning, Save/Rebuild actions, query input, status
  text, and results listbox.
- Backend/service tests were not applicable because this item only exposes an
  existing plugin panel for static renderer coverage and does not change search
  indexing/query behavior.

## Verification

- Passed: `node --check scripts/test-renderer-components.mjs`
- Passed: `npm run test:renderer-components`
- Passed: `npm run typecheck`
- Passed: `git diff --check`
