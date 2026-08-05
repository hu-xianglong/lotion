# Row Page Properties Transactional Queue and Recovery

Status: done

Verification status: verified

## Goal

Debug row-page property editing so whole-database writes are serialized,
failures are visible and recoverable, and Retry or Discard leaves both disk and
the rendered property panel in a proven state.

## Problems

- `RowPageProperties` declared its persistence callback as synchronous even
  though `App.updateRowField` returns and awaits a database write. Cell editors
  discarded that promise, so a bundle-write rejection became unhandled and the
  panel showed no failure.
- Independent property editors could race whole-database bundle writes. There
  was no surface-owned queue, failed-head retention, or ordering policy.
- A failed editor draft remained visible while disk retained the old value,
  without Retry, Discard, or a reliable way to remount from stored props.
- The existing complete-panel visual suite proved geometry, focus, source
  links, and strict pixels, but never failed a real property write.

## Debugging

- Reused the verified cell-edit serial queue behind a row-property controller
  that preserves the row/field/value wiring, serializes commits, deduplicates
  identical tail values, pauses on the failed head, and exposes single-flight
  Retry and Discard.
- The property region now reports saving ownership and becomes `inert` while a
  write or unresolved recovery owns it. A visible alert renders outside that
  inert region with the exact failed input and Retry/Discard controls.
- Retry replays the exact retained write and resumes queued work. Discard drops
  only the failed head and increments an editor key so local drafts remount from
  the last stored record.
- Added a component-level controller contract covering raw-string failure,
  ordered Retry, duplicate Retry suppression, Discard, duplicate Discard
  suppression, and the exact field/value operation sequence.
- Extended the real row-property Electron suite to inject two bundle-write
  failures per viewport, compare the live service result with the draft, and
  require recovery evidence in its artifact contract.
- The first strict visual run found 557 changed pixels only in the generated
  `updated_time` row. The recovery write correctly updates that system value;
  the harness now captures the immutable initial visual baseline first and
  runs the transactional audit afterward in the same Electron session.

## Verification

- `npm run typecheck`, `npm run build`, and `npm run
  test:renderer-components` passed.
- `node --test test/ui-harness-artifacts.test.mjs` passed 115/115, including a
  negative contract test that removes transactional recovery evidence.
- `node --test test/package-core.test.mjs` passed 48/48. The previously verified
  database-service atomic bundle-failure regression covers the same
  `updateCell` persistence path. `npm run test:customer-api` passed 6/6.
- `LOTION_UI_VIEWPORTS='desktop,compact,wide:1728x1100' npm run
  smoke:row-page-property-visual-ui` passed all three viewports. Each proved
  failed-value rollback, retained draft, inert competing controls,
  duplicate-Retry suppression, exact Retry persistence, Discard disk
  preservation, editor reset, and fixture-value restoration. All three
  committed panel baselines remained at zero differing pixels with no
  horizontal overflow. Evidence:
  `artifacts/ui-smoke/row-page-property-visual-2026-07-24T01-46-35-405Z/`
  (3 screenshots, 166,546 bytes).
- Renderer coverage passed with 64/66 source files executed and aggregate
  coverage of 64.52% lines/statements, 27.72% functions, and 66.73% branches.
  `RowPageProperties.tsx` recorded 87.09% lines, 39.13% functions, and 81.03%
  branches.
- `npm run test:task-docs` passed with 699 files, 825 task references, and 687
  queue items; `git diff --check` passed.
- `npm run test:production-visual` passed the post-promotion gate with 16
  required suites, 79 snapshots, 48 perceptual baselines at zero pixel
  difference, and 8,691,996 image bytes. The gate recorded the promoted
  renderer baseline in
  `artifacts/ui-smoke/ui-suite-2026-07-24T01-49-31-535Z/production-visual-gate/production-visual-gate.json`.
