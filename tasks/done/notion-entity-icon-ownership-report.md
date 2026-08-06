# Notion entity icon ownership report

## Problem

The importer preserved icons when an HTML document had the same Notion ID as
a database or when a link explicitly targeted that database. It could also fold
a database-only wrapper page into a canonical database, but that fallback
matched the wrapper and database by title. A real export uses the wrapper title
`待办事项清单`, the embedded collection title `待办事项`, and stable collection ID
`299eb665857142bea489b6cb1d309835`; the title fallback therefore discarded the
wrapper's source-backed icon.

The import report also had no icon accounting, so dropped or ambiguous entity
icons were silent.

## Resolution

- Extract entity-level page, database, row-page, and explicit-link icon evidence
  separately from property, callout, and ordinary content icons.
- Resolve ownership by stable Notion identity before any title fallback.
- Treat empty paragraphs around a sole collection as non-material so a real
  Notion database wrapper remains identifiable.
- Transfer a wrapper page's header icon to its sole canonical database when the
  wrapper page is redirected rather than emitted.
- Follow explicit icon links through wrapper-page-to-database redirects.
- Preserve icon-bearing otherwise-empty pages rather than silently dropping
  their only user-visible metadata.
- Write `reports/notion-icon-ownership.json` on every import and summarize
  resolved, transferred, ambiguous, and unassigned evidence in the generated
  Notion import report page.
- Never overwrite stronger exact-identity evidence or choose an arbitrary
  database when a wrapper contains multiple stable collection targets.

## Verification

Verification status: verified

- `npm run typecheck --workspaces=false`
- `npm run build --workspaces=false`
- `node scripts/test-notion-html-converter.mjs`
  - empty paragraphs around a sole collection remain a wrapper
- `node scripts/test-notion-import-service.mjs`
  - exact, transferred, ambiguous, and genuinely unassigned evidence
  - stable collection-ID transfer despite different wrapper/database titles
  - explicit link ownership follows wrapper redirects
  - multi-database wrappers do not choose an arbitrary owner
  - JSON report and Markdown import-report summary
- `npm run test:fast --workspaces=false`
  - all 80 core tests plus import, formula, editor, renderer, link, hierarchy,
    workspace, fixture, and latency gates passed in the real macOS watcher
    environment
- Full dual-export import using the current Downloads Markdown/CSV and HTML
  exports produced 6,496 entity icon records: 6,492 resolved directly, 4
  transferred, 0 ambiguous, and 0 unassigned.
- The real `待办事项` database with Notion ID
  `299eb665857142bea489b6cb1d309835` received
  `attachments/images/e75ab4c6ea2ebf12575a8c3a-to-do-list_(3).png`.
- `npm run package:mac --workspaces=false`
- `npm run package:mac:verify --workspaces=false`
  - verified arm64 ZIP and DMG, signature, native module, packaged ripgrep, and
    a four-second packaged-app startup smoke
- Replaced `/Applications/Lotion.app`; installed and packaged `app.asar` SHA-256
  both equal `540ed2490b8d4716defd9d12ba3c5c63a7543aeb9a2a3e6bbba44d22b23a5d80`.
- Launched `/Applications/Lotion.app` against the user's real workspace and
  confirmed its renderer process uses `/Applications/Lotion.app/Contents/Resources/app.asar`.
