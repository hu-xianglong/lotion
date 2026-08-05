# Field Option Menu Transactional Recovery

Status: done

Verification status: verified

## Goal

Debug select and multi-select option color, delete, and reorder persistence so
async schema failures are visible, retryable, and cannot be replaced by a
competing menu action.

## Problems

- The shared field-render context and row-property option callback were typed as
  synchronous even though the application persists a complete database schema
  asynchronously.
- The default select/multi-select plugin discarded `onOptionsChange` promises
  for option color, delete, and reorder. A failed field update therefore became
  an unhandled rejection with no visible owner or recovery path.
- Option color changes had a second, dead callback path in `Cell` and
  `DatabaseTable`; the active plugin actually mapped color changes back through
  the whole-options callback.
- The menu could dismiss or accept another schema mutation while a failed
  operation still needed an exact Retry or explicit Discard.

## Debugging

- Made the shared field option callback Promise-capable and removed the dead
  color-only callback from the row-page and standalone database paths.
- Added a synchronous-ownership option mutation controller in the default field
  plugin. It captures the exact attempted option array, normalizes arbitrary
  rejection values, rejects competing and duplicate attempts, and exposes
  single-flight Retry plus explicit Discard.
- Routed color, delete, and reorder through that controller. During saving or
  recovery the menu actions and trigger are blocked, outside dismissal is
  suppressed, and a visible alert retains the failed input with Retry/Discard.
- Added a real-source controller contract covering raw-string failure,
  competing-action suppression, exact Retry, duplicate Retry suppression, a
  second failure, Discard, and duplicate Discard suppression.
- Extended the complete row-property Electron harness and artifact contract to
  inject two real atomic field-update failures per viewport and compare the
  draft control with the stored schema.
- The first Electron run exposed an accessibility bug in the new recovery UI:
  `aria-disabled` on the menu container was inherited by Retry and Discard.
  Moving disabled state to only mutation controls kept recovery buttons
  operable.
- The renderer trend gate then caught a 0.02-point line/statement regression.
  A direct real-source property interaction contract now executes the settings
  and option-search callbacks, proving event isolation and the exact selected
  option while raising every aggregate metric above the verified baseline.

## Verification

- `npm run typecheck`, `npm run build`, and `npm run
  test:renderer-components` passed.
- `node --test test/ui-harness-artifacts.test.mjs` passed 116/116, including a
  negative contract test that removes option-mutation recovery evidence.
- `node --test test/package-core.test.mjs` passed 48/48. Its verified atomic
  database field-update failure coverage proves schema bytes remain unchanged
  on rejected persistence. `npm run test:customer-api` passed 6/6.
- `LOTION_UI_VIEWPORTS='desktop,compact,wide:1728x1100' npm run
  smoke:row-page-property-visual-ui` passed all three viewports. Each changed
  `Done` from green to blue under injected failure, proved the stored schema
  stayed green, blocked outside dismissal and duplicate Retry, persisted the
  exact blue retry, failed a later red change, discarded it while preserving
  blue, reopened with blue, and restored green normally. All three strict
  panel baselines had zero differing pixels and no horizontal overflow.
  Evidence:
  `artifacts/ui-smoke/row-page-property-visual-2026-07-24T02-00-13-660Z/`
  (3 snapshots, 166,546 bytes).
- Renderer coverage passed with 64/66 source files executed and aggregate
  coverage of 64.53% lines/statements, 27.94% functions, and 66.76% branches.
  `RowPageProperties.tsx` recorded 89.74% lines, 50.00% functions, and 81.66%
  branches.
- `npm run test:task-docs` passed with 700 files, 826 task references, and 688
  queue items; `git diff --check` passed.
- `npm run test:production-visual` passed the post-promotion gate with 16
  required suites, 79 snapshots, 48 perceptual baselines at zero pixel
  difference, and 8,691,855 image bytes. The gate linked the promoted renderer
  coverage baseline in
  `artifacts/ui-smoke/ui-suite-2026-07-24T02-04-42-654Z/production-visual-gate/production-visual-gate.json`.
