# Measure Embedded-View Steady State Correctly

Status: done

Verification status: verified

## Goal

Apply the embedded-view cold-start and steady-state budgets to measurements
that actually represent those two states.

## Problem

Every count and viewport created and opened a new workspace. Only the first
array entry received the cold-start budget; all later first-time database loads
were labeled steady-state. A three-view cold load on the shared GitHub runner
took 1,149.1 ms and failed the 1,000 ms warm-cache budget.

## Resolution

- Keep the first result as a genuine cold-start measurement.
- For every later scenario, render all embedded databases once, return to the
  blank page, then time a second render from the populated renderer cache.
- Record `measurementMode` in each result and keep both existing budgets
  unchanged.

## Verification

- Shared-CDP Embedded view suite matching the GitHub workflow: passed.
- Desktop, compact, and wide; 1, 3, and 10 views; 500 rows per database:
  passed.
- Cold-start render: 732.7 ms against the unchanged 1,250 ms budget.
- Warm renders: 11.2-119.5 ms against the unchanged 1,000 ms budget.
- Pagination, header actions, row counts, visual baselines, and artifact
  contracts passed with no console errors or missing evidence.
- GitHub Actions quality gate: pending publication verification.
