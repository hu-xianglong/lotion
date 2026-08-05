# Production UI visual quality gate

Status: todo

Decision state: accepted, staged rollout

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

## Verification Audit

Audited on 2026-07-22. Keep this umbrella task in todo.

Implemented evidence:

- `npm run test:production-visual` exists, is required by `release:test`, and
  requires screenshot/artifact contracts across desktop, compact, and wide.
- Shared harnesses enforce geometry, overflow, viewport coverage, console
  errors, focus, and actionable reproduce commands for the registered critical
  surfaces.
- Queue item 642 added the shared PNG perceptual-diff primitive, bounded
  antialias/pixel thresholds, and actual/expected/diff/metadata failure
  evidence.
- Queue item 643 added `src/renderer/**` V8 coverage, zero-hit inventory,
  category summaries, regression thresholds, production-gate integration, and
  release artifact linkage. Its original 130-file count was later found to
  contain macOS source-path aliases and was corrected by queue item 666.
- Queue item 644 added a committed verified renderer coverage baseline, strict
  four-metric historical comparison, negative regression/invalid-evidence
  tests, and production/release artifact trend linkage.
- Queue item 645 added the first intentional committed production PNG for the
  deterministic Design System desktop surface. Its checksum-backed strict
  zero-pixel comparison and actual/expected/diff/metadata links are required by
  the Design System, aggregate suite, production, and release contracts.
- Queue item 646 added the isolated real Lotion Demo Space runner, source/clone
  byte fingerprints, desktop/compact Home and 500K database screenshots,
  latency/virtualization/overflow evidence, legacy workspace compatibility,
  and a redacted machine-readable artifact contract.
- Queue item 647 added the isolated real Notion Import runner, repaired legacy
  top-level row-body loading, and verified the native Chinese row page, an
  exact clone-only importer toggle/media regression, and the real import modal
  across desktop and compact with six screenshots and source fingerprint
  equality.
- Queue item 648 added a reviewed compact Design System baseline. It also fixed
  the compact element-capture scroll state so the committed PNG contains the
  complete surface, then required both desktop and compact zero-pixel evidence
  through Design System, production, and release contracts.
- Queue item 649 fixed a false-positive status-pill assertion by scoping it to
  the quality-gate row, restored the missing `Local` pill, and added geometry
  and responsive-layout evidence. It refreshed the affected desktop/compact
  baselines and added a reviewed strict wide baseline, so all three default
  Design System viewports are now required through production and release.
- Queue item 650 added the second committed production surface: the White Theme
  main page at desktop, compact, and wide. It also fixed nondeterministic hidden
  page scrolling and floating-TOC transition timing, then required all three
  zero-diff page records through White Theme, production, and release contracts.
- Queue item 651 added committed unified Settings Center Plugins-state
  baselines across all three default viewports. It stabilized the active-tab
  transition, proved all seven plugin rows fit, and repaired a Search & AI
  deep-link flake caused by React replacing a visible tab during Playwright's
  stable-action wait.
- Queue item 652 rejected stable-but-invalid Plugin Manager scroll-container
  screenshots, exposed the complete list surface for capture, proved all seven
  plugin rows and fourteen provider icons fit, and added strict reviewed
  desktop, compact, and wide baselines with production/release linkage.
- Queue item 653 fixed the compact LLM Chat transcript collapse from 28px to
  182px, repaired whitespace live-selection fallback and deterministic busy
  assertions, added per-message visibility geometry, and committed reviewed
  strict desktop, compact, and wide conversation baselines with
  production/release linkage.
- Queue item 654 fixed the compact Advanced Search result clipping caused by an
  over-broad single-column breakpoint, added results viewport and per-card
  visibility evidence, and committed reviewed strict desktop, compact, and
  wide stale-result baselines with production/release linkage.
- Queue item 655 removed internal CSV/Markdown paths and embedded IDs from
  Search & AI result/source labels, added readable identity and clipping/leak
  evidence, raised renderer coverage above its historical baseline, and
  committed reviewed strict desktop, compact, and wide chat-handoff baselines
  with production/release linkage.
- Queue item 656 repaired global-search filter/sort clipping, added ownership,
  overlap, overflow, and result-row geometry evidence, and committed reviewed
  strict desktop, compact, and wide populated-result baselines with
  production/release linkage.
- Queue item 657 removed backlink/history storage-path leaks, repaired
  backup/restore success-message lifetime, exercised a real two-version Git
  preview and restore, and committed reviewed strict desktop, compact, and wide
  restore-preview baselines with production/release linkage.
