# Embedded table page size UI smoke

Status: done

## Goal

Verify embedded database tables honor view page-size settings and load-more
behavior.

## Scope

- Confirm embedded tables start with the default row limit.
- Change the view's rows-per-page setting through the embedded view settings UI.
- Verify the row count updates after save and survives the cached bundle path.
- Click Load more and confirm the visible row count increases by 50.

## Gates

- `npm run smoke:embedded-view-ui`
- `git diff --check`
