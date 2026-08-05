# Page Properties Transactional Recovery

Status: done

Verification status: verified

## Goal

Debug top-level page tag, date, and URL editing so persistence failures are
visible and retryable, duplicate commits are suppressed, and dismissal restores
the last stored properties.

## Problems

- Property commits called a promise-returning parent through a callback typed
  as `void`. A write failure became an unhandled rejection after blur.
- Inputs retained the edited draft while disk retained the old metadata, with
  no error, Retry, or explicit rollback.
- Tags, date, and URL could start competing writes and repeated Retry had no
  synchronous ownership guard.
- Page UI coverage proved rendering, links, history, and editing, but never
  failed a real page metadata write.

## Debugging

- Added a Page Properties mutation controller that acquires ownership before
  awaiting, normalizes arbitrary thrown values, retains the exact failed input,
  and exposes single-flight Retry and dismissal.
- All three inputs are disabled while persistence or unresolved recovery owns
  the panel. Failure renders a local alert instead of leaking rejection.
- Retry reuses the retained input exactly. `Discard changes` clears recovery
  and resets tags/date/URL drafts from the last stored props.
- Added a one-shot page metadata failure hook consumed before the pages CSV
  write, allowing atomic rollback to be tested without touching Markdown.
- Extended the real Page Secondary Electron flow to fail a tag edit, compare
  stored metadata, retain the draft, double Retry, fail a second edit, Discard,
  and restore the baseline fixture before history screenshots.
- The Electron audit also exposed hover-state instability after programmatic
  recovery actions. The harness now moves outside before re-hovering the panel,
  matching a fresh user entry and avoiding hidden-child pointer interception.

## Verification

- `npm run typecheck`, `npm run build`, and `npm run
  test:renderer-components` passed. The controller contract covers synchronous
  competing-submit suppression, raw-string errors, exact Retry, duplicate
  Retry suppression, dismissal, duplicate dismissal, and idle recovery.
- `node --test test/ui-harness-artifacts.test.mjs` passed 114/114, including a
  negative that removes exact Retry persistence evidence.
- `node --test test/package-core.test.mjs` passed 48/48. The new PageService
  regression injects a metadata failure, reloads unchanged tags/date, retries,
  and reloads the exact recovered values. `npm run test:customer-api` passed
  6/6.
- `LOTION_UI_VIEWPORTS='desktop,compact,wide:1728x1100' npm run
  smoke:page-secondary-ui` passed desktop, compact, wide, and laptop. Every
  viewport proved rollback, retained draft, blocked competing controls,
  duplicate-Retry suppression, exact recovery, Discard disk preservation, and
  draft reset. Existing page history, backlinks, editor, TOC, and three strict
  history baselines remained green at zero pixel difference. Evidence:
  `artifacts/ui-smoke/page-secondary-ui-2026-07-24T01-36-05-848Z/`
  (4 screenshots, 165,720 bytes).
- Renderer coverage passed with 64/66 source files executed and aggregate
  coverage of 64.49% lines/statements, 27.51% functions, and 66.70% branches.
  `PageProperties.tsx` recorded 83.02% lines, 46.66% functions, and 65.00%
  branches.
- `npm run test:task-docs` passed with 698 files, 824 task references, and 686
  queue items; `git diff --check` passed.
- `npm run test:production-visual` passed the post-promotion gate with 16
  required suites, 79 snapshots, 48 perceptual baselines at zero pixel
  difference, and 8,691,535 image bytes. The gate recorded the promoted
  renderer baseline in
  `artifacts/ui-smoke/ui-suite-2026-07-24T01-37-21-109Z/production-visual-gate/production-visual-gate.json`.
