# Settings Center Committed Perceptual Baselines

Status: done

Verification status: verified

## Goal

Debug and stabilize the unified Settings Center final Plugins state, then
promote its desktop, compact, and wide screenshots to intentional committed
production baselines.

## Acceptance Criteria

- Prove the final Plugins state is repeatable across all default production
  viewports without capturing an in-flight CSS transition.
- Record and validate active-tab selection/style, pane visibility, scroll
  position, and focus stability in screenshot metadata.
- Preserve the existing General, search jump, Search & AI deep link, Import,
  Plugins, category, and geometry interaction coverage.
- Commit checksum-backed policies with exact dimensions and strict zero
  perceptual-diff thresholds.
- Require all three Settings Center records through child, production, and
  release artifact contracts.
- Add negative coverage for missing perceptual evidence, invalid final state,
  and deliberate committed-image mutation.
- Record repeatability, manual review, commands, artifacts, and exact results
  before moving the task to done/verified.

## Delivered

- Added reviewed Settings Center Plugins-state PNGs and checksum-backed strict
  policies for desktop 912x535, compact 744x569, and wide 912x535 captures.
- Waited for the active Plugins tab's CSS animations to finish, removed
  transient focus, and recorded its selected state and final background,
  border, and text colors.
- Proved the pane and all seven plugin rows are visible inside the Settings
  Center with zero navigation and pane scroll offsets.
- Required all three records alongside Design System and White Theme evidence
  in production and release aggregation.
- Added missing-baseline, unsettled-transition, clipped-final-row, and
  deliberate committed-PNG mutation negatives.

## Debugging

- Initial consecutive screenshots differed by 8,625-9,012 raw pixels, all
  inside the active Plugins tab. The global button transition was captured at
  different points in its 120ms background/border/color animation even though
  the default perceptual threshold classified the subtle deltas as zero.
  Waiting on the real element animations produced byte-identical screenshots
  instead of accepting the timing noise.
- Manual compact review showed the final GitHub Backup row ending exactly at
  the screenshot boundary. Geometry evidence now proves seven of seven rows
  are visible and the final row remains fully inside the center; a clipped-row
  fixture is rejected.
- The first final production attempt failed on compact while clicking the
  visible Search & AI `Advanced` tab:
  `artifacts/ui-smoke/settings-center-ui-2026-07-23T05-00-40-897Z/`.
  React was replacing the button often enough that Playwright could not obtain
  consecutive stable action frames. The runner now first proves the live tab
  is visible, enabled, and 85x30, dispatches its DOM click, then requires
  `aria-selected=true`. This retains action evidence while removing the false
  actionability timeout.

## Verification

Verified on 2026-07-22.

- Stabilized repeatability runs
  `artifacts/ui-smoke/settings-center-ui-2026-07-23T03-32-25-542Z/` and
  `artifacts/ui-smoke/settings-center-ui-2026-07-23T03-32-44-749Z/` produced
  byte-identical images:
  - desktop 912x535:
    `040c5f109bc2286082dc29e76c9e2aa0590bac0f2d120b597f4f91b0e0462c81`;
  - compact 744x569:
    `f285ca216a24605e227bfc51ac989b3d4121e4f9a40eeaeee5afcdd4dbe1130f`;
  - wide 912x535:
    `922313dfce3ade14375ad30a3d416cfc30aa1dfe387a6f08a6963473d45cf63c`.
- Manual review confirmed all eight navigation categories, selected Plugins
  tab, plugin summary/actions, all seven active plugin rows, and readable
  compact wrapping without overlap or clipping.
- Focused production gate:
  `artifacts/ui-smoke/ui-suite-2026-07-23T05-16-29-507Z/production-visual-gate/production-visual-gate.json`.
  It passed three screenshots (231,899 bytes), three committed baselines,
  strict zero diffs, zero console errors, and the renderer coverage trend.
- Visual/baseline, Settings Center artifact, production aggregation, and
  release tests passed, including missing, transition, clipping, and mutation
  negatives.
- Full UI harness artifact tests, release tests, `npm run typecheck`,
  `npm run test:task-docs`, and `git diff --check` passed.

## Remaining Umbrella Work

Additional critical surfaces still need reviewed baselines. The umbrella also
needs a decision on aggregating both real-workspace runners into nightly
production and deliberate renderer coverage improvements.
