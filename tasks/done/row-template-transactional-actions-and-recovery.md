# Row Template Transactional Actions And Recovery

Status: done

Verification status: verified

## Goal

Debug Row Template management so save and delete are single-flight, failures
remain visible and retryable without losing the draft, pending work cannot be
silently dismissed, and the real template storage boundary has executable
failure coverage.

## Problems

- Save and delete relied on asynchronous React state for duplicate suppression,
  allowing two same-tick actions to enter persistence.
- Rejected operations reset the spinner in `finally` but surfaced no local
  error or Retry action.
- Backdrop, Close, Cancel, template selection, and every editor control
  remained active while persistence was pending.
- Schema refreshes could re-run the selected-template hydration effect and
  erase a failed same-template draft.
- A competing ignored action could replace the operation intended for Retry.
- Template persistence writes a separate CSV and Markdown page path, bypassing
  the existing database bundle fault injection. The real failure flow therefore
  had no deterministic test boundary.
- Existing tests only server-rendered the successful idle dialog.

## Acceptance Criteria

- Route save and delete through one synchronous single-flight guard.
- Normalize thrown and raw failures into a local alert with Retry.
- Retain the accepted operation and current draft; an ignored action must not
  replace either.
- Disable the full dialog control surface and block backdrop/header/cancel
  dismissal while persistence is pending.
- Preserve a failed same-template draft while hydrating idle or newly selected
  templates.
- Make template persistence consume the existing database bundle failure hook
  before its first filesystem mutation and return a typed persistence error.
- Add real-source tests for hydration, dismissal, concurrency, normalization,
  guard reset, and retry, plus a direct service assertion.
- Inject the real failure in desktop and compact Electron flows, proving zero
  partial templates, retained draft, pending dismissal blocking, and exactly
  one template after Retry.
- Require complete artifact evidence and reject missing rollback or
  exactly-once proof.
- Run focused/core/coverage/UI/production/typecheck/build/task-doc/diff gates
  and record exact evidence.

## Debugging

- Replaced the `saving` state gate with a ref acquired before awaiting. Both
  save and delete use the same action runner, so competing actions are ignored
  synchronously and one pending transition owns the dialog.
- Stored the accepted operation and success transition for Retry only while
  idle. Failures keep the dialog open, normalize any rejection value, reset the
  guard, and retain the draft.
- Added an explicit hydration policy. Failed same-template prop refreshes no
  longer overwrite local inputs, while idle refreshes and deliberate template
  switches still hydrate normally.
- Wrapped the entire layout in a disabled fieldset, marked the dialog busy, and
  routed backdrop, Close, Cancel, and template selection through the guard.
- Factored the existing database bundle failure consumption and invoked it
  before template upsert/delete storage. Template I/O failures are now wrapped
  as `DATABASE_PERSISTENCE_FAILURE`, matching other database writes.
- Extended the created-views Electron smoke through Database settings →
  Templates. It enters a new name, arms the bundle failure, double-submits,
  checks the live reloaded bundle contains no template, retries twice while
  dispatching backdrop dismissal, and requires exactly one matching template.
  The successful fixture template is deleted before the clean visual capture.
- Added focused artifact positives and missing-rollback/exactly-once negatives,
  and made aggregate created-view evidence require template recovery.

## Verification

- `npm run typecheck` and `npm run test:renderer-components` passed. The
  real-source contract covers same-template draft preservation, idle/switch
  hydration, dismissal, same-tick suppression, raw failure normalization,
  guard reset, and retry.
- `node --test test/database-template-recovery-artifacts.test.mjs
  test/database-view-settings-recovery-artifacts.test.mjs
  test/database-sort-recovery-artifacts.test.mjs
  test/database-filter-recovery-artifacts.test.mjs` passed 12/12.
- `node --test test/ui-harness-artifacts.test.mjs` passed 113/113 with template
  recovery required by the aggregate created-views fixture.
- `LOTION_UI_VIEWPORTS=desktop,compact npm run
  smoke:database-created-views-ui` passed. Both viewports surfaced `Injected
  template persistence failure`, retained the entered name, proved zero stored
  templates after failure, blocked backdrop dismissal during submit and Retry,
  and created exactly one template on recovery. Both strict visual baselines
  remained at zero diff. Evidence:
  `artifacts/ui-smoke/database-created-views-ui-2026-07-23T23-43-07-519Z/`
  (2 screenshots, 100,526 bytes).
- Renderer coverage passed with 64/66 source files executed and aggregate
  coverage of 64.16% lines/statements, 26.58% functions, and 65.77% branches.
  `RowTemplateDialog.tsx` recorded 73.50% lines, 22.72% functions, and 69.56%
  branches.
- `node --test test/package-core.test.mjs` passed 45/45, including direct
  service proof that an injected template save failure returns
  `DATABASE_PERSISTENCE_FAILURE` and leaves no stored template. `npm run build`
  also passed; its only diagnostic was the existing large-chunk warning.
- `npm run test:production-visual` passed the full production gate: 16 required
  suites, 79 screenshots, 48 perceptual baselines, and 8,692,062 image bytes.
  Every perceptual comparison passed at zero diff. The embedded post-promotion
  coverage gate matched this task's baseline exactly at 64.16%
  lines/statements, 26.58% functions, and 65.77% branches. Gate evidence:
  `artifacts/ui-smoke/ui-suite-2026-07-23T23-44-57-134Z/production-visual-gate/production-visual-gate.json`.
