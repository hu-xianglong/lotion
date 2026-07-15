# Renderer Component Page Cover Area Regression

Status: done

## Why

The UI regression backlog calls out imported Notion parity and page rendering
fragility. Page covers are part of the page shell users inspect visually, but
the renderer static coverage does not directly assert the cover image path,
focal-point styling, hover actions, or empty cover behavior.

## Scope

- Add renderer component coverage for `CoverArea`.
- Assert an existing cover renders through the Lotion file protocol with the
  saved object-position offset.
- Assert cover actions are discoverable for change, reposition, and remove.
- Assert the surrounding page/database header empty-cover affordance remains
  covered so pages without covers expose the add-cover path.

## Verification

- `node --check scripts/test-renderer-components.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

## Result

- Added a direct static renderer fixture for `CoverArea`.
- Asserted cover image rendering through the Lotion file protocol, preserved
  focal-point styling, non-draggable image behavior, and the change/reposition/
  remove actions.
- Kept this renderer-only; backend/service tests are not applicable because no
  data model, IPC, persistence, or API behavior changed.

Verified:

- `node --check scripts/test-renderer-components.mjs` passed.
- `npm run test:renderer-components` passed.
- `npm run typecheck` passed.
- `git diff --check` passed.
