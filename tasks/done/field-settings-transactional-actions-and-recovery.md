# Field Settings Transactional Actions And Recovery

Status: done

Verification status: verified

## Goal

Debug Field Settings persistence so save, per-view wrap, and hide actions are
single-flight, failures remain visible and retryable without losing the draft,
and pending work cannot be dismissed or replaced by a competing action.

## Problems

- Save used asynchronous React state for duplicate suppression, so two
  same-tick clicks could both enter persistence.
- The saving state reset and close happened after an unguarded `await`. A
  rejected save therefore left the dialog permanently busy and produced an
  unhandled rejection with no local recovery path.
- Wrap and Hide were separate fire-and-forget persistence paths. Hide closed
  the dialog before its view mutation had succeeded.
- Backdrop, Close, Cancel, and every editor control remained active while any
  persistence operation was pending.
- A same-field prop refresh could overwrite a failed local draft.
- Existing renderer coverage only server-rendered idle field variants; it did
  not cover concurrency, failure normalization, dismissal, or Retry.

## Acceptance Criteria

- Route save, wrap, and hide through one synchronous single-flight guard.
- Normalize thrown and raw failures into a local alert with Retry.
- Retain the accepted operation and current draft; ignored competing actions
  must not replace the Retry target.
- Disable the complete dialog control surface and block backdrop, header, and
  cancel dismissal while persistence is pending.
- Preserve a failed same-field draft while still hydrating idle or switched
  fields.
- Await Hide before closing instead of treating a requested mutation as a
  successful one.
- Add real-source coverage for hydration, dismissal, concurrency, failure
  normalization, guard reset, and Retry.
- Inject a real field-update persistence failure in desktop and compact
  Electron flows, proving rollback, draft retention, dismissal blocking,
  duplicate suppression, successful Retry, and competing Hide suppression.
- Require complete artifact evidence and reject missing rollback or
  exactly-once proof.
- Run focused/core/coverage/UI/production/typecheck/build/task-doc/diff gates
  and record exact evidence.

## Debugging

- Replaced `isSaving` with a ref acquired synchronously before awaiting. All
  three persistence actions use the same runner and one pending owner.
- Moved pending cleanup into `finally`, normalized arbitrary rejection values,
  retained the accepted operation for Retry, and only ran success transitions
  after persistence resolved.
- Added an explicit draft hydration policy so a failed same-field refresh does
  not erase edits while idle and switched-field inputs still hydrate.
- Wrapped all editable controls in a disabled fieldset, marked the dialog busy,
  and routed backdrop, Close, and Cancel through the synchronous guard.
- Changed Database Table integration to return the actual wrap/hide promises.
  Field Settings now closes after a successful Hide rather than immediately.
- Extended the Property Manager Electron scenario after its existing focused
  editor transition. The smoke edits a real field, arms the existing atomic
  bundle-write failure, double-submits, dispatches backdrop dismissal, checks
  the reloaded bundle, and retries while also invoking Hide.
- Extended the artifact contract with explicit rollback, retained-draft,
  pending/retry dismissal, exactly-once rename, and competing-hide evidence,
  including deliberate missing-evidence negatives.

## Verification

- `npm run typecheck` and `npm run test:renderer-components` passed. The
  real-source contract covers same-field draft preservation, idle/switch
  hydration, dismissal, same-tick suppression, raw failure normalization,
  guard reset, and Retry.
- `node --test test/database-property-manager-artifacts.test.mjs
  test/database-column-menu-artifacts.test.mjs
  test/database-view-menu-artifacts.test.mjs
  test/database-row-menu-artifacts.test.mjs` passed 7/7, including negative
  artifact evidence for missing rollback and exactly-once recovery.
- `LOTION_UI_VIEWPORTS=desktop,compact npm run
  smoke:database-property-manager-ui` passed. Both viewports surfaced
  `Injected field settings persistence failure`, retained the edited name,
  proved the stored name and active-view visibility were unchanged after
  failure, blocked dismissal during submit and Retry, suppressed a competing
  Hide, and recovered to exactly one visible renamed field. Evidence:
  `artifacts/ui-smoke/database-property-manager-ui-2026-07-24T00-14-57-532Z/`
  (2 screenshots, 328,497 bytes).
- Direct service coverage injected an `updateField` bundle failure, required
  `DATABASE_PERSISTENCE_FAILURE`, and reloaded the unchanged field name.
  `node --test test/package-core.test.mjs` passed 45/45.
- Renderer coverage passed with 64/66 source files executed and aggregate
  coverage of 64.17% lines/statements, 26.67% functions, and 65.90% branches.
  `FieldSettingsDialog.tsx` recorded 50.08% lines, 18.18% functions, and
  60.34% branches.
- `npm run build` passed; its only diagnostic was the existing large-chunk
  warning.
- `npm run test:production-visual` passed the full production gate: 16 required
  suites, 79 screenshots, 48 perceptual baselines, and 8,691,920 image bytes.
  Every perceptual comparison passed at zero diff. The embedded post-promotion
  coverage gate matched this task's baseline exactly at 64.17%
  lines/statements, 26.67% functions, and 65.90% branches. Gate evidence:
  `artifacts/ui-smoke/ui-suite-2026-07-24T00-16-51-296Z/production-visual-gate/production-visual-gate.json`.
