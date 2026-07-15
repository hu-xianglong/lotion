# Gallery View URL Cover Rendering Smoke

Status: done

## Why

The gallery settings smoke verifies `coverFieldId` persistence, but it should
also prove that a URL typed cover field is actually used by the rendered card
cover image.

## Scope

- Make the database-template smoke fixture use a real `url` field for
  `Cover URL`.
- Seed a deterministic data-URL cover into a visible Ready row.
- Verify the gallery card for that row renders an `<img>` with that source.
- Fix gallery rendering so hidden cover fields still drive the card image;
  visible fields continue to control only card captions.

## Gates

- `npm run smoke:database-template-ui` passed.
- `npm run typecheck` passed.
- `git diff --check` passed.
