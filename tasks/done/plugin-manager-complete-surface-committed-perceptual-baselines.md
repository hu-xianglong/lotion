# Plugin Manager Complete-Surface Committed Perceptual Baselines

Status: done

Verification status: verified

## Goal

Debug and stabilize the Plugin Manager final list surface, then promote its
desktop, compact, and wide screenshots to intentional committed production
baselines.

## Acceptance Criteria

- Capture the complete Plugin Manager surface without scroll-container or
  fixed-position overlay artifacts.
- Prove all seven plugin rows, all fourteen provider icons, the summary, and
  the final extension-point section are inside the captured manager.
- Preserve permission, detail, lifecycle, command-search, notification, and
  source-drilldown interaction coverage.
- Commit checksum-backed policies with exact dimensions and strict zero
  perceptual-diff thresholds for desktop, compact, and wide.
- Require all three records through child, production, and release artifact
  contracts.
- Add negative coverage for missing perceptual evidence, incomplete/clipped
  final-state geometry, and deliberate committed-image mutation.
- Record the faulty evidence, fix, repeatability proof, manual review, commands,
  artifacts, and exact results before moving the task to done/verified.

## Debugging

- Two byte-identical initial runs were visually invalid: capturing the manager
  inside the scrolled `management-view` viewport overlaid the fixed tab strip,
  hid the title/summary and most providers, and left a large blank tail.
- The runner now resets the management scroll position and temporarily exposes
  the full overflow surface only while capturing, restoring all inline styles
  afterward.
- A first corrected retry failed while opening the workspace before reaching
  Plugin Manager; consecutive direct runs are being used to distinguish that
  startup flake from the surface fix.

## Delivered

- Reset the owning management scroller and temporarily exposed the full manager
  overflow only during capture, restoring every affected inline style in a
  `finally` block.
- Added final-state metadata requiring seven plugin rows, fourteen provider
  icons, the summary, and the final extension-point section to remain inside a
  positive-height manager at scroll offset zero.
- Added reviewed 912x2284 desktop, 744x2598 compact, and 912x2284 wide PNGs
  with checksum-backed, strict zero-pixel policies.
- Required the three baseline records through the Plugin Manager child
  contract, aggregate production gate, and release artifact summary.
- Added missing-baseline, clipped/incomplete-provider, and deliberate
  committed-PNG mutation negatives while retaining permission, detail,
  lifecycle, command, notification, and source-drilldown assertions.

## Verification

Verified on 2026-07-22.

- The original byte-identical but invalid captures were
  `artifacts/ui-smoke/plugin-manager-ui-2026-07-23T05-18-07-911Z/` and
  `artifacts/ui-smoke/plugin-manager-ui-2026-07-23T05-18-46-362Z/`.
  Manual review found the tab strip overlaid the top content, only three of
  eleven field providers were visible, and the image ended in a large blank
  tail. Their stable checksums therefore were explicitly rejected as baseline
  evidence.
- The first corrected attempt
  `artifacts/ui-smoke/plugin-manager-ui-2026-07-23T05-20-10-760Z/` timed out
  during shared workspace startup before Plugin Manager interaction.
  Consecutive corrected runs
  `artifacts/ui-smoke/plugin-manager-ui-2026-07-23T07-25-43-755Z/` and
  `artifacts/ui-smoke/plugin-manager-ui-2026-07-23T07-27-57-712Z/` then passed
  and produced byte-identical images:
  - desktop:
    `087778866ded4b15238ed919b48fa914af0e494618f34d7dee02d60f57354c7d`;
  - compact:
    `cf91c4fd89848595e2164ae1ef9d8e3c5982f4e3e55e587f10431a53d030ae3b`;
  - wide:
    `abc03356c8a3a176df0275f1db4af76e84617849c1ec8d33af8b40b5a2683883`.
- Manual desktop and compact review confirmed four summary tiles, all seven
  plugin permission/lifecycle rows, all eleven field providers, the Kanban
  view provider, both other providers, and all twenty-three registered
  extension points without overlay, clipping, or blank tail.
- `node --test test/ui-harness-artifacts.test.mjs
  test/production-visual-baseline.test.mjs test/test-release.test.mjs` passed
  104/104 tests: 89 artifact/aggregation tests, eight visual-baseline tests,
  and seven release tests.
- The focused production gate passed three screenshots totaling 1,203,297
  bytes, three strict zero-pixel baseline comparisons, zero console errors,
  and the renderer coverage/trend gates:
  `artifacts/ui-smoke/ui-suite-2026-07-23T07-32-33-877Z/production-visual-gate/production-visual-gate.json`.
- `npm run typecheck`, `npm run test:task-docs`, and `git diff --check` passed.

## Remaining Umbrella Work

Additional critical surfaces still need reviewed baselines. The umbrella also
needs a decision on aggregating both real-workspace runners into nightly
production and deliberate renderer coverage improvements.
