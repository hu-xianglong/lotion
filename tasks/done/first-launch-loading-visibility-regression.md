# First Launch Loading Visibility Regression

Status: done

Priority: highest

Reported by user: first opening Lotion takes too long. Users need visibility
into what is loading, and the slow path must be covered by frontend tests,
especially for large workspaces/files.

## Goal

Diagnose and fix slow cold-start / first workspace open behavior with evidence.
Lotion should show clear, user-visible loading phases instead of appearing
stuck, and startup performance should be protected by a deterministic frontend
test using a large workspace fixture.

## Acceptance

- Add startup instrumentation that identifies major cold-load phases, such as
  app shell boot, workspace config read, `lotion.json` read, pages/system
  database load, user database discovery, current page markdown load, sidebar
  recent/pages render, backlinks load, import/audit metadata load, search/index
  initialization, and first editor paint.
- Produce a concise diagnosis of which phase or phases dominate first-open
  latency on a large workspace.
- Add a visible loading/progress surface during first launch that tells the user
  what is currently loading, not just a blank or frozen window.
- The loading UI must degrade gracefully: show staged messages, recover on
  errors, and transition cleanly to the active workspace/page.
- Use a deterministic large workspace fixture or generator. It should include
  many pages, imported Notion-style pages, large markdown files, attachments or
  placeholder files where practical, databases, row pages, backlinks, and recent
  navigation entries.
- Do not rely on the user's personal workspace for automated tests. If a real
  manual workspace is used for exploratory diagnosis, record the finding but keep
  automated coverage deterministic.
- Startup should not block the whole UI on non-critical work if that work can be
  deferred safely, such as backlinks, search/index warmup, audit metadata, or
  heavy sidebar expansion.
- The first visible page/editor should become usable under a documented
  threshold for the large fixture, with heavier background work continuing with
  clear status where needed.

## Required Tests

- Add a coded frontend cold-start UI smoke/regression using the shared
  Electron/Playwright harness.
- The test must launch or reload into a large fixture workspace and assert:
  visible loading status, at least two concrete phase/status messages, no blank
  stuck screen, eventual active page title/editor render, editor usability, no
  console/page errors, and no horizontal overflow.
- Add a startup latency benchmark or gate that records phase timings and fails
  when first usable page/editor latency exceeds a documented threshold.
- Add backend/package-core coverage for any startup phase tracker, large fixture
  generator, cache/deferred-load behavior, or workspace discovery change.
- Include desktop and compact viewport coverage unless the implementation proves
  startup UI is viewport-independent.

## Gates

- `node --check <new-or-updated-first-launch-ui-smoke>`
- `npm run typecheck`
- focused first-launch large-workspace UI smoke
- focused startup latency benchmark with phase timing output
- backend/package-core tests for changed startup/cache/deferred-load behavior
- `git diff --check`

## Result

- Added a visible first-launch loading screen with staged startup phases:
  workspace open, workspace index read, restored page navigation, and first
  editor paint.
- Added startup phase telemetry exposed to UI tests through
  `window.__lotionStartupPhases` and logged as `[lotion startup] ...`.
- Added a deterministic large startup fixture used by both Electron UI smoke and
  service-level startup latency benchmark. The UI fixture covers desktop and
  compact viewports with pages, databases, recent navigation, large markdown,
  embedded database references, and backlinks.
- Added a startup latency benchmark covering the same startup-like sequence as
  the renderer bootstrap: workspace open, pages/databases/tree/favorites/recents
  index, and first page read.
- Fixed the React console error found by the first-launch smoke by deferring
  embedded database view `root.unmount()` to the next tick instead of unmounting
  synchronously during a render cycle.

## Diagnosis

- Service-side startup for the deterministic large fixture is not the dominant
  bottleneck: `npm run test:startup-latency` measured medians of about
  `1.292ms` workspace open, `2.261ms` index read, `0.587ms` first page read,
  and `4.102ms` total, with a cold max total of `24.212ms`.
- The user-visible regression was primarily that the renderer could remain
  blank or appear frozen while bootstrap work and first editor paint happened.
  The fix makes that work visible and testable.
- No backend/package-core startup/cache behavior changed. The focused service
  benchmark exercises the customer API/service path; renderer/component and
  Electron UI smoke cover the UI and embedded-view lifecycle change.

## Verification

- `node --check scripts/smoke-first-launch-ui.mjs`
- `node --check scripts/bench-startup-latency.mjs`
- `npm run test:renderer-components`
- `npm run typecheck`
- `npm run test:startup-latency`
- `npm run smoke:first-launch-ui`
- `git diff --check`