- Queue item 658 removed the GitHub Backup restore-preview storage path,
  upgraded the local-mock backup/restore smoke to a modal ownership and
  full-surface artifact contract, fixed missing readable aggregation detail,
  added GitHub Backup to the default production suite, and committed reviewed
  strict desktop, compact, and wide restore-preview baselines with
  production/release linkage.
- Queue item 659 closed the Notion Import command-modal false-positive gap by
  requiring complete control geometry, containment, visibility, opacity,
  initial disabled action state, modal-body scroll ownership, and three
  reviewed strict desktop, compact, and wide command-modal baselines with
  child/production/release linkage.
- Queue item 660 repaired Markdown selected-source/Edit source overlap and
  virtualization/selection-capture races, required complete editor, selection,
  raw-source, highlight, and Edit source geometry/ownership evidence, and added
  three reviewed strict selected-source baselines with
  child/production/release linkage.
- Queue item 661 repaired the compact row-property screenshot's clipped
  scroll-owner capture, replaced duplicate colored search pills with distinct
  search actions, persisted complete panel/row/control geometry, and added
  three reviewed strict row-property baselines with focused navigation,
  child/production/release linkage.
- Queue item 662 repaired a false-positive embedded-table capture that produced
  a mostly blank 4415px image around virtual rows 41-52. It now captures a
  deterministic complete surface with the header, tabs, sticky columns, rows
  0-7, summary, and real 100/500 Load-more footer; persists nested geometry and
  visibility evidence; freezes and warms Chromium rasterization; and adds three
  reviewed strict embedded-table baselines with child/production/release
  linkage.
- Queue item 663 repaired a false-positive Created Views screenshot captured
  during the intentional persistence-failure state, including a clipped Filter
  popover, internal database ID, failure sentinel, and only one filtered row.
  The smoke now proves rollback, restores a clean unfiltered descending view,
  persists complete header/tab/table/three-row/summary/footer geometry, and
  adds three reviewed strict Created Views baselines with
  child/production/release linkage.
- Queue item 664 fixed two Database Interaction false positives: navigation
  could bind Home's embedded Tasks table instead of the standalone database,
  and Filter/Sort screenshots were captured at near-zero opacity during their
  120ms entry animation. It now waits for database readiness, targets the
  standalone table, requires settled complete geometry for all nine
  settings/filter/sort captures, and adds three reviewed strict Settings-scope
  baselines with child/production/release linkage.
- Queue item 665 kept the PR/release production command portable and added
  `test:production-visual:nightly` as a strict local deep gate. It validates
  both named workspace prerequisites, runs fresh isolated clones without
  silent skips, preserves source fingerprints and redacts original paths, and
  aggregates 16 portable suites plus two real workspaces into an 18-row
  workspace/theme/viewport/baseline matrix. The verified run recorded 89
  screenshots, 48 zero-diff committed baselines, both real sources unchanged,
  and structural-contract-only status for private workspace captures.
- Queue item 666 repaired renderer coverage identity integrity. It canonicalizes
  130 raw `/Users` and `/private/Users` entries to the exact 67-file worktree
  inventory, rejects ambiguous non-zero aliases and inventory drift, removes
  c8's misleading duplicate-based threshold output, and propagates the
  evidence through production, nightly, and release artifacts. The corrected
  verified baseline is 62.78% lines/statements, 24.67% functions, and 63.44%
  branches, with 63/67 source files executed.
- Queue item 667 debugged the zero-hit browser plugin settings store shared by
  all built-in renderer plugins. Failed localStorage writes and serialization
  previously rejected after mutating the cache, while JSON-lossy values could
  differ before and after reload. Writes/deletes are now transactional and
  cache the exact persisted JSON representation; failure, cyclic, `toJSON`,
  malformed-load, isolation, and reload regressions are covered. The file rose
  to 96.49% line coverage and the verified renderer baseline to 62.98% lines
  with 64/67 files executed.
- Queue item 668 audited the zero-hit legacy renderer Markdown helper and proved
  it had no production or test consumer; the active editor uses CodeMirror
  decorations. It removed the obsolete 86-line parallel implementation instead
  of adding artificial coverage, retained all 64 covered files, and verified
  the complete desktop/compact Markdown UI plus all 16 production suites. The
  exact inventory is now 66 files and the baseline is 63.21% lines.
