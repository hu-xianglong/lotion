# Full UI Regression and Harness Resilience

Status: done

Verification status: verified

## Goal

Run the complete registered UI regression surface against the current feature
set, debug every observed failure, preserve meaningful coverage, and record
reproducible verification evidence.

## Debugging

The campaign found one product interaction defect and several stale or racy
smoke assumptions:

- Database keyboard handling assumed every event target implemented
  `Element.closest`, which crashed on a non-Element synthetic target.
- The row recovery toast intercepted settings-menu clicks in compact layouts.
- Embedded-view, white-theme, created-view, database-interaction, editor, and
  navigation scenarios depended on obsolete labels, direct tabs, exact derived
  colors, child-process-only failure injection, private CodeMirror fields, or
  virtualized lines that were mounted outside the visible viewport.
- View-default and created-view persistence checks read storage before queued
  asynchronous writes had settled.
- The editor toggle fixture referenced an image it never created, producing a
  real 404 that the zero-console-error gate correctly rejected.

## Delivered

- Guard editable-target detection before calling `closest`, with a functional
  renderer contract for null, plain-object, editable, and non-editable targets.
- Let pointer events pass through the non-interactive area of the row recovery
  toast while keeping its Undo, retry, and dismiss buttons interactive.
- Update UI harnesses to traverse scoped and bilingual settings menus, resolve
  overflowed view tabs, wait for persisted revisions/defaults, use the shared
  debug failure injector, and validate current theme gradients/derived colors.
- Replace private CodeMirror DOM access with a standards-based rendered-text
  selection contract, create the referenced toggle image fixture, and pin an
  already-hover-expanded page-details panel correctly.
- Restrict navigation-anchor selection to a line that actually intersects the
  editor viewport, preventing Playwright auto-scroll from changing the anchor
  under test.
- Strengthen embedded-view artifact validation and its negative contract test.

## Verification

Independently verified on 2026-07-22.

Results:

- Focused database row-menu smoke passed desktop and compact recovery flows
  with two snapshots, 370,254 image bytes, and zero console errors.
- Focused created-view, embedded-view, white-theme, database-interaction, and
  view-menu regressions passed their desktop/compact contracts with zero
  console errors.
- The combined editor-regression and navigation-anchor run passed 2/2 suites
  across desktop and compact, with four snapshots, 605,291 image bytes, zero
  console errors, and all artifact contracts present. Artifact index:
  `artifacts/ui-smoke/ui-suite-2026-07-22T20-35-32-819Z/ui-suite-artifacts.json`.
- The editor run covered normal pages, first typing in an empty row page, large
  documents, selection/highlight behavior, attachment rendering, and persisted
  Markdown. Navigation restored the same visible anchor and completed forward
  navigation in both viewports.
- All 39 scripts registered by `test:ui-regression` passed during the campaign
  in full-suite segments or focused reproductions. A final monolithic retry was
  interrupted when Electron closed the Playwright page during Search popup UI;
  the same search scenario immediately passed 1/1 across desktop and compact
  with two snapshots, 223,721 image bytes, and zero console errors. Artifact
  index: `artifacts/ui-smoke/ui-suite-2026-07-22T21-15-04-914Z/ui-suite-artifacts.json`.
- `npm run test:renderer-components` passed, including the non-Element keyboard
  target regression contract.
- `node --test test/ui-harness-artifacts.test.mjs` passed 76/76 positive and
  negative artifact-contract tests.
- `npm run typecheck` passed both renderer/shared and main-process TypeScript
  projects.
- `npm run test:task-docs` passed 3/3 validator tests and the repository scan:
  653 Markdown files, 775 task references, and 640 aligned queue items.
- `git diff --check` passed.
- The immediately preceding full coverage gate remained green at 83.4% package
  runtime lines and 83.1% builtin-plugin runtime lines, both above the required
  80% threshold.
