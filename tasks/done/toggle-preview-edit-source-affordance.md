# Toggle preview edit source affordance

Status: done

## Why

Imported Notion toggles now collapse to a live-preview widget when the cursor is
outside the fenced block. The user still needs an obvious way to jump back into
the hidden source.

## Scope

- Add the existing "Edit source" affordance to collapsed `lotion-toggle`
  widgets.
- Cover it in the markdown preview smoke.

## Gates

- [x] `npm run typecheck`
- [x] `npm run smoke:markdown-preview-ui`
- [x] `git diff --check`
