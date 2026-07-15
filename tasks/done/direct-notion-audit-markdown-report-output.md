# Direct Notion audit Markdown report output

Status: done

## Why

The Notion import audit is now visible in the plugin UI and the UI regression
artifact index, but the direct command-line audit still only writes JSON plus
plain terminal text. Large import audits need a stable, human-readable Markdown
report without requiring a full reimport regression run.

## Acceptance

- Add a direct audit CLI option that writes a Markdown report beside or instead
  of JSON.
- Keep the report focused and reviewable: source/workspace roots, audited CSV
  and HTML counts, workspace mapping counts, issue/warning totals, issue/warning
  kind summaries, and first issue/warning rows.
- Keep text, JSON, and exit-code behavior unchanged.
- Add coded service/CLI coverage for the Markdown formatter and CLI output.
- No frontend/UI smoke is required because this task only changes the audit CLI
  and service formatting surface.

## Result

- Added `formatNotionAuditMarkdown` to the shared Notion audit service.
- Added `audit:notion -- --markdown <report.md>` and `--markdown-report` CLI
  output while preserving default text, JSON, and non-zero issue exit behavior.
- Extended the focused Notion import/audit regression to verify direct audit
  JSON and Markdown reports from the CLI plus the shared Markdown formatter.
- Documented the direct audit JSON/Markdown report command in testing docs.

## Verification

- [x] `node --check scripts/audit-notion-import.mjs`
- [x] `npm exec -- tsc -p tsconfig.main.json && node scripts/test-notion-import-service.mjs`
- [x] `npm run typecheck`
- [x] `git diff --check`
