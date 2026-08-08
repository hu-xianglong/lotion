# Isolate Row-Page Open Performance Timing

Status: done

Verification status: verified

## Goal

Measure database row-page opening against the existing performance budget
without including later page-details interactions.

## Problem

The row-page timer continued after the title and body were visible while the
test expanded the page-details panel and waited for its property layout. A
shared GitHub runner therefore reported 1,527.5 ms against the 1,500 ms page
open budget even though part of that sample was a separate interaction.

## Resolution

- Stop the row-page open timer after the expected title and body are visible.
- Keep page-details expansion and all property assertions in the same smoke.
- Add a regression test that enforces the timing boundary in the smoke source.
- Keep the existing 1,500 ms budget unchanged.

## Verification

- Focused row-page navigation UI smoke passed at 403.9 ms on desktop and
  825.2 ms on compact, both below the unchanged 1,500 ms budget.
- UI harness artifact tests passed: 132/132.
- Typecheck passed.
- Task documentation, fixture, and latency gates passed.
- GitHub Actions quality gate: pending publication verification.
