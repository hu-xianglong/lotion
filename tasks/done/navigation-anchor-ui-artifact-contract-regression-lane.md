# Navigation Anchor UI Artifact Contract And Regression Lane

Status: done

Queue item: 582

## Why

`smoke:navigation-anchor-ui` verifies a user-facing editor navigation behavior:
after navigating away from a long page, Back should restore the previous
markdown anchor/scroll location, and Forward should return to the second page.
This protects the "return to the previous cursor/markdown position" workflow,
but the smoke currently has no artifact contract and is outside the focused UI
regression lane.

## Acceptance

- Add a reusable Navigation Anchor artifact contract helper.
- The helper validates desktop and compact viewport evidence for:
  - long-page scroll away from top before navigation,
  - restored scroll position and visible clicked anchor line after Back,
  - Forward navigation back to the second page,
  - no horizontal overflow evidence before/after,
  - non-empty editor screenshots with metadata.
- Update `smoke:navigation-anchor-ui` to capture per-viewport screenshots and
  return the artifact contract in the harness result.
- Include `smoke-navigation-anchor-ui.mjs` in `npm run test:ui-regression`.
- Add unit coverage for passing and failing artifact contract cases.
- Update testing docs.

## Verification

- `node --check scripts/lib/navigation-anchor-artifacts.mjs`
- `node --check scripts/smoke-navigation-anchor-ui.mjs`
- `node --check test/ui-harness-artifacts.test.mjs`
- `node --test test/ui-harness-artifacts.test.mjs`
- `npm run smoke:navigation-anchor-ui`
  - `artifacts/ui-smoke/navigation-anchor-2026-06-17T11-01-17-582Z/harness-result.json`
- `LOTION_UI_SUITE_FILTER=smoke-navigation-anchor-ui.mjs npm run smoke:ui`
  - `artifacts/ui-smoke/navigation-anchor-2026-06-17T11-02-52-227Z/harness-result.json`
  - `artifacts/ui-smoke/ui-suite-2026-06-17T11-02-31-285Z/ui-suite-artifacts.json`
  - `artifacts/ui-smoke/ui-suite-2026-06-17T11-02-31-285Z/ui-suite-artifacts.md`
- `node -e 'const p=require("./package.json"); if (!p.scripts["test:ui-regression"].includes("smoke-navigation-anchor-ui.mjs")) throw new Error("test:ui-regression missing smoke-navigation-anchor-ui.mjs"); console.log("test:ui-regression includes navigation anchor smoke")'`
- `node scripts/test-renderer-components.mjs`
- `npm run typecheck`
- `git diff --check`

Notes:

- The focused smoke initially exposed a real Back/Forward restore race in shared
  UI-suite mode. The fix now turns saved page/row editor view state into an
  explicit navigation anchor, and the CodeMirror restore path uses CodeMirror's
  native `scrollIntoView` before manual DOM correction.
