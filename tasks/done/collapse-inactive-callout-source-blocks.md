# Collapse Inactive Callout Source Blocks

Status: done

## Why

Imported Notion callouts render as `lotion-callout` fenced blocks plus a rich
callout widget. Showing both the source block and the rendered callout on
inactive lines makes the page noisy and diverges from the rest of Lotion's
custom block preview behavior.

## Scope

- Collapse inactive `lotion-callout` fences into the rendered callout widget.
- Keep source editing available when the cursor is inside the fence or through
  an edit-source affordance.
- Extend the markdown preview smoke so raw callout source cannot leak into
  inactive live preview.

## Gates

- `npm run typecheck`
- `npm run smoke:markdown-preview-ui`
- `git diff --check`

## Result

- Inactive `lotion-callout` fences now render as a single callout widget.
- Moving the cursor into the fence or clicking `Edit source` reveals the source
  for editing.
- Markdown preview smoke now asserts that callout source text is hidden while
  the rendered callout and edit-source affordance remain available.
