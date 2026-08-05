# White Theme Page Committed Perceptual Baselines

Status: done

Verification status: verified

## Goal

Promote the deterministic White Theme main-page screenshots from structural
theme evidence to intentional committed production baselines across desktop,
compact, and wide viewports.

## Acceptance Criteria

- Prove the White Theme page phase is repeatable across all three default
  production viewports before accepting images.
- Keep the search, database, and LLM plugin phase screenshots and structural
  contracts intact while attaching perceptual evidence only to the stable page
  phase.
- Commit checksum-backed policies with exact dimensions and strict zero
  perceptual-diff thresholds.
- Require all three page baselines through White Theme, production, and release
  artifact contracts.
- Add negative coverage for missing page-phase evidence and deliberate
  committed-image mutation.
- Manually review the accepted images and record commands, artifact paths,
  hashes, dimensions, test results, and any debugging findings before moving
  the task to done/verified.

## Delivered

- Added committed White Theme page policies and PNGs for desktop 1440x1000,
  compact 1040x820, and wide 1728x1100 with strict zero perceptual-diff
  thresholds.
- Attached perceptual evidence only to each viewport's `page` phase while
  preserving all 12 page/search/database/plugin screenshots and their theme,
  focus, geometry, and console contracts.
- Required the three White Theme records alongside the three Design System
  records in default production and release summaries.
- Added contract coverage for missing page baseline evidence and unstable
  hidden scrolling, plus deliberate committed-image mutation coverage.

## Debugging

- Two initial pre-acceptance runs appeared repeatable, but the first run after
  wiring the strict policy correctly failed with 23,224 differing desktop
  pixels (1.613%). The editor had asynchronously focused and programmatically
  scrolled `.main-content` by 43px even though that container uses
  `overflow: hidden`; the page header moved from top 43 to top 0.
- The runner now blurs editor focus, resets `.main-content` and `.page-editor`
  across animation frames, and records both zero scroll offsets. The artifact
  contract rejects either offset when nonzero.
- Wide captures also alternated by 1,944 raw pixels on a two-pixel vertical
  edge. This was the collapsed floating TOC's 140ms border/background
  transition at x=1652. The runner now waits for the host to be collapsed with
  a transparent border before resetting scroll and capturing. Consecutive
  current runs then became byte-identical at all three viewports.

## Verification

Verified on 2026-07-22.

- Consecutive stabilized runs
  `artifacts/ui-smoke/white-theme-ui-2026-07-23T03-27-52-218Z/` and
  `artifacts/ui-smoke/white-theme-ui-2026-07-23T03-28-22-867Z/` produced the
  same page PNG checksums:
  - desktop: 1440x1000,
    `f690425c7f2f77e6aad41e8b37c687c0043ab9956f1d7d67097b98246dee7092`;
  - compact: 1040x820,
    `d153da9ecfd5109d40f2a9f14b3314feba71ee223fdc6d6ff39868b7e1cea32f`;
  - wide: 1728x1100,
    `511dd42039cdee78ed3ad2ed57bc2e784cc8b82df4b557b64055b2d63a305bae`.
- Manual review confirmed complete light-theme sidebar, tabs, header, page
  details, editor content, actions, and collapsed TOC affordance without
  clipping or accidental scroll in all three accepted images.
- Focused production gate:
  `artifacts/ui-smoke/ui-suite-2026-07-23T03-29-05-679Z/production-visual-gate/production-visual-gate.json`.
  It passed 12 screenshots (757,579 bytes), three committed page baselines,
  strict zero diffs, zero console errors, and the renderer coverage trend.
- Visual/baseline, White Theme artifact, production aggregation, and release
  tests passed, including mutation, missing-evidence, and hidden-scroll
  negatives.
- Full UI harness artifact tests, release tests, `npm run typecheck`,
  `npm run test:task-docs`, and `git diff --check` passed.

## Remaining Umbrella Work

The umbrella still needs committed evidence for additional critical surfaces,
a decision on aggregating both verified real-workspace runners into the nightly
production command, and deliberate renderer coverage improvements.
