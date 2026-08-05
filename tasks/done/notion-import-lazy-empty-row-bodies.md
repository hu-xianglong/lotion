# Task 717: Notion import lazy empty row bodies

Status: done

Verification status: verified

## Problem

The Notion importer correctly retains database rows whose properties contain
data even when their page body is empty, but it still allocated `page_file` and
`body_path` values and wrote a zero-byte Markdown file. A real dual-export
import therefore produced many invalid empty files and failed workspace smoke
validation.

## Acceptance criteria

- Preserve property-only database rows and every imported CSV value.
- Do not allocate or write a Markdown body for a row whose cleaned body is
  empty; leave its database and system-page body metadata empty.
- Keep row identity, hierarchy, dates, icons, covers, and source audit links.
- Materialize the body lazily through the existing row-page update path when a
  user first adds content.
- Continue dropping a completely blank row when the import option requests it.
- Cover CSV-only property rows, non-empty row bodies, system page/entity
  indexes, and zero-byte file absence with automated tests.
- Re-import the latest Markdown & CSV and HTML exports into a fresh workspace,
  pass structural validation, and verify duplicate database pages are absent.

## Verification

- `npx tsc -p tsconfig.main.json`
- `node scripts/test-notion-import-service.mjs`
- `npm run test:fixtures`
- `npm run test:latency`
- `npm run build`
- Real dual-export import completed from the latest Markdown & CSV and HTML
  folders in 103.3 seconds with 1,185 databases and 43,119 retained rows.
- Real workspace smoke validation passed: 1,189 total databases, 132,064 total
  rows across user/system databases, 28,863 materialized row bodies, 14,282
  lazy row bodies, and zero invalid empty Markdown files.
- Real hierarchy validation passed: 43,418 page records, 44,603 entity records,
  87,994 parent references, and zero slash-title path warnings.
- `数据库汇总` contains all 52 source rows and has zero same-source duplicate
  standalone pages.
- Database icon audit found 13 source-backed custom icons and no ambiguous icon
  provenance; iconless databases use the neutral database glyph.
