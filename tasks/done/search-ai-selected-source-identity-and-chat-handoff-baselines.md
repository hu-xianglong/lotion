# Search & AI Selected-Source Identity And Chat Handoff Baselines

Status: done

Verification status: verified

## Goal

Remove internal workspace storage paths and database IDs from Search & AI result
and selected-source labels, preserve source identity and LLM handoff context,
then promote the populated chat handoff state to reviewed desktop, compact, and
wide production baselines.

## Acceptance Criteria

- Prove the existing internal-path leak from screenshot and metadata evidence.
- Render readable page, database, row-page, and database-backed page subtitles
  without exposing `databases/`, `--db_`, CSV, or Markdown storage paths.
- Preserve lexical search, all result-mode tabs, Advanced summary, selected
  source handoff, and Search/LLM Chat primary-tab behavior.
- Record surface, selected-source, tab, and storage-leak metadata and reject
  fixtures with raw internal paths or clipped selected-source content.
- Prove corrected chat-handoff screenshots are repeatable at desktop, compact,
  and wide.
- Commit checksum-backed strict zero-diff policies and require them through
  child, production, and release contracts.
- Add missing-baseline, raw-path leak, clipped-source, and committed-image
  mutation negatives.
- Record debugging, manual review, commands, artifacts, and exact results
  before moving this task to done/verified.

## Debugging

- The latest desktop and compact chat-handoff screenshots render
  `Page · Knowledge Base · databases/user/Knowledge_Base--db_search_ai_.../data.csv`
  beneath `Semantic Orchard Row`. Metadata also contains raw CSV and Markdown
  storage paths in all three lexical result rows.
- The current artifact contract only proves that the selected title and tab
  summaries exist; it does not reject user-visible storage paths or identifiers.
- Search hits deliberately retain workspace-relative paths for navigation and
  debugging, but `hitSubtitle` used that internal field as its fallback display
  label. Database-backed page hits therefore exposed storage implementation
  details even when their logical database/title identity was available.
- The first production-gate attempt correctly stopped on renderer historical
  coverage: adding unexecuted formatting branches lowered lines/statements by
  0.02 points and functions by 0.04 points. The verified coverage baseline was
  not weakened; a focused formatter contract was added instead.

## Delivered

- Replaced raw-path subtitles with logical `Page`, `Database`, or `Row page`
  identity plus readable entity/database context. Internal paths remain
  available only for navigation classification.
- Covered database, row, row page, database-backed page, ordinary database
  page, workspace page, and unsafe entity-path fallback formatting cases in
  the renderer component lane.
- Added snapshot stabilization for pointer, focus, subtree animations, and two
  paint frames.
- Persisted active primary tab, both tab visibility states, selected-source
  title/subtitle/bounds/overflow geometry, and visible storage-leak matches.
  The artifact contract now rejects raw paths/IDs and clipped source cards in
  both interaction summaries and screenshot metadata.
- Added reviewed 880x370 desktop, compact, and wide chat-handoff PNGs with
  checksum-backed strict zero-diff policies.
- Required all three baselines through the Search & AI child contract,
  aggregate production gate, and release summary.
- Added missing-baseline, raw-storage-leak, clipped-source, and deliberate
  committed-image mutation negatives while preserving search, result-mode,
  Advanced, selected-source, and primary-tab flows.

## Verification

Verified on 2026-07-23.

- The faulty desktop and compact screenshots are
  `artifacts/ui-smoke/search-ai-ui-2026-07-22T20-43-29-719Z/snapshots/search-ai-desktop.png`
  and
  `artifacts/ui-smoke/search-ai-ui-2026-07-22T20-43-29-719Z/snapshots/search-ai-compact.png`.
  Both visibly exposed a `databases/user/...--db_.../data.csv` subtitle, and
  their metadata contained raw CSV/Markdown paths across all three results.
- The corrected three-viewport candidate
  `artifacts/ui-smoke/search-ai-ui-2026-07-23T14-20-16-857Z/` passed lexical
  result discovery, all nested result modes, Advanced summary/settings actions,
  selected-source handoff, and both primary tabs. Its three search rows and
  selected-source summary contained no storage paths or embedded IDs.
- The reviewed committed checksums are:
  - desktop and wide:
    `4160861a9478f2f33225c5d5a3f7b8264b77389901bb2a69b7f1c4dcc0519c0f`;
  - compact:
    `6e7d7b1772b84278fafc6cce66884e2c2667285aac7ea68fbe898864644eebe3`.
- The first strict repeat
  `artifacts/ui-smoke/search-ai-ui-2026-07-23T14-22-45-036Z/` passed all three
  baseline comparisons with zero differing pixels.
- Manual desktop, compact, and wide review confirmed the Search and LLM Chat
  tabs, assistant explanation, selected-source label/title/subtitle, and both
  handoff actions are readable without clipping. Every viewport recorded
  `LLM Chat` active, both tabs fully visible, selected-source client/scroll
  widths of 806px, `fullyVisible: true`, and zero storage-leak matches.
- The focused production gate passed one required suite, three screenshots
  totaling 103,381 bytes, three strict zero-pixel comparisons, zero console
  errors, and renderer coverage/trend gates:
  `artifacts/ui-smoke/ui-suite-2026-07-23T14-24-09-907Z/production-visual-gate/production-visual-gate.json`.
- Renderer coverage improved over the verified baseline: lines/statements
  31.48% (+0.04), functions 23.23% (+0.21), and branches 61.40% (+0.36).
- `node --test test/ui-harness-artifacts.test.mjs
  test/production-visual-baseline.test.mjs test/test-release.test.mjs` passed
  114/114 tests: 96 artifact/aggregation tests, eleven visual-baseline tests,
  and seven release tests.

## Remaining Umbrella Work

Additional critical surfaces still need reviewed baselines. The umbrella also
needs a decision on aggregating both real-workspace runners into nightly
production and deliberate renderer coverage improvements.
