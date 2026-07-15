# Keep Editable URL Fields Editable

## Problem

Editable URL fields could feel read-only because clicking a displayed value could
open the URL instead of focusing the field for editing.

## Result

- Kept explicit open behavior for read-only source fields such as `Original
  Notion HTML` and `Original Notion CSV`.
- Ensured editable row/page properties render through their field editor even
  when the value looks like a Markdown link.
- Extended the URL field UI smoke to verify that clicking URL text focuses the
  editor without shell-open, while the explicit open affordance still opens the
  URL.

## Gates

- `npm run typecheck`
- `npm run smoke:url-field-ui`
- `git diff --check`
