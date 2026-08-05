# Task 716: Inline database icon provenance and rendering

Status: done

Verification status: verified

## Problem

The Notion import audit counted only database page-header images. This missed
emoji stored in `data-emoji`, image URLs that need a remote fallback when an
exported local copy is absent, and the renderer never displayed the resolved
source database icon in an embedded database header.

Notion HTML does not duplicate an icon inside `collection-content`. An inline
view must use the icon from the database schema it resolves to. It must never
inherit the containing page or a database row icon.

## Acceptance criteria

- Parse page-header emoji from both visible text and Notion's `data-emoji`
  attribute.
- Prefer exported local icon files, but retain the page's original remote icon
  URL as a fallback when the referenced local copy is absent.
- Render the resolved database icon in standalone and embedded database
  headers; render a stable neutral fallback when no source icon exists.
- Repair only source-backed icon values in an existing workspace, with backup,
  audit, idempotence, and non-icon schema preservation.
- Audit custom-icon provenance separately from the neutral database fallback;
  an inline view must not inherit its containing page or row icon.
- Keep exact-hash full-page database HTML from regressing into a duplicate
  standalone CSV-link page when HTML and CSV exports come from separate roots.
- Cover image, emoji, missing-local-file fallback, inline rendering, and
  missing-icon rendering with focused automated tests.

## Verification

- All required gates passed.
- `node scripts/test-notion-html-converter.mjs`
- `node scripts/test-notion-import-service.mjs`
- `node scripts/test-repair-imported-database-icons.mjs`
- `npm run test:renderer-components --workspaces=false`
- `npm run typecheck`
- `npm run test:fixtures`
- `npm run test:latency`
- `npm run build`
- Production repair applied with a backup report under
  `reports/database-icon-repair-2026-08-05T16-18-09-883Z`; a second dry-run
  reported zero recoverable icons.
- Production audit: 1,185 Notion database schemas, 13 source-backed custom
  icons, 34,445 inline-view occurrences, and zero inline title icons in the
  exported HTML. All iconless embedded views use the neutral database glyph.
