# Row Page Entity-Ref Property Navigation

## Goal

Make entity/page reference properties clickable inside row pages, matching the
database table cell behavior.

## Scope

- Pass the existing Lotion entity opener into `RowPageProperties`.
- Add a row-page smoke fixture with an `entity_ref` property.
- Click the row-page property chip and verify it opens the referenced page.

## Gates

- [x] `npm run smoke:row-page-navigation-ui`
- [x] `npm run smoke:ui`
- [x] `git diff --check`
