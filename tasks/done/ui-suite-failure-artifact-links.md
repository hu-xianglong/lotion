# UI Suite Failure Artifact Links

Status: done

## Why

The shared UI harness writes useful failure artifacts such as `failure.png`,
`dom.html`, console logs, and a `README.md`, but the structured
`harness-result.json` and aggregate UI suite index did not expose those paths.
That made CI/local failure review slower because engineers had to browse each
timestamped artifact directory manually.

## Scope

- Add structured `failureArtifacts` paths to failed harness result manifests.
- Preserve child failure artifact paths in the UI suite artifact index.
- Show failure README and screenshot links in the aggregate Markdown artifact
  column when a child suite has failed.
- Keep this in the shared harness/artifact layer so every UI smoke benefits.

## Verification

- `node --check scripts/ui-harness.mjs && node --check scripts/lib/ui-suite-artifacts.mjs && node --check scripts/smoke-ui-suite.mjs`
- `node --test test/ui-harness-artifacts.test.mjs`
- `LOTION_UI_SUITE_FILTER=smoke-row-page-property-visual-ui.mjs npm run smoke:ui`
  - Generated `artifacts/ui-smoke/ui-suite-2026-06-17T12-55-35-023Z/ui-suite-artifacts.json`
  - Generated `artifacts/ui-smoke/ui-suite-2026-06-17T12-55-35-023Z/ui-suite-artifacts.md`
- `npm run typecheck`
- `git diff --check`
