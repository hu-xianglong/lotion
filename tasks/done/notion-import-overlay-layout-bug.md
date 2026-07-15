# Bug: Notion import overlay layout is visually broken

Status: done

## Priority

High

## Context

The Notion import UI can render on top of an already-open imported page in a way
that makes the experience look broken:

- The `Import from Notion` panel appears over the page title/content instead of a
  clean import surface or modal.
- The existing page content remains highly visible behind the import controls.
- The import controls overlap imported page content and images.
- The visual hierarchy is unclear: page toolbar, page body, import settings, and
  folder chooser controls all compete in the same layer.

Observed while testing the `Notion Import` workspace under:

`$HOME/Documents/Lotion Workspaces/Notion Import`

## Expected behavior

The Notion import flow should appear in a dedicated, polished surface:

- Either a full-page import view or a properly centered modal.
- Background content should be hidden, dimmed, or made non-interactive in a way
  that does not create readable overlap.
- Import settings, page details, history tabs, and folder picker actions should
  have clear layout boundaries.
- The layout should work on a large imported page with images and Chinese text.

## Acceptance criteria

- Reproduce the overlap using the `Notion Import` workspace.
- Fix the z-index/layout/surface ownership issue so import UI does not visually
  collide with page content.
- Add focused UI regression coverage for the Notion import surface.
- Include a screenshot artifact showing the fixed import UI.
- Run focused UI smoke plus typecheck before moving to done.

## Result

- The `Open Notion Import` command now opens a dedicated plugin modal instead
  of routing the user to the plugin settings page over an already-open
  imported page.
- The modal owns its surface: it is centered, aria-marked as a dialog, backed by
  a backdrop that covers the viewport, and does not contain the current page
  title/content.
- The Notion import panel still supports its embedded plugin-management surface;
  the modal path removes the duplicate inner title so the hierarchy is clean.
- Plugin modal rendering now supports an optional disposable cleanup return so
  React plugin roots can unmount when the modal closes.
- The Notion import smoke captures desktop and compact command-modal screenshots
  plus metadata proving the overlay is bounded and non-overlapping.

## Verification

- Passed: `node --check scripts/smoke-notion-import-ui.mjs && node --check scripts/smoke-plugin-manager-ui.mjs`
- Passed: `npm run typecheck`
- Passed: `node scripts/test-renderer-components.mjs`
- Passed: `node --test --test-name-pattern "notion import audit artifact contract" test/ui-harness-artifacts.test.mjs`
- Passed: `npm run smoke:notion-import-ui`
  - Artifact: `artifacts/ui-smoke/notion-import-audit-2026-06-17T18-58-47-444Z`
- Passed: `git diff --check`
- Additional non-required check attempted: `npm run smoke:plugin-manager-ui`
  failed twice during the harness `openWorkspaceAndReload` startup phase before
  reaching the changed Notion Import command assertions. Latest artifact:
  `artifacts/ui-smoke/plugin-manager-ui-2026-06-17T19-08-39-025Z`.
