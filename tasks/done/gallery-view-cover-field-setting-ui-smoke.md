# Gallery View Cover Field Setting UI Smoke

Status: done

## Why

Gallery views expose a cover-field picker. The smoke suite verifies gallery body
rendering but not that choosing a cover field persists in the saved view.

## Scope

- Add a deterministic `Cover URL` text field to the database fixture.
- When switching the created view to gallery, choose `Cover URL`.
- Verify the saved view stores `coverFieldId: "cover_url"`.
- Allow URL fields in the gallery cover-field picker because imported or
  migrated cover URL columns are normalized to `url`.
- Keep the final created view type as list for the later duplicate/default
  assertions.

## Gates

- `npm run smoke:database-template-ui` passed.
- `npm run typecheck` passed.
- `git diff --check` passed.
