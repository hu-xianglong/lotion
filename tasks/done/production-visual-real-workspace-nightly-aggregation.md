# Production Visual Real-Workspace Nightly Aggregation

Status: done

Verification status: verified

## Goal

Decide and implement how the two named real-workspace visual passes participate
in production-quality testing without making the portable PR/release gate depend
on private local data.

## Decision

- Keep `test:production-visual` portable and deterministic.
- Add an explicit nightly/local deep gate that runs the portable production
  gate plus both isolated named real-workspace runners.
- The deep gate must fail with actionable prerequisites when either source
  workspace is unavailable; it must never silently skip a required runner.
- Pass each source path only to its own child process and redact original paths
  from persisted artifacts.
- Aggregate default fixture suites and both real workspaces into one
  machine-readable and Markdown coverage matrix grouped by fixture/workspace,
  theme, viewport, baseline mode/status, snapshots, and reproduce command.

## Acceptance Criteria

- Add a concrete npm command for the nightly production visual aggregation.
- Validate both named workspace roots before starting expensive UI work.
- Require a fresh passing portable production gate and fresh passing manifests
  for both real-workspace runners.
- Require the full desktop/compact/wide portable matrix and desktop/compact
  coverage for each real workspace.
- Record committed perceptual-baseline status for portable suites and explicit
  structural-contract-only status for real workspace screenshots.
- Persist JSON and Markdown artifacts without original source paths.
- Add focused positive and negative tests for missing runners, failed status,
  missing viewports/baselines, path leakage, and source-safety evidence.
- Run the real deep gate successfully against both local named workspaces,
  inspect representative screenshots, and record exact verification evidence.
- Update the production visual umbrella, then move this task to done/verified.

## Debugging

- Repaired Chromium harness startup when the kernel returned port `65535`,
  which Chromium reserves as its random-port sentinel.
- Isolated cross-suite workspace and locale state, and made visual captures
  deterministic across typography, pointer hover, focus, scroll position,
  animation completion, virtualized CodeMirror content, and full-surface
  sizing.
- Repaired false-positive or flaky captures in White Theme, Search, Search &
  AI, Markdown Preview, Embedded View, Created Views, Database Interaction,
  and Page History without relaxing the zero-pixel committed-baseline policy.
- Changed Database Interaction's dynamic full-page capture to use a validated
  clip rectangle instead of waiting indefinitely for the virtualized `body`
  element to become stable.
- Added explicit Page History version typography after a selected version's
  composited text intermittently changed rasterization while all geometry
  remained identical.
- The first complete deep-gate execution passed all 16 portable suites and both
  real workspaces, then exposed an aggregation bug: Page Secondary intentionally
  records an additional `laptop` diagnostic viewport. The aggregator now
  requires desktop/compact/wide as a subset, preserves additional diagnostic
  viewports in the matrix, and still rejects any missing required viewport.
- Kept `test:production-visual` unchanged and portable. The new
  `test:production-visual:nightly` validates both named workspace prerequisites
  before expensive work, runs fresh child processes, and never silently skips
  unavailable private data.

## Verification

- `npm run test:production-visual:nightly` passed end to end on 2026-07-23.
  The report is
  `artifacts/ui-smoke/production-visual-nightly-2026-07-23T21-10-29-600Z/production-visual-nightly.json`
  with the adjacent Markdown review matrix.
- The passing matrix contains 18 rows: 16 deterministic portable fixtures and
  the two required real-workspace clones. It records 89 screenshots total
  (79 portable and 10 real-workspace), 48 strict committed perceptual
  baselines, `light` and `workspace-defined` themes, baseline mode/status,
  viewports, artifact links, and reproduce commands.
- All portable committed baselines passed at zero differing pixels across
  desktop, compact, and wide. Page Secondary additionally retained its laptop
  diagnostic viewport.
- Both real workspaces passed desktop/compact structural contracts:
  Lotion Demo Space produced Home and 500K-table evidence; Notion Import
  produced native Chinese-page, exact clone-seeded toggle/media, and real
  import-modal evidence. Both report byte-identical clone fingerprints,
  disallow symlinks, and prove the original source fingerprint was unchanged.
- The persisted aggregate contains no original source path and no
  `sourceRoot`/`sourcePath` field. Real workspaces are deliberately recorded as
  `structural-contract-only`; private screenshots are not promoted to portable
  committed PNG baselines.
- Renderer coverage passed the then-current historical gate. Queue item 666
  subsequently proved that the raw 130 entries contained 63 macOS path aliases;
  the corrected evidence is 67 distinct sources, 63 covered, with
  lines/statements 62.78%, functions 24.67%, and branches 63.44%.
- Focused contract and release tests passed: 148/148 across nightly aggregation,
  production baselines, UI harness artifacts, both real-workspace contracts,
  and release integration. The nightly aggregation suite itself passed 5/5,
  including missing/failed runner, missing viewport/baseline/theme, weak clone
  safety, source-path leakage, and extra diagnostic viewport coverage.
- `npm run typecheck`, `npm run build`, `npm run test:task-docs`, and
  `git diff --check` passed. Vite emitted only its existing large-chunk
  advisory.
- Representative screenshots were manually inspected for the compact 500K
  database, Notion toggle/media page, and Notion import modal; no clipping,
  horizontal overflow, blank content, or modal ownership defect was observed.
