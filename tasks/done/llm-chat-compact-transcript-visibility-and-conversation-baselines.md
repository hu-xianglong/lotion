# LLM Chat Compact Transcript Visibility And Conversation Baselines

Status: done

Verification status: verified

## Goal

Fix the compact LLM Chat conversation layout so the transcript remains usable
when history, controls, quick actions, activity, write preview, status, and
composer are present, then promote the conversation phase to reviewed
desktop, compact, and wide production baselines.

## Acceptance Criteria

- Prove the existing compact regression from screenshot and geometry evidence.
- Keep both user and assistant messages fully visible in the compact
  conversation snapshot with a useful transcript viewport.
- Preserve history, controls, quick actions, activity, write-preview, status,
  composer, persistence, error, selection-command, and source-citation flows.
- Record message visibility and transcript scroll geometry in snapshot
  metadata and reject clipped conversation fixtures.
- Prove the corrected conversation screenshots are repeatable at desktop,
  compact, and wide.
- Commit checksum-backed strict zero-diff policies and require them through
  child, production, and release contracts.
- Add missing-baseline, clipped-message, and committed-image mutation
  negatives.
- Record debugging, manual review, commands, artifacts, and exact results
  before moving this task to done/verified.

## Debugging

- The original compact conversation screenshot had a 28px transcript viewport:
  the two messages existed in DOM metadata, but only part of the `YOU` label
  was visible. The current contract validated message content and nonzero
  transcript geometry, so it accepted this unusable layout.
- The first corrected run exposed a debug-provider timing race: the simulated
  request completed after 150ms while the runner was still checking disabled
  controls sequentially, so later controls had already re-enabled.
- The selection-command flow exposed a real edge case. Browser selection could
  contain only whitespace while the cached editor selection remained valid;
  choosing the truthy live value before trimming discarded the cached text.
- Half-pixel header geometry, focus/caret state, animation completion, and
  pointer hover produced avoidable screenshot raster variance. A compact
  write-preview spacing issue also intermittently clipped its final line.

## Delivered

- Increased the assistant working width and added short-height responsive
  spacing for history, toolbar, quick actions, activity, write preview,
  transcript, status, and composer. The corrected compact transcript now has
  182px of usable height and shows both messages completely.
- Normalized live and cached selections independently before choosing the
  first non-empty value, preserving selected-text commands when the browser
  reports whitespace.
- Added an explicit debug-request hold/release handshake for deterministic busy
  assertions, plus snapshot stabilization for pointer, focus, animations, and
  final layout frames.
- Persisted transcript client/scroll geometry and per-message rectangles with
  `fullyVisible` evidence, and made the artifact contract reject short or
  clipped conversation transcripts.
- Added reviewed 560x969 desktop, 560x789 compact, and 560x1069 wide
  conversation PNGs with checksum-backed strict zero-diff policies.
- Required all three baselines through the LLM Chat child contract, aggregate
  production gate, and release summary.
- Added missing-baseline, clipped-conversation, committed-image mutation, and
  whitespace-live-selection regression tests while retaining history,
  permissions, Q&A citations, JSONL persistence, errors, tools, previews, and
  busy-state interaction coverage.

## Verification

Verified on 2026-07-23.

- The faulty compact evidence is
  `artifacts/ui-smoke/llm-chat-ui-2026-07-22T20-44-26-330Z/snapshots/llm-chat-conversation-compact.png`.
  Its transcript measured only 28px and manual review showed only a partial
  `YOU` label despite both messages existing in the DOM.
- `artifacts/ui-smoke/llm-chat-ui-2026-07-23T07-38-01-715Z/` reproduced the
  busy-state timing race. The explicit hold/release handshake removed the
  dependency on sequential assertion timing.
- `artifacts/ui-smoke/llm-chat-ui-2026-07-23T07-50-49-055Z/` reproduced the
  whitespace live-selection bug. The package-core regression now mocks that
  exact browser state and proves the cached selected text reaches both the
  prompt and status.
- Consecutive corrected runs
  `artifacts/ui-smoke/llm-chat-ui-2026-07-23T07-59-23-421Z/` and
  `artifacts/ui-smoke/llm-chat-ui-2026-07-23T08-01-45-961Z/` passed. Desktop
  and compact were byte-identical; the wide captures differed only in
  antialias-classified raster bytes and compared at zero pixels with the
  production comparator (`threshold=0.1`, `includeAA=false`).
- The reviewed committed checksums are:
  - desktop:
    `61782e4e659ac2db2a112f704472418e3a71ce0fdca2b58f568fc81b2125d6dd`;
  - compact:
    `4f7aa08c0eb845ffb6c4f1020691cdb5bca1470ed2457a0e33b63b3718b8ee98`;
  - wide:
    `ea9aa916aa274050aa0275a6c8b46ce7afc29e1eb2b44114e137d8bb896290fb`.
- Manual review confirmed every control, both messages, both write-preview
  lines, status, and composer are visible. Transcript client heights were
  201px desktop, 182px compact, and 251px wide; both `You` and `LLM` messages
  recorded `fullyVisible: true` in every viewport.
- The focused production gate passed one required suite, three screenshots
  totaling 987,359 bytes, three strict zero-pixel baseline comparisons, zero
  console errors, and renderer coverage/trend gates:
  `artifacts/ui-smoke/ui-suite-2026-07-23T08-05-34-125Z/production-visual-gate/production-visual-gate.json`.
- `node --test test/ui-harness-artifacts.test.mjs
  test/production-visual-baseline.test.mjs test/test-release.test.mjs` passed
  107/107 tests: 91 artifact/aggregation tests, nine visual-baseline tests, and
  seven release tests.
- `node --test --test-name-pattern='OpenAI LLM plugin'
  test/package-core.test.mjs` passed 1/1 focused test.

## Remaining Umbrella Work

Additional critical surfaces still need reviewed baselines. The umbrella also
needs a decision on aggregating both real-workspace runners into nightly
production and deliberate renderer coverage improvements.
