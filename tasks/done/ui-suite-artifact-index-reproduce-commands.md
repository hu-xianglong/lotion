# UI Suite Artifact Index Reproduce Commands

Status: done

## Why

The UI regression suite artifact index now links child artifact roots and
representative screenshots, but a failing aggregate report still does not make
the next debugging action obvious. Reviewers should be able to copy a focused
command directly from the JSON or Markdown index instead of reconstructing it
from the suite source.

## Scope

- Record each selected child smoke script path in the UI suite result.
- Record a focused `LOTION_UI_SUITE_FILTER=... npm run smoke:ui` reproduce
  command per child smoke.
- Surface the reproduce command in `ui-suite-artifacts.json` and
  `ui-suite-artifacts.md`.
- Keep the artifact index contract strict so future aggregate reports cannot
  omit the command.
- Document that the Markdown report contains child artifact links and focused
  reproduce commands.

## Verification

- `node --check scripts/smoke-ui-suite.mjs && node --check scripts/lib/ui-suite-artifacts.mjs`
- `node --test test/ui-harness-artifacts.test.mjs`
- `LOTION_UI_SUITE_FILTER=smoke-row-page-property-visual-ui.mjs npm run smoke:ui`
  - Verified `artifacts/ui-smoke/ui-suite-2026-06-17T12-15-33-747Z/ui-suite-artifacts.json`
    records `scriptPath` and `reproduceCommand`.
  - Verified `artifacts/ui-smoke/ui-suite-2026-06-17T12-15-33-747Z/ui-suite-artifacts.md`
    includes the `Reproduce` column with
    `LOTION_UI_SUITE_FILTER=smoke-row-page-property-visual-ui.mjs npm run smoke:ui`.
- `npm run typecheck`
- `git diff --check`
