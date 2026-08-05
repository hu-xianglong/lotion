# Notion Import Modal Complete Control Geometry And Baselines

Status: done

Verification status: verified

## Goal

Turn the existing Notion Import overlay screenshot into a complete,
production-blocking control and modal-ownership contract, then promote the
reviewed empty-import state to desktop, compact, and wide baselines.

## Acceptance Criteria

- Prove the current artifact contract accepts modal evidence without checking
  the actual import controls or screenshot visibility.
- Record and require geometry for modal, title, Close, Import settings, all
  three options, Markdown & CSV selector, HTML selector, Cancel, and Scan
  exports.
- Require dialog/backdrop ownership, modal viewport containment, modal-body
  vertical scrolling behavior, visibility, opacity, no horizontal overflow,
  and disabled Scan exports before folders are selected.
- Reject clipped/offscreen controls, hidden/transparent false-positive
  captures, missing controls, invalid initial action state, and missing
  committed baselines.
- Commit reviewed desktop, compact, and wide command-modal baselines and require
  them through child, aggregate production, and release contracts.
- Add deliberate committed-image mutation coverage without lowering renderer
  coverage.
- Preserve the existing passing audit, blocking diagnostic, source/workspace
  Open actions, and their multi-viewport artifact evidence.
- Record debugging, manual review, commands, artifacts, and exact results
  before moving this task to done/verified.

## Debugging

- `assertImportModalViewport` validates only title, dialog semantics, backdrop
  coverage, center ownership, background-page exclusion, and non-empty files.
- It does not inspect any modal control, control containment, visibility,
  opacity, initial Scan state, scroll ownership, or horizontal overflow.
- The command-modal snapshots are present at desktop, compact, and wide, but
  have no committed perceptual baselines or deliberate-mutation negative.
- The existing passing and diagnostic audit phases are useful interaction
  coverage and must remain intact while the modal evidence becomes strict.

## Verification

### Delivered

- Extended the existing overlay check into a complete modal control-state
  contract covering the title, Close, Import settings fieldset, all three
  checked options, both source cards and folder selectors, Cancel, and the
  initially disabled Scan exports action.
- Added positive geometry, owner containment, viewport containment,
  visibility, opacity, modal-body vertical scroll ownership, and document
  horizontal-overflow assertions in both the live smoke and persisted artifact
  contract.
- Persisted the same control evidence into screenshot metadata so an entry-only
  claim cannot mask an incomplete capture.
- Preserved the passing audit, blocking `cell_loss` diagnostic, and all dry-run
  Open action evidence at desktop, compact, and wide.
- Added positive contract coverage plus clipped/transparent and
  missing-required-baseline negatives.
- Added a deliberate pixel mutation test against the committed compact image.
- Registered Notion Import for default production perceptual coverage and
  release evidence, raising the default baseline requirement from 30 to 33.

### Debugging results

- The prior command-modal contract accepted any non-empty screenshot if its
  dialog title/backdrop metadata passed; it never inspected a real import
  control or whether modal content was visible.
- Live geometry confirmed the modal is complete at every default viewport:
  760×644 modal, three checked options, two source selectors, both footer
  actions, `Scan exports` disabled, `overflow-y: auto` on the 560 px modal
  body, opacity 1, and zero horizontal overflow.
- No product rendering defect was found after applying the stricter contract;
  the bug was the verification blind spot itself.

### How it was verified

- Manually reviewed the compact command-modal screenshot and confirmed all
  settings explanations, required/recommended source cards, selectors, Cancel,
  and disabled Scan exports are readable and unclipped.
- Repeated all three candidate captures before promotion. Each viewport
  produced an identical checksum across runs:
  - desktop: `f07216588218ff783dd8b0c7402bd9295d12a8e89f89feef85acd6548bf1a95b`
  - compact: `c0e562511365b1bd34799eacbcdbebb384491536fdf621361881c8e67bb04273`
  - wide: `a104a64daecf380225f48b2a78fa2067b02b6e3b6e64fc4e9cdc2fc527a988d9`
- Reran the promoted 760×644 baselines with strict zero tolerance; all three
  returned `diffPixels: 0` and `diffRatio: 0`.
- The focused production gate passed with one required suite, nine screenshots,
  555,936 image bytes, three perceptual baselines, and zero console errors.
- Renderer coverage remained above absolute and historical gates:
  lines/statements 31.49%, functions 23.36%, and branches 61.34%.

### Commands and evidence

- `node --test test/production-visual-baseline.test.mjs test/ui-harness-artifacts.test.mjs test/test-release.test.mjs`
  — 125/125 passed.
- `LOTION_NOTION_IMPORT_SKIP_BASELINE=1 LOTION_UI_VIEWPORTS='desktop,compact,wide:1728x1100' node scripts/smoke-notion-import-ui.mjs`
  — two candidate runs produced identical hashes.
- `LOTION_UI_VIEWPORTS='desktop,compact,wide:1728x1100' node scripts/smoke-notion-import-ui.mjs`
  — strict child evidence passed at
  `artifacts/ui-smoke/notion-import-audit-2026-07-23T15-15-42-280Z/harness-result.json`.
- `LOTION_PRODUCTION_VISUAL_FILTER='smoke-notion-import-ui.mjs' LOTION_PRODUCTION_VISUAL_REQUIRED_SCRIPTS='scripts/smoke-notion-import-ui.mjs' LOTION_UI_VIEWPORTS='desktop,compact,wide:1728x1100' node scripts/test-production-ui-visual-quality.mjs`
  — focused production evidence passed at
  `artifacts/ui-smoke/ui-suite-2026-07-23T15-16-14-876Z/production-visual-gate/production-visual-gate.json`.
