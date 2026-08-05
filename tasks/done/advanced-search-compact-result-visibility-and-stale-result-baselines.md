# Advanced Search Compact Result Visibility And Stale-Result Baselines

Status: done

Verification status: verified

## Goal

Fix the compact Advanced Search stale-result layout so semantic results remain
readable inside the modal, then promote the complete result state to reviewed
desktop, compact, and wide production baselines.

## Acceptance Criteria

- Prove the existing compact regression from screenshot and geometry evidence.
- Keep both stale-search results fully visible or reachable through an
  intentional, measurable results scroller in the compact snapshot.
- Preserve initial, provider-error, missing-model, rebuild, ready, stale,
  empty, adapter-error, and navigation flows.
- Record result viewport/scroll geometry and per-result visibility in snapshot
  metadata, rejecting clipped or unreachable result fixtures.
- Prove corrected stale-result screenshots are repeatable at desktop, compact,
  and wide.
- Commit checksum-backed strict zero-diff policies and require them through
  child, production, and release contracts.
- Add missing-baseline, clipped-result, and committed-image mutation negatives.
- Record debugging, manual review, commands, artifacts, and exact results
  before moving this task to done/verified.

## Debugging

- The latest compact stale-result screenshot contains two results in metadata,
  but the capture shows only the header of the first result before the modal
  is clipped by its bottom boundary. The current artifact contract validates
  result count/content and nonzero results geometry without proving that result
  cards are visible or reachable.
- The cause was a viewport-level `max-width: 1080px` breakpoint that stacked
  the five controls even though the 860px plugin modal still fit comfortably.
  The extra 159px of control height pushed the 830px panel to y=945 in an
  820px viewport.
- The first baseline attempt intentionally failed by 3,356 pixels after the
  snapshot stabilizer removed the query input's transient focus ring. The
  stable unfocused state, rather than the earlier candidate, was promoted.
- A later strict run passed all three baseline comparisons but the Electron
  page closed while capturing the final wide external-provider error. The
  focused production gate and a subsequent independent direct run both
  completed, proving the lifecycle failure was transient and not a visual or
  product regression.

## Delivered

- Restricted the single-column Advanced Search breakpoint to viewports below
  860px, preserving the two-column control grid in the 1040x820 production
  compact viewport.
- Added snapshot stabilization for pointer, focus, subtree animations, and two
  final paint frames.
- Persisted results client/scroll geometry and every result card's rectangle
  and `fullyVisible` state. The contract now rejects short, internally
  overflowing, scrolled, missing, or clipped stale-result evidence.
- Added reviewed 822x669 desktop, compact, and wide stale-result PNGs with
  checksum-backed strict zero-diff policies.
- Required all three baselines through the Advanced Search child contract,
  aggregate production gate, and release summary.
- Added missing-baseline, clipped-result, and deliberate committed-image
  mutation negatives while retaining all eight UI states and row-page, page,
  and database navigation coverage.

## Verification

Verified on 2026-07-23.

- The faulty compact screenshot is
  `artifacts/ui-smoke/advanced-search-ui-2026-07-22T20-44-38-006Z/snapshots/advanced-search-stale-results-compact.png`.
  Its panel extended from y=115 to y=945 in an 820px viewport; manual review
  showed only the first result header before the modal boundary even though
  metadata reported two results.
- The first corrected three-viewport candidate
  `artifacts/ui-smoke/advanced-search-ui-2026-07-23T08-12-47-086Z/` passed all
  eight states and three navigation paths per viewport and showed both compact
  results, establishing that the responsive fix did not narrow behavior.
- `artifacts/ui-smoke/advanced-search-ui-2026-07-23T08-16-41-492Z/` correctly
  rejected the pre-stabilization desktop candidate by 3,356 pixels (0.610%).
  The stable candidates were then captured in
  `artifacts/ui-smoke/advanced-search-ui-2026-07-23T08-18-05-203Z/`.
- The reviewed committed checksums are:
  - desktop and wide:
    `26fea63f990434693de358b20957a26a918073bf2339bf1ca2cebd4c91e071a8`;
  - compact:
    `fafb908fcd0bf88fca409a0dad9432686d1a8fef0ca8ffdc3374b2319d98638c`.
- Manual desktop, compact, and wide review confirmed the provider/model/store
  controls, status, note, actions, query, result count, both titles, sources,
  scores, subtitles, snippets, and explanations are readable without clipping.
  Every viewport recorded a 229px results client/scroll height, scroll offset
  zero, and 2/2 result cards with `fullyVisible: true`.
- The strict run
  `artifacts/ui-smoke/advanced-search-ui-2026-07-23T14-13-47-016Z/` produced
  three zero-pixel baseline comparisons before its final unrelated Electron
  page-close failure. The focused production run then completed:
  `artifacts/ui-smoke/ui-suite-2026-07-23T14-14-46-243Z/production-visual-gate/production-visual-gate.json`.
  It passed one required suite, three representative viewport records,
  1,521,842 bytes across the eight-phase evidence, three strict zero-pixel
  comparisons, zero console errors, and renderer coverage/trend gates.
- A separate repeat run
  `artifacts/ui-smoke/advanced-search-ui-2026-07-23T14-15-35-974Z/` completed
  all 24 phase captures, nine navigation paths, and three strict zero-pixel
  comparisons.
- `node --test test/ui-harness-artifacts.test.mjs
  test/production-visual-baseline.test.mjs test/test-release.test.mjs` passed
  110/110 tests: 93 artifact/aggregation tests, ten visual-baseline tests, and
  seven release tests.

## Remaining Umbrella Work

Additional critical surfaces still need reviewed baselines. The umbrella also
needs a decision on aggregating both real-workspace runners into nightly
production and deliberate renderer coverage improvements.
