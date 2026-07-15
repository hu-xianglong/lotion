# Gallery Card Open Navigation Smoke

Status: done

## Why

Gallery cards now include nested icon/title/caption markup. The whole card
should remain a reliable row-page navigation target.

## Scope

- Click a deterministic gallery card.
- Verify the corresponding row page opens.
- Return to the database view so existing gallery/calendar checks continue.

## Gates

- `npm run smoke:database-template-ui`
- `git diff --check`
