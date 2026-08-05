# Page Cover Offset Transactional Recovery

Status: done

Verification status: verified

## Goal

Debug shared page/database/row cover reposition persistence so asynchronous
offset failures retain the exact visual draft, block competing commits, expose
single-flight Retry and explicit Discard, and cannot retarget another entity.

## Problems

- Cover reposition called a Promise-capable persistence callback as if it were
  synchronous, immediately closed the editor, and left rejected writes
  unhandled. The visual focal point could therefore disagree with disk with no
  Retry or Discard path.
- Recovery state had no stable entity identity. Navigating between entities
  that shared the same image path could leave an old failure UI mounted in the
  new entity even though the callback itself was entity-bound.
- Reposition controls bubbled `mousedown` into the cover drag handler. Clicking
  Discard could leave a stale drag origin after the global listeners were
  removed, so re-entering reposition jumped the focal point before the next
  actual drag.
- The floating TOC's stacking layer intercepted the cover's right-side action
  buttons, making Remove unreachable in a real desktop layout.
- The same stress run exposed an adjacent Page Properties recovery defect: its
  inline error row became hidden when the hover-expanded secondary panel
  collapsed, taking Retry and Discard with it.
- `PageService.setCoverOffset()` bypassed the serialized metadata update path,
  so the public cover-offset API did not share injected-failure and atomic
  recovery behavior with the UI's `pages.update()` path.

## Debugging

- Added a synchronous-ownership cover-offset controller that retains the exact
  numeric offset and operation callback, normalizes arbitrary rejections,
  suppresses competing and duplicate submissions, exposes single-flight Retry
  and explicit Discard, and invalidates stale completions on entity changes.
- Made page, database, and row-page cover callbacks Promise-capable end to end.
  `CoverArea` now receives an entity mutation key in addition to the image path,
  retains the failed visual draft, blocks Save/Cancel while saving, and shows a
  fixed actionable recovery alert.
- Ignored interactive descendants in the root drag handler and clear any drag
  origin whenever reposition mode exits. The Electron regression explicitly
  re-enters and drags after Discard, preventing the stale-origin jump from
  returning.
- Raised cover actions above the floating TOC interaction layer. Page
  Properties now uses the shared fixed mutation toast, whose visibility remains
  explicit even when its hover-only parent collapses.
- Routed `PageService.setCoverOffset()` through `update()`, preserving clamping,
  per-page serialization, metadata failure injection, and the same atomic
  persistence contract used by the renderer.
- Extended the Page Secondary artifact contract with cover rollback, retained
  draft, blocked controls, duplicate-safe Retry, exact persistence, Discard,
  post-Discard drag, cleared cover, and restored offset evidence. Added a
  negative contract test that rejects incomplete evidence.

## Verification

- `npm run typecheck`, `npm run build`, and `npm run
  test:renderer-components` passed. The real-source controller contract covers
  raw rejection, competing/duplicate suppression, exact callback Retry,
  repeated failure, Discard, stale-generation invalidation, and a current
  entity submission.
- `node --test test/customer-api.test.mjs test/package-core.test.mjs` passed
  56/56 (6 customer API and 50 core tests). The focused cover-offset test proves
  an injected failure preserves the stored value and exact pages CSV bytes,
  then persists the exact fractional retry value through the public
  `setCoverOffset()` API.
- `node --test test/ui-harness-artifacts.test.mjs` passed 118/118, including the
  new negative cover-offset recovery contract.
- `LOTION_UI_VIEWPORTS='desktop,compact,wide:1728x1100' npm run
  smoke:page-secondary-ui` passed desktop, compact, wide, and the required
  laptop viewport. Each viewport injected two real page-metadata failures,
  proved rollback, retained the exact focal-point draft, blocked competing
  controls, suppressed double Retry, persisted the exact retry, discarded a
  later draft, re-entered reposition without a jump, restored offset 50, and
  cleared the fixture cover. All five backlinks, two Git versions, history
  restore, editor persistence, and TOC checks also passed. The three committed
  baselines had zero differing pixels. Evidence:
  `artifacts/ui-smoke/page-secondary-ui-2026-07-24T03-07-38-285Z/`.
- Renderer coverage passed with 64/66 source files executed and aggregate
  coverage of 64.60% lines/statements, 28.40% functions, and 67.24% branches.
  `CoverArea.tsx` recorded 68.18% lines/statements, 46.15% functions, and
  82.14% branches.
- `npm run test:production-visual` passed 16/16 required suites, 79 snapshots,
  48 perceptual baselines at zero pixel difference, 8,692,344 image bytes, no
  missing contracts, and zero console errors. Evidence:
  `artifacts/ui-smoke/ui-suite-2026-07-24T03-08-54-808Z/production-visual-gate/production-visual-gate.json`.
- After promotion, `npm run test:task-docs` passed 3/3 and validated 702 task
  files, 828 references, and all 690 queue items. `git diff --check` also
  passed. The promoted renderer trend baseline then passed with zero regression
  across all four metrics.
