# Page Breadcrumb Parent Navigation Smoke

## Goal

Ensure page breadcrumbs with a real parent entity render the parent segment as a
clickable Lotion navigation target while preserving titles that contain `/`.

## Scope

- Extend the page-path slash fixture with a parent page record.
- Give the child page a `parent_id` entity ref.
- Click the parent breadcrumb and verify the parent page opens.

## Gates

- [x] `npm run smoke:page-path-slash-ui`
- [x] `npm run smoke:ui`
- [x] `git diff --check`
