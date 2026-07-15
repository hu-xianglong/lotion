# Notion Import Audit Details In UI Artifact Index

Status: done

## Why

The focused UI regression lane now includes the Notion import audit smoke, but
the aggregate `ui-suite-artifacts.json` and Markdown report collapsed each child
contract to viewport and screenshot byte counts. That lost the audit-specific
evidence reviewers need: path button counts, opened path counts, and
source/import summary rows.

## Scope

- Preserve stable per-snapshot contract details from child UI smokes in the
  aggregate UI suite artifact index.
- Surface Notion import audit details in the Markdown index without making the
  report noisy for unrelated suites.
- Add unit coverage for the artifact index detail preservation.
- Verify through the filtered Notion import UI suite so desktop and compact
  evidence is produced by the real smoke.
- Do not change importer or audit runtime behavior.

## Acceptance

- `ui-suite-artifacts.json` preserves Notion import audit snapshot details for
  `pathButtons`, `openedCount`, and summary rows.
- `ui-suite-artifacts.md` includes concise detail text for suites that provide
  snapshot details.
- The Notion import filtered UI suite still passes and writes an aggregate
  index containing the preserved details.
- Backend/import tests are not applicable because this item only changes UI
  artifact reporting.

## Gates

- Passed: `node --check scripts/ui-harness.mjs`
- Passed: `node --check scripts/lib/ui-suite-artifacts.mjs`
- Passed: `node --test test/ui-harness-artifacts.test.mjs`
- Passed: `LOTION_UI_SUITE_FILTER=notion-import npm run smoke:ui`
  - Aggregate artifact:
    `artifacts/ui-smoke/ui-suite-2026-06-17T07-26-34-700Z/ui-suite-artifacts.json`
  - Markdown artifact:
    `artifacts/ui-smoke/ui-suite-2026-06-17T07-26-34-700Z/ui-suite-artifacts.md`
  - Notion import audit artifact:
    `artifacts/ui-smoke/notion-import-audit-2026-06-17T07-26-55-146Z/harness-result.json`
  - Contract evidence: desktop and compact snapshots preserve
    `pathButtons=2`, `openedCount=2`, `Source CSVs=1 / 1`,
    `Source HTMLs=1 / 1`, `Imported mappings=1 database, 1 row/page`,
    `Issues=0`, and `Warnings=0`.
- Passed: `npm run typecheck`
- Passed: `git diff --check`

## Result

The shared harness result manifest now preserves audit summary fields and path
button counts before the aggregate suite reads child manifests. The UI suite
artifact index keeps those details in JSON and adds a concise Markdown Details
column, so a Notion import audit regression run can be reviewed without opening
each child artifact first.
