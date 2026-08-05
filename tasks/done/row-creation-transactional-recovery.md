# Row Creation Transactional Recovery

Status: done

Verification status: verified

## Goal

Debug blank, template, grouped table/list, and Kanban row creation so failures
are visible and recoverable, duplicate input cannot create extra rows, and
group values are persisted atomically with the new row instead of through a
second fallible write.

## Problems

- Blank and template New-row handlers discarded their promises. A bundle write
  failure produced no local message or recovery path.
- Group-local `+ New` first persisted an empty row and then issued a separate
  batch update for group values. Failure of the second write left a real row in
  the wrong group even though the interaction failed.
- Repeated same-tick clicks could enter row creation more than once.
- After a failure, other New-row controls remained available and could replace
  the user's recovery intent.
- The Kanban provider repeated the same add-then-update pattern and restored its
  button after rejection without displaying the error.
- Existing grouping coverage only proved successful local creation; it did not
  inject a row-write failure, compare stored IDs, or prove exactly-once Retry.

## Acceptance Criteria

- Allow row creation to accept validated initial field values and include them
  in the first and only database bundle write.
- Reject unknown, system/computed, or invalid initial fields before
  persistence.
- Route React row-creation entries through a synchronous single-flight guard.
- Normalize arbitrary thrown values into a visible alert with retained Retry
  and explicit dismissal.
- Block blank, template, grouped table, and grouped list New-row controls while
  persistence is pending or recovery is unresolved.
- Make Kanban group-local New use the same atomic initial-value API and expose
  single-flight failure, Retry, and dismissal state.
- Add real-source coverage for duplicate suppression, pending ownership,
  non-Error normalization, guard reset, Retry, blocking policy, disabled grid
  semantics, and Kanban atomic input forwarding.
- Inject a real grouped-row bundle failure, prove no row ID is added, then
  prove double Retry creates exactly one fully assigned row.
- Require rollback, blocking, atomic assignment, and exactly-once recovery in
  the persisted grouping artifact contract, with a negative test.
- Run focused/core/API/coverage/Electron/typecheck/build/task-doc/diff and full
  production visual gates and record exact evidence.

## Debugging

- Extended `databases.addRow` through the preload, cache, and plugin workspace
  APIs with optional initial values. The service validates every field and
  applies template values followed by explicit initial values before its one
  `writeBundle` call.
- Replaced table/list grouped creation's add-then-batch sequence with one atomic
  add. Group and subgroup lookup now occurs inside the recoverable operation,
  so stale grouping state also reaches the visible error path.
- Added a shared row-creation runner that acquires its ref before awaiting,
  normalizes thrown strings and Errors, and always releases in `finally`.
- Retained the accepted operation for Retry. Blank, template, table footer,
  table/list group, and subgroup creation controls remain disabled until
  success or explicit dismissal.
- Changed Kanban New to forward its group value in the atomic add call. Its
  column-local guard keeps the button disabled after failure and renders Retry
  and dismiss controls instead of producing an unhandled rejection.
- Extended the grouping Electron smoke to double-click the group-local action
  under an injected bundle failure, compare the complete stored ID sequence,
  double-click Retry, and inspect the recovered row's two group fields.
- Strengthened the grouping artifact contract with failure-message, rollback,
  duplicate suppression, control blocking, atomic initial values, and
  exactly-once Retry requirements.
- A subsequent inline-cell audit found that `PluginViewBody` still adapted
  `workspace.addRow` with a one-argument wrapper and silently dropped Kanban's
  initial group values. The adapter now forwards `initialValues`, and the real
  Kanban Todo-column `+ New` flow asserts that the created row is stored with
  `status: Todo`.
- The first coverage run correctly rejected 0.01-point function and 0.09-point
  branch regressions. Missing busy/recovery policy and disabled-grid branches
  were then exercised instead of weakening the verified baseline.

## Verification

- `npm run typecheck`, `npm run build`, and `npm run
  test:renderer-components` passed. The only build diagnostic was the existing
  large-chunk warning.
- `node --test test/database-grouping-artifacts.test.mjs
  test/ui-harness-artifacts.test.mjs` passed 116/116. The focused grouping
  contract includes a negative that changes grouped-row rollback evidence to
  false.
- The direct service regression injects `Injected grouped row creation
  failure`, requires typed `DATABASE_PERSISTENCE_FAILURE`, reloads the unchanged
  record count, verifies a successful retry persists one `Todo / Medium` row,
  and rejects an invalid option before persistence. The full
  `test/package-core.test.mjs` gate passed 46/46.
- `npm run test:customer-api` passed, preserving the public customer surface
  while the optional initial-value capability remains backward compatible.
- `npm run smoke:database-grouping-ui` passed against the final build. A
  same-tick double click left the entire record ID sequence unchanged, retained
  a visible error and blocked competing controls. A same-tick double Retry
  created exactly one row whose `status` and `priority` were already `Todo` and
  `Medium`. Existing grouping save recovery, table/list grouping, reload
  collapse state, and Kanban shared grouping also passed. Evidence:
  `artifacts/ui-smoke/database-grouping-ui-2026-07-24T00-59-36-357Z/`
  (2 screenshots, 182,324 bytes).
- The subsequent adapter audit reran `npm run smoke:database-grouping-ui` and
  passed with explicit `kanbanLocalNew: true` evidence at
  `artifacts/ui-smoke/database-grouping-ui-2026-07-24T01-16-51-411Z/`
  (2 screenshots, 167,418 bytes).
- Renderer coverage passed with 64/66 source files executed and aggregate
  coverage of 64.27% lines/statements, 26.88% functions, and 66.09% branches.
  `DatabaseTable.tsx` recorded 46.02% lines, 14.91% functions, and 50.61%
  branches; `DatabaseTableGrid.tsx` recorded 96.15% lines and 90.90% branches.
- `npm run test:production-visual` passed the post-promotion gate with 16
  required suites, 79 snapshots, 48 perceptual baselines at zero pixel
  difference, and 8,691,733 image bytes. The gate recorded renderer coverage
  at 64.27% lines/statements, 26.88% functions, and 66.09% branches in
  `artifacts/ui-smoke/ui-suite-2026-07-24T01-00-48-289Z/production-visual-gate/production-visual-gate.json`.
