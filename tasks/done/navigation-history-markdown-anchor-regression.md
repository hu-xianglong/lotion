# Navigation History Markdown Anchor Regression

Status: done

## Why

Back/forward navigation previously regressed to reopening pages near the top
instead of restoring the user's previous reading/editing position. Existing
sidebar navigation smoke coverage checks back/forward labels and basic
navigation, but not markdown anchor restoration in the editor body.

## Scope

- Add a focused shared-harness UI smoke that runs across desktop and compact
  viewports.
- Build a small deterministic workspace with one long page and one second page.
- Open the long page, scroll/click a middle marker so the editor records a
  markdown anchor, navigate to the second page, then use Back to return.
- Assert the restored long page remains near the prior marker instead of at the
  top, and that Forward still returns to the second page.
- Keep this UI-only unless the smoke exposes a product bug.

## Gates

- Passed: `npm run typecheck`
- Passed: `npm run smoke:navigation-anchor-ui`
  - Initial sandboxed run timed out waiting for CDP.
  - Initial elevated version exposed that pure scroll position alone is not
    restored by history navigation.
  - Final smoke simulates the user-facing cursor/anchor behavior by clicking a
    visible middle paragraph before navigating away, then verifies Back restores
    near that markdown anchor across desktop and compact viewports.
- Passed: `git diff --check`

## Result

- Added `scripts/smoke-navigation-anchor-ui.mjs`, a shared-harness smoke with a
  deterministic two-page workspace.
- Added `npm run smoke:navigation-anchor-ui` and included it in
  `npm run smoke:ui`.
- The smoke verifies Back restores the clicked middle-of-document markdown
  anchor instead of reopening at the top, and Forward returns to the second
  page.
- Backend/package-core tests were not applicable because this item adds focused
  renderer navigation regression coverage and does not change storage, IPC, or
  service behavior.
