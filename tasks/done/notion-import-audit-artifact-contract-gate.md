# Notion Import Audit Artifact Contract Gate

Queue item: 559
Status: done

## Why

The Notion import audit smoke already exercises a deterministic imported
workspace and captures screenshots for the audit result, but the shared UI
regression suite cannot yet validate those artifacts beyond generic viewport
coverage. This leaves imported-workspace audit regressions harder to review in
the aggregate artifact index.

## Scope

- Add a reusable Notion import audit artifact contract helper.
- Attach the contract to `smoke-notion-import-ui` results.
- Validate desktop and compact viewport coverage, non-empty screenshots,
  summary rows, path open buttons, and shell-open dry-run requests.
- Add unit coverage for both passing and failing contract cases.
- Keep this as UI test infrastructure only; no importer data behavior should
  change in this item.

## Acceptance

- The Notion import audit smoke emits an `artifactContract` with desktop and
  compact viewport names.
- Each viewport has a non-empty audit result screenshot plus metadata containing
  summary rows, path button counts, source/workspace roots, and opened paths.
- The contract fails clearly when the audit summary, path buttons, or shell-open
  dry-run evidence is missing.
- Verification includes syntax checks, artifact unit tests, the focused Notion
  import UI smoke, typecheck, and `git diff --check`.

## Verification

- `node --check scripts/lib/notion-import-audit-artifacts.mjs`
- `node --check scripts/smoke-notion-import-ui.mjs`
- `node --test test/ui-harness-artifacts.test.mjs`
- `npm run smoke:notion-import-ui`
  - Artifact: `artifacts/ui-smoke/notion-import-audit-2026-06-16T21-44-05-736Z/harness-result.json`
- `npm run typecheck`
- `git diff --check`

## Notes

- Backend/importer tests are not applicable for this item because importer data
  behavior did not change; the change is a UI smoke artifact contract.
- The focused UI smoke exposed a Notion import settings React root lifecycle
  warning. The settings renderer now reuses an existing root for the same
  container and delays version-matched unmounts, which keeps the console-error
  gate meaningful instead of suppressing errors.
