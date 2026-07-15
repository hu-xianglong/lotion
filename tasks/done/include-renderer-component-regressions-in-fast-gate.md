# Include Renderer Component Regressions In Fast Gate

Status: done

## Scope

The first renderer component regression script is useful only if it runs in the
normal fast regression lane. Add it to `test:fast` so future commits catch
row-property renderer regressions without relying on manual focused runs.

## Acceptance

- `npm run test:fast` invokes `npm run test:renderer-components`.
- The focused renderer component test still runs on its own.
- The full fast gate remains green.

## Gates

- `npm run test:renderer-components`
- `npm run test:fast`
- `git diff --check`

## Result

- Added `npm run test:renderer-components` to the normal `test:fast` gate so row-property renderer regressions run in the fast lane.
- Verified the focused renderer component regression still passes on its own.
- Verified the full fast gate remains green with the renderer component test included.
