# Notion Audit Panel Single-flight Execution

Status: done

Verification status: verified

## Goal

Ensure the Notion Import plugin starts at most one expensive workspace audit at
a time, ignores competing submissions synchronously, and can retry safely after
a failure.

## Problem

The Run audit button relies on React's asynchronously rendered `stage` state for
ownership. The handler itself has no synchronous single-flight guard, so
re-entrant or same-turn submission can invoke the shared audit API more than
once and allow competing completions to race for the visible result.

## Debugging

- The first audit pass suspected duplicate entity-ref scanning, but the current
  authoritative source and compiled output each contained one scan. A real
  corrupted import confirmed one `missing_entity_ref_target` issue. The
  regression was tightened to exact counts instead of recording a false fix.
- A real Electron same-turn double submission then reproduced the actual gap:
  after the first click handler entered, the DOM button was still enabled, so a
  second click dispatched before React committed `stage="running"`.
- Added `createNotionAuditRunController`, which acquires synchronous ownership
  before the audit Promise yields. Competing calls return `ignored` without
  invoking their operation. Success and failure both release ownership, and
  arbitrary thrown values are normalized for the visible error state.
- Routed the panel through the controller while retaining its running/done/error
  UI stages. The existing button disabling remains the visible affordance; the
  controller is the authoritative same-turn guard.
- Extended the real-source renderer contract with a deferred first audit. It
  proves `isRunning`, zero invocation of the competing operation, successful
  release, raw-string error normalization, failure release, and a successful
  retry.
- Tightened the import-service regression so one corrupted relation target and
  one unstructured relation value each produce exactly one stored diagnostic,
  one kind count, and matching terminal/Markdown report totals.
- The Electron audit smoke now submits twice in both passing and diagnostic
  phases and records the timing gap plus final result/error counts. The shared
  artifact contract requires that evidence in both the manifest entry and
  snapshot metadata, with a negative regression rejecting two results.

## Verification

- `npm run typecheck`, `npm run build`, and `npm run
  test:renderer-components` passed. The real-source controller contract invoked
  only `first`, `failure`, and `retry`; the competing operation was ignored.
- `node scripts/test-notion-import-service.mjs` passed the full deterministic
  import/audit regression. A single bad entity target and single unstructured
  relation each reported exactly once in stored items, kind totals, terminal
  text, and Markdown output.
- `node --test test/ui-harness-artifacts.test.mjs` passed 119/119. The Notion
  artifact contract now rejects incomplete single-flight evidence and a
  simulated `resultCount=2`.
- `npm run smoke:notion-import-ui` passed desktop and compact. The final
  production run also passed wide. For passing and diagnostic audit phases in
  all three viewports, two clicks were dispatched while
  `disabledAfterFirstClick=false`; each phase rendered exactly one result and
  zero errors. Passing summaries remained 0 issues/0 warnings, while diagnostic
  summaries remained exactly one `cell_loss`. Evidence:
  `artifacts/ui-smoke/notion-import-audit-2026-07-24T03-53-24-254Z/`.
- Renderer coverage passed with 64/66 source files executed and 64.68%
  lines/statements, 28.67% functions, and 67.49% branches, with no regression
  against the preceding verified baseline.
- `npm run test:production-visual` passed 16/16 required suites, 79 snapshots,
  48 perceptual baselines at zero pixel difference, 8,691,259 image bytes, and
  no missing contracts. Evidence:
  `artifacts/ui-smoke/ui-suite-2026-07-24T03-50-17-199Z/production-visual-gate/production-visual-gate.json`.
- `npm run test:file-boundary` remains blocked by the pre-existing unrelated
  `src/main/services/entities-database-service.ts:2` direct `node:fs` import.
  This feature does not touch that service; its focused TypeScript, production
  build, import engine, renderer, artifact, Electron, coverage, and production
  visual gates all passed.
- After promotion, `npm run test:task-docs` passed 3/3 and validated 704 task
  files, 830 references, and all 692 queue items. The promoted renderer
  coverage trend passed with zero regression across all four metrics.
