# Link Open Icon Hit Target Polish

Status: done

Priority: highest

Reported by user with screenshot: the open-link icon beside a URL/property link
is much too small, especially on rows like `Flomo链接`.

## Goal

Make explicit link-opening affordances easy to see and click without making URL
text itself accidentally open while users are trying to edit. This should feel
closer to Notion: a clear, compact external/open icon with a real hit target.

## Acceptance

- Increase the visible open-link icon size for URL/property/source-link rows so
  it is readable at normal desktop zoom.
- Increase the clickable hit target to a production-friendly size, at least
  around 28-32 px in both dimensions unless constrained by the existing design.
- Preserve the previous editing behavior: clicking URL text should still focus
  or allow editing where the field is editable; only the explicit open icon
  should open the link.
- Keep the icon visually aligned with the URL text baseline and property row
  layout; avoid tiny floating glyphs, overlap, or horizontal overflow.
- Apply consistently to URL properties, imported original Notion/source links,
  attachment/source-file links where the same open affordance is used, and
  markdown/property link widgets if applicable.
- Provide accessible labels/tooltips that distinguish "open link" from editing
  the URL field.
- Verify compact viewport behavior: icon remains visible and tappable without
  crushing long URLs.

## Required Tests

- Extend `scripts/smoke-url-field-ui.mjs`, source-attachment/property-link smoke,
  or add a focused shared-harness smoke covering the affected open-link icon.
- UI tests must assert concrete geometry: visible icon dimensions, button hit
  target dimensions, alignment relative to the URL row, and no text/icon overlap.
- UI tests must click URL text and verify it remains editable/focused rather
  than opening immediately.
- UI tests must click the explicit open icon and verify the dry-run shell/open
  hook receives the expected URL/path.
- Run across desktop and compact viewports.
- Add renderer/component coverage if the icon affordance is factored into a
  reusable component.

## Gates

- `node --check <updated-url-or-property-link-smoke>`
- `npm run typecheck`
- focused URL/property link UI smoke across desktop and compact viewports
- renderer/component test if a reusable component is extracted
- `git diff --check`

## Result

- Replaced the small text-only page/property link opener with a lucide external
  link icon and a 32px-class hit target.
- Enlarged URL field open buttons to a 32px hit target with focus-visible
  styling and a 16px icon.
- Preserved editable URL text behavior by making the displayed URL focus the
  local input; the explicit open button remains the only open action.
- Extended URL field and source attachment smokes with desktop and compact
  viewport geometry checks for icon size, alignment, overlap, viewport bounds,
  and open-request capture.

## Verification

- `node --check scripts/smoke-url-field-ui.mjs`
- `node --check scripts/smoke-source-attachments-ui.mjs`
- `npm run smoke:url-field-ui`
- `npm run smoke:source-attachments-ui`
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`
