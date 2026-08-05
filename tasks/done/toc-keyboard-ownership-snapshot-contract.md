# Task 709: TOC keyboard ownership snapshot contract

Status: done

Verification status: verified

Priority: P0

Source: independent verification follow-up after Task 708

## Problem

Task 708 records pointer-to-keyboard ownership in the auto-hidden TOC snapshot,
but the snapshot contract only checks that this state is expanded. A snapshot
with the pointer still hovering or without a focused TOC item can therefore pass
as long as the separate in-memory summary is correct.

## Goal

Require the persisted snapshot evidence itself to prove that the pointer is
outside while a TOC item remains keyboard-focused and the panel stays expanded.

## Acceptance

- The snapshot contract rejects missing keyboard focus ownership.
- The snapshot contract rejects a snapshot captured while the pointer remains
  over the TOC.
- Existing valid page-secondary artifacts continue to pass.
- The behavior is covered by an automated regression test.

## Required Gates

- `node --test test/ui-harness-artifacts.test.mjs`
- focused `npm run smoke:page-secondary-ui`
- `npm run typecheck`
- `npm run build`
- `npm run test:task-docs`
- `git diff --check`

## Result

- Added a shared keyboard-owned TOC assertion that requires the persisted state
  to be expanded, pointer-out, focused within the TOC, and focused on a TOC
  item.
- Applied the same assertion to both the live summary and the auto-hidden TOC
  snapshot metadata so their evidence requirements cannot drift.
- Added a negative artifact-contract regression that mutates only the persisted
  snapshot while leaving the in-memory summary valid.

## Verification

- Before the fix,
  `node --test --test-name-pattern='persisted snapshot'
  test/ui-harness-artifacts.test.mjs` failed with
  `Missing expected rejection`, proving that a snapshot with
  `focusedWithin=false`, `activeIsTocItem=false`, and `hovered=true` was
  incorrectly accepted.
- After the fix, the same focused command passed 1/1.
- `node --test test/ui-harness-artifacts.test.mjs`: passed 129/129.
- `LOTION_PAGE_SECONDARY_SKIP_BASELINE=1
  LOTION_UI_VIEWPORTS=desktop,compact,wide:1600x1000 npm run
  smoke:page-secondary-ui`: passed desktop, compact, wide, and laptop. The
  tightened contract accepted the real pointer-to-keyboard snapshot evidence.
  Evidence:
  `artifacts/ui-smoke/page-secondary-ui-2026-07-28T01-14-07-054Z/`.
- `npm run typecheck`: passed.
- `npm run build`: passed with 2,342 transformed modules; only the existing Node
  20.18.1/Vite 20.19+ advisory and chunk-size advisory were emitted.
- `npm run test:task-docs`: passed 3/3; 709 queue items aligned.
- `git diff --check`: passed.
