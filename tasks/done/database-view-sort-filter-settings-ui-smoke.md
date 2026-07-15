# Database View Sort And Filter Settings UI Smoke

Status: done

## Why

Database view settings already expose sort and filter controls, but the UI
smoke suite only covered view creation, rename, duplicate, delete, default view,
templates, page size, and column summaries. Sort/filter persistence is core
Notion database behavior and should be guarded by the same deterministic
fixture.

## Scope

- Add deterministic records with distinct status and score values.
- Use the view settings dialog to set:
  - filter: `Status is Blocked`
  - sort: `Score descending`
- Verify the visible table applies the filter and sort.
- Verify the saved view stores the sort/filter config.
- Reload and verify the visible table still applies the saved sort/filter.

## Gates

- `npm run smoke:database-template-ui` passed.
- `git diff --check` passed.
