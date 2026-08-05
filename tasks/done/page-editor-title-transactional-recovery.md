# Page Editor Title Transactional Recovery

Status: done

Verification status: verified

## Goal

Debug page and row-page title editing so asynchronous rename failures are
visible and recoverable, exact Retry cannot retarget another entity, Discard
restores the stored title, and injected service failures leave metadata and
Markdown bytes unchanged.

## Problems

- Page and row-page title blur discarded the rename Promise. Rejected
  persistence became an unhandled failure while the input kept a draft that
  disagreed with both page metadata and Markdown.
- A later Retry could have used the current callback after navigation and
  retargeted another page or row instead of the entity that owned the failed
  title.
- Page rename wrote/moved Markdown before metadata persistence. A metadata
  failure could therefore leave bytes or paths partially changed.
- Electron stress exposed two adjacent stale-result races. A rapid target-title
  round trip could publish a zero-backlink graph from mismatched entity-index
  and file revisions, and an old Git-history request for the temporary title
  could overwrite the restored title's two-version result.
- The backlink index path classifier compared logical ID `pages` with the
  physical `db_pages` folder suffix, so system page-index changes were treated
  as ordinary table refreshes. macOS watcher filename coalescing could also
  misreport a nested Markdown edit as an unchanged parent `data.csv`.

## Debugging

- Added a synchronous-ownership title mutation controller. It retains the exact
  title and operation callback, normalizes arbitrary rejections, suppresses
  competing/duplicate submissions, exposes single-flight Retry and Discard,
  and invalidates stale completions when the editor changes entity.
- Bound page and row-page rename callbacks to exact IDs in `App`, made
  `onRename` Promise-capable, disabled the title control during recovery, and
  added a visible alert that retains the failed draft until Retry or Discard.
- Made page rename transactional: consume injected failure before mutation,
  atomically write the new Markdown, persist metadata, roll Markdown back if
  metadata fails, and remove the stale old path only after commit. Rename now
  shares PageService's per-page queue with metadata/body updates, and
  authoritative same-title no-op detection lives in the service instead of a
  potentially stale renderer closure.
- Serialized backlink background validation and incremental refresh, drained
  mutations arriving during an active refresh, and published graphs only from
  stable source revisions. System index paths now compare resolved
  `WorkspacePaths` files instead of storage-name strings.
- External watcher events now compare installation-time mtime+size signatures,
  preventing a coalesced unchanged `data.csv` event from turning one Markdown
  edit into a full graph rebuild. Incremental refresh stores the canonical
  fingerprint and initial stable graph publication consumes already-covered
  mutation paths.
- Git-history requests use a generation token, so a response for an old page
  title cannot write into the current editor, and every successful title
  transaction reloads history from the authoritative page ID. The Electron
  harness waits for initial history readiness and re-expands the intentionally
  auto-collapsing secondary panel before each multi-step property action.

## Verification

- `npm run typecheck`, `npm run build`, and `npm run
  test:renderer-components` passed. The real-source title controller contract
  covers raw-string failure, competing and duplicate suppression, exact
  callback Retry, Discard, entity reset, stale failure invalidation, and a
  successful operation on the new entity.
- `node --test test/package-core.test.mjs` passed 49/49. Atomic rename coverage
  proves failed metadata persistence leaves page metadata, Markdown bytes,
  pages CSV bytes, and the candidate new path unchanged before exact retry.
  A queued rename/update/rename test proves the final title, tags, Markdown,
  and body path cannot be interleaved or deleted. The backlink test interleaves
  a query with a rapid rename round trip and requires the unchanged source link
  to resolve afterward; the interleaved and external-edit cases also passed
  repeated focused stress runs.
- `npm run test:customer-api` passed 6/6.
- `node --test test/ui-harness-artifacts.test.mjs` passed 117/117, including a
  negative contract that removes title-recovery evidence.
- `LOTION_UI_VIEWPORTS='desktop,compact,wide:1728x1100' npm run
  smoke:page-secondary-ui` passed desktop, compact, wide, and the required
  laptop viewport. Each injected two title failures, proved metadata and
  Markdown rollback, retained/blocked the exact draft, suppressed duplicate
  Retry, persisted the exact retry, discarded a later failure, restored the
  baseline title, retained two Git versions, and retained all five backlinks.
  The three committed visual baselines had zero differing pixels. Evidence:
  `artifacts/ui-smoke/page-secondary-ui-2026-07-24T02-41-48-175Z/`
  (4 snapshots, 3 perceptual baselines, 165,720 image bytes).
- Renderer coverage passed with 64/66 source files executed and aggregate
  coverage of 64.57% lines/statements, 28.18% functions, and 67.00% branches.
  `PageEditor.tsx` recorded 61.76% lines/statements, 32.05% functions, and
  61.40% branches.
- `npm run test:task-docs` passed with 701 files, 827 task references, and 689
  queue items; `git diff --check` passed.
- `npm run test:production-visual` passed the post-promotion gate with 16
  required suites, 79 snapshots, 48 perceptual baselines at zero pixel
  difference, and 8,692,885 image bytes. The gate linked the promoted renderer
  coverage baseline in
  `artifacts/ui-smoke/ui-suite-2026-07-24T02-43-03-467Z/production-visual-gate/production-visual-gate.json`.
