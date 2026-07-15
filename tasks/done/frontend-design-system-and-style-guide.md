# Frontend Design System And Style Guide

Status: done

Decision state: shipped

## Why

Lotion needs one coherent frontend style instead of page-by-page visual tuning.
The target product feel is closer to Notion and Obsidian: quiet, dense,
workspace-focused, white/default-light, and built around repeatable information
patterns rather than decorative layouts.

This task defines the design system that future Search & AI, Settings, plugin,
management, and editor surfaces should use.

## Scope

- Write a frontend style guide.
  - Product principles: document/workspace tool, not marketing page.
  - Layout rules for dense productivity surfaces.
  - Settings vs workflow separation rules.
  - Empty, loading, error, warning, success, and destructive-action patterns.
- Freeze and document design tokens.
  - Surface colors, ink scale, rule colors, accents, status colors.
  - Spacing, radii, shadows, typography, and density scale.
  - Guidelines for when a page may introduce new color or visual emphasis.
- Establish shared renderer UI primitives.
  - Button, icon button, tabs, segmented control, input, select, toggle.
  - Panel, settings row, status pill, toolbar, result item, source card.
  - Modal, popover, context menu, sidebar item, table row, diff preview.
- Add a renderer UI lab / component gallery.
  - Show primitives and core patterns in realistic Lotion contexts.
  - Include Search & AI, Settings, plugin workflow, management table, and
    source/citation examples.
- Add enforcement and migration guidance.
  - New UI should use shared primitives rather than ad hoc local CSS.
  - Avoid nested cards, one-off palettes, oversized hero layouts, and raw
    settings forms in workflow pages.
  - Document how to migrate existing plugin and management views gradually.
- Add review and test expectations.
  - Visual regression or renderer coverage for shared primitives.
  - Checklist for overflow, compact layout, focus states, keyboard use, and
    state coverage.

## Out Of Scope

- Redesigning every existing screen in this task.
- Replacing the editor implementation.
- Introducing an external design tool dependency.
- Building a full Storybook setup unless it fits the existing test/runtime
  stack cleanly.

## Acceptance

- A style guide exists and is linked from frontend/development docs.
- Core design tokens are documented and used by shared primitives.
- Shared primitives cover common app, settings, plugin, search, and AI surfaces.
- A local UI lab or renderer component gallery demonstrates the system.
- At least one focused renderer test or visual artifact validates the primitives
  and main layout patterns.
- Follow-up UI tasks can cite this design system instead of redefining visual
  rules.

## Gates

- `node --check scripts/smoke-design-system-ui.mjs`
- `npm run test:renderer-components`
- `npm run smoke:design-system-ui`
- `npm run typecheck`
- `npm run build`
- `git diff --check`

## Result

- Added `docs/frontend-design-system.md` and linked it from the product design
  docs.
- Added a Design System lab management surface with shared Lotion UI primitive
  examples for tokens, controls, search/result rows, settings rows, source
  cards, and status pills.
- Added renderer component coverage for the primitive/gallery markup.
- Added `npm run smoke:design-system-ui`, a shared-harness Electron smoke that
  validates desktop and compact viewports, white surface tokens, current accent
  token usage, focus behavior, no horizontal overflow, and screenshot artifacts.
- Backend/service tests are not applicable for this item because the change is
  frontend primitives, documentation, and UI smoke coverage only.

## Verification

- `node --check scripts/smoke-design-system-ui.mjs`
- `npm run test:renderer-components`
- `npm run smoke:design-system-ui`
- `npm run typecheck`
- `npm run build`
- `git diff --check`
