# Renderer Component App Shell Regression

Status: done

## Result

- Added static renderer coverage for `AppShell` in both expanded and collapsed
  sidebar states.
- Asserted the expanded shell renders sidebar, hide-sidebar affordance, tab
  strip, main area, and child content.
- Asserted the collapsed shell hides sidebar while preserving the show-sidebar
  affordance, tab strip, main area, and child content.
- Reused the renderer window/localStorage shim to control
  `lotion.sidebar.collapsed` deterministically.
- Backend/service tests are not applicable because this item only adds renderer
  presentation coverage and does not change product behavior or persistence.

## Verification

- `node --check scripts/test-renderer-components.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`
