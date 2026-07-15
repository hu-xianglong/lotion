# Notion Converter Missing Collection Placeholder Regression

Status: done

## Why

Imported Notion pages can contain embedded collection HTML that does not resolve
to a kept Lotion database. The renderer now turns `_📂 ... (database not found)_`
into an actionable preview, but the converter should keep producing that stable,
standalone placeholder shape so the renderer can recognize it.

## Scope

- Add a focused Notion HTML converter regression for unresolved embedded
  collection views.
- Assert the converted Markdown is exactly the stable placeholder line and does
  not include raw collection table cells or duplicate wrapper text.
- No frontend UI code changes are needed; item 359 already covers the visible
  multi-resolution preview and edit-source behavior.

## Gates

- `npm exec -- tsc -p tsconfig.main.json`
- `node scripts/test-notion-html-converter.mjs`
- `npm run typecheck`
- `git diff --check`

## Result

- Added a focused Notion HTML converter regression for unresolved embedded
  collection HTML.
- Locked the converted markdown to `_📂 收集箱 (database not found)_`, which is
  the standalone placeholder shape consumed by the live-preview widget.
- Confirmed frontend UI coverage is handled by item 359; this item only
  strengthens the converter/data layer.
