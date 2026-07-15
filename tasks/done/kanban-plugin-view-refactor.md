# Kanban Plugin View Refactor

Status: done

## Goal

Move Kanban from a dev-only experiment into the normal database view system.

## Done

- Registered Kanban as a built-in plugin-backed database view provider.
- Let `DatabaseTable` render plugin views from the provider registry.
- Added provider config support to view settings.
- Persisted `view.config.groupBy` for the Kanban fixture.
- Added a sample Markdown page that embeds the Kanban view by reference.
- Added fixture validation for plugin-backed view types.
- Documented the testing loop for database views and embedded page views.
- Removed the old Kanban dev overlay path after the view host integration landed.

## Follow-up

- Build a better page-side Insert View picker.
- Add a page embedded-view header with direct settings and refresh actions.
- Start a read-only plugin manager surface before external plugin loading.
