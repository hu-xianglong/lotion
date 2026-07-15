# Production UI visual quality gate

## Priority

P0 / Highest

## Context

Lotion already has UI smoke tests, screenshots, artifact contracts, and a
filtered `test:ui-regression` lane. That is not enough for production-quality
frontend confidence. Recent issues still slipped through:

- Notion Import overlay visually collided with page content.
- Real imported Notion pages exposed toggle/layout defects.
- Existing screenshot artifacts proved the app rendered, but did not reliably
  block poor visual hierarchy, overlap, or broken surface ownership.

The production gate must raise the bar from "screenshots exist" to "critical UI
surfaces are visually and geometrically safe across real workspaces."

## Required scope

- Add a production-grade screenshot/baseline visual regression layer.
- Add geometry assertions for overlap, clipping, offscreen controls, modal
  layering, scroll ownership, and interactive background leakage.
- Add real workspace visual smoke coverage using:
  - `$HOME/Documents/Lotion Workspaces/Notion Import`
  - `$HOME/Documents/Lotion Workspaces/Lotion Demo Space`
- Add explicit modal/surface/z-index checks for import, settings, search, LLM
  chat, plugin manager, page history/restore, and GitHub backup surfaces.
- Add multi-viewport coverage for desktop, compact/narrow, and wide layouts.
- Add artifact review output that groups screenshots by surface, viewport,
  workspace, status, and reproduce command.
- Add frontend coverage gates so screenshot/geometry tests cannot replace
  actual component and interaction coverage.
- Add CI/release lane integration so a release snapshot cannot be considered
  test-ready without this gate or an explicit recorded blocker.

## Test tiers

PR gate:

- `typecheck`
- renderer component coverage for visual primitives
- coverage threshold for touched frontend modules/components
- focused UI regression for touched surfaces
- geometry assertions for modal/surface/layout behavior

Nightly / local quality gate:

- full UI smoke suite
- real `Notion Import` workspace visual pass
- `Lotion Demo Space` stress/layout pass
- frontend coverage report trend for renderer, plugin surfaces, and UI harness
- console/error artifact capture
- screenshot artifact index

Release gate:

- pixel or perceptual baseline comparison for selected stable surfaces
- minimum frontend coverage thresholds for release-critical surfaces
- screenshot review bundle
- `.app` snapshot manifest must link the visual artifact bundle
- release is blocked if critical visual surfaces fail

## Baseline requirements

- Baselines must be stable and intentional, not arbitrary screenshots.
- Each baseline should record viewport, workspace fixture, surface name, theme,
  and expected state.
- Diffs should support reasonable thresholds for text antialiasing, but fail on
  layout shifts, missing controls, visible overlap, clipped buttons, and blank
  regions.
- Failure artifacts must include actual screenshot, expected baseline,
  diff image, DOM/geometry metadata, console errors, and reproduce command.

## Coverage requirements

- Add a concrete frontend coverage command/report if the existing renderer
  component tests do not already emit coverage.
- Track coverage separately for:
  - shared UI primitives and design-system components
  - modal/surface infrastructure
  - Search & AI / Advanced Search
  - LLM Chat
  - Settings center
  - Plugin manager
  - Notion Import
  - Markdown/editor live preview widgets such as toggle blocks
- Require changed user-facing frontend files to have either component coverage,
  UI smoke/geometry coverage, or an explicit documented reason.
- Include coverage summary and trend in the artifact index.
- Release gate should fail if coverage drops below the agreed threshold for
  release-critical frontend surfaces.

## Acceptance criteria

- Add a concrete npm script for the production visual quality gate.
- Add a concrete npm script for frontend coverage reporting/gating, or extend an
  existing one if appropriate.
- Add or extend shared UI harness helpers for:
  - screenshot baseline capture
  - screenshot diff/perceptual diff
  - element overlap detection
  - modal backdrop/background interaction checks
  - viewport-safe bounds checks
  - artifact index generation
- Cover at least these critical surfaces with screenshots and geometry checks:
  - Notion Import modal on real `Notion Import` workspace
  - imported page with images and Chinese title/content
  - imported toggle page `Family Vision Check`
  - Search & AI tabs including Advanced Search results
  - LLM Chat surface
  - unified Settings center
  - Plugin manager
  - GitHub Backup / history surface if available
- Ensure failures are actionable from artifacts without local reproduction.
- Ensure coverage output is machine-readable and linked from the UI artifact
  index/release manifest.
- Wire the gate into release-test requirements or release manifest validation.
- Document local and CI usage in testing docs.
- Move to done only after the gate runs successfully or records an explicit,
  product-owner-accepted blocker.