- Queue item 669 fixed Create View's same-tick duplicate-submit and unhandled
  persistence-rejection paths. Its real Electron regression injects an atomic
  bundle-write failure, proves two synchronous submits persist no view,
  requires an actionable alert and retained dialog, then verifies retry creates
  exactly one view in desktop and compact viewports. The renderer aggregate is
  now 63.53% lines/statements, 25.28% functions, and 63.98% branches; the full
  production run passed 16 suites, 79 screenshots, and 48 strict zero-diff
  baselines with no console errors.
- Queue item 670 made all Property Manager schema writes transactional at the
  UI boundary, added visible failure/retry state and dismissal blocking, and
  upgraded its desktop/compact Electron artifact contract with injected atomic
  write failure plus synchronous duplicate-submit proof. It also fixed
  backlink watcher reinstallation after incremental refresh and disposed
  leaked watcher fixtures found by the core gate. The full production run
  passed 16 suites, 79 screenshots, and 48 strict zero-diff baselines with no
  console errors.
- Queue item 671 made rename, duplicate, set-default, and delete actions in the
  View Context Menu single-flight and recoverable. Its desktop/compact
  Electron regression injects a bundle-write failure, proves same-tick
  duplicate clicks persist zero views, retains the erroring menu, and verifies
  retry creates exactly one view. The full production run passed 16 suites, 79
  screenshots, and 48 strict zero-diff baselines.
- Queue item 672 made Database Settings page-open-mode and lock persistence
  single-flight and recoverable. Its desktop/compact Electron regression
  persists Center peek, injects an exact metadata-write failure, proves
  same-tick Lock duplication leaves the database unlocked and menu recoverable,
  then verifies retry locks exactly once. The full production run passed 16
  suites, 79 screenshots, and 48 strict zero-diff baselines.
- Queue item 673 made every persistent Column Header Menu action single-flight
  and recoverable. Its desktop/compact Electron regression injects a
  bundle-write failure, proves same-tick Duplicate property activation leaves
  zero live and reloaded copies, retains the erroring menu, and verifies retry
  creates exactly one copy. The full production run passed 16 suites, 79
  screenshots, and 48 strict zero-diff baselines.
- Queue item 674 made Group Settings save single-flight and recoverable. Its
  Electron regression injects a view-write failure, proves two synchronous
  saves leave persisted groups empty while retaining the two-level draft and
  dialog error, then verifies retry persists exactly one configuration. The
  full production run passed 16 suites, 79 screenshots, and 48 strict zero-diff
  baselines.
- Queue item 675 made Deleted Rows restore/permanent delete dialog-wide
  single-flight and recoverable. Its desktop/compact Electron regression
  injects a restore bundle-write failure, proves two synchronous activations
  leave an unresolved tombstone rather than a hidden successful restore, and
  verifies retry restores exactly once with body/metadata intact. The full
  production run passed 16 suites, 79 screenshots, and 48 strict zero-diff
  baselines.
- Queue item 676 made Row Context Menu rename/duplicate/delete single-flight
  and recoverable. Its desktop/compact Electron regression injects a duplicate
  bundle-write failure, proves two synchronous activations create zero hidden
  copies while retaining the erroring menu, and verifies retry creates exactly
  one independent row. The full production run passed 16 suites, 79
  screenshots, and 48 strict zero-diff baselines.
- Queue item 690 added page-cover offset failure/retry/discard evidence to Page
  Secondary across desktop, compact, wide, and laptop. Adding the deterministic
  cover fixture changed only the two displayed Git short hashes, so the three
  page-history policies were intentionally re-recorded and then passed strict
  zero-pixel comparison. The full production run passed 16 suites, 79
  screenshots, 48 strict baselines, 8,692,344 image bytes, and zero console
  errors.

Unmet acceptance requirements:

- All 16 default production visual suites now have intentional desktop,
  compact, and wide perceptual baselines. Multi-phase suites additionally keep
  structural screenshot contracts for their non-representative phases.
- Both named real-workspace passes are verified independently and in the
  required nightly aggregation, while the portable PR/release command remains
  independent of private local data.
- The nightly artifact index groups every fixture/workspace by theme, viewport,
  baseline mode/status, screenshot evidence, and reproduce command.

Required before promotion:

- Raise renderer coverage deliberately from the current 64.08% line baseline
  toward the longer-term target; the historical gate now
  prevents any of the four verified metrics from declining during that work.
