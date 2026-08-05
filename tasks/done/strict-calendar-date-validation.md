# Strict Calendar Date Validation

Status: done

Verification status: verified

## Goal

Reject syntactically plausible but impossible calendar dates consistently in
shared date parsing, Notion import/audit, database batch validation, calendar
views, filters, and sorting.

## Problem

- Shared `parseDateValue()` constructs a JavaScript `Date` directly for ISO
  prefixes. JavaScript silently normalizes overflow, so values such as
  `2025-13-40` become a different valid date.
- The Notion audit has a parallel `canonicalDate()` implementation that returns
  any `YYYY-M-D` prefix without checking month length or leap years.
- Existing regressions cover only obvious text such as `not a date`; they do not
  prove that valid leap days pass while impossible days and months fail.

## Debugging

- A focused regression reproduced the bug before the fix:
  `parseDateValue("2025-02-29")` returned
  `2025-03-01T08:00:00.000Z` in the local timezone instead of rejecting the
  impossible non-leap date. The same constructor path normalized invalid months
  and days.
- Added explicit Gregorian calendar validation to the shared date parser,
  including leap-year rules, month lengths, and bounds. Date ranges validate
  both endpoints, while existing sorting semantics continue to use the first
  endpoint.
- Added shared `isValidDateValue()` and routed normalization through the same
  parser. Explicit ISO date-time values with invalid times, such as
  `2024-02-29 25:99`, no longer fall back to a valid date-only value.
- Replaced the Notion audit's parallel regex-only `canonicalDate()` behavior
  with shared normalization and validation, so import audit, calendar/filter/
  sort consumers, and database writes agree on the same calendar semantics.
- Tightened database batch validation to require both the accepted ISO shape
  and a parseable calendar value. Invalid date writes fail before persistence,
  preserving the prior stored value and the batch's atomic behavior.
- Extended the real Notion import fixture with an impossible `2025-02-29` cell
  and a range whose second endpoint is impossible. Each produces exactly one
  `invalid_date_cell` issue.
- The adjacent database-template Electron smoke had drifted behind current UI
  behavior. It was repaired to exercise the scoped settings menu, side/full
  page opening, expandable page details, typed filter controls, priority-sort
  rows, explicit create-view submission, compact overflow tabs, and active-view
  persistence. These repairs exposed harness assumptions rather than product
  date bugs and restored real desktop/compact calendar coverage.

## Verification

- `npm run typecheck`, `npm run build`, and `npm run
  test:renderer-components` passed. The production build transformed 2,338
  modules.
- `node --test test/package-core.test.mjs` passed 52/52. Regressions cover valid
  `2024-02-29`, invalid `2025-02-29`, months 0/13, day 40, valid and invalid
  date-times, both range endpoints, filter rejection, valid leap-day batch
  persistence, and atomic rejection of an impossible batch date.
- `node scripts/test-notion-html-converter.mjs` and `node
  scripts/test-notion-import-service.mjs` passed. A real imported impossible
  date and an impossible range endpoint each produced the exact expected
  `invalid_date_cell` diagnostic.
- `npm run smoke:notion-import-ui` passed desktop/compact, preserving the valid
  import/audit UI and single-flight evidence. Evidence:
  `artifacts/ui-smoke/notion-import-audit-2026-07-24T04-00-16-080Z/`.
- `npm run smoke:database-template-ui` passed desktop/compact. It verified the
  selected `due_date` calendar field, month navigation, Today restoration,
  overflow expansion/reset, list date property, gallery date caption, and
  persisted view behavior. Evidence:
  `artifacts/ui-smoke/database-template-ui-2026-07-24T04-21-37-693Z/`.
- `node --test test/ui-harness-artifacts.test.mjs` passed 119/119.
- Renderer coverage passed with 64/66 source files executed and 64.68%
  lines/statements, 28.67% functions, and 67.49% branches, with no regression
  against the preceding verified baseline.
- `npm run test:latency` passed. The slowest 20,000-row view query was 12.9ms;
  the 50,000-row CSV benchmark had a 44.038ms median and 59.597ms maximum.
- `npm run test:production-visual` passed all 16 required suites across
  desktop/compact/wide: 79 snapshots, 48 perceptual baselines, 8,692,121 image
  bytes, zero console errors, and no missing contracts. Evidence:
  `artifacts/ui-smoke/ui-suite-2026-07-24T04-23-08-996Z/production-visual-gate/production-visual-gate.json`.
- `npm run test:file-boundary` remains blocked by the pre-existing unrelated
  `src/main/services/entities-database-service.ts:2` direct `node:fs` import.
  This feature does not touch that service; its focused parser, import, batch,
  renderer, Electron, coverage, latency, build, and production visual gates all
  passed.
- After promotion, `npm run test:task-docs` passed 3/3 and validated 705 task
  files, 831 references, and all 693 queue items. The promoted renderer
  coverage trend passed with zero regression across all four metrics.
