# Page Backlinks Panel UI Smoke

Status: done

## Why

The backlinks panel is a renderer feature, so the API regression test is not
enough. It needs a small UI smoke that proves the panel renders from a real
workspace fixture and that clicking a backlink opens the source entity.

## Scope

- Add a deterministic Playwright smoke fixture with a target page and a source
  page that links to it.
- Assert the target page shows the backlinks panel with source title/context.
- Click the backlink source and assert Lotion opens the source page.

## Gates

- `npm run smoke:page-backlinks-ui`
- `git diff --check`
