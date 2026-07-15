# Sidebar Quick-Create Chooser And Recents

Status: done

## Context

The sidebar footer currently exposes separate quick-create buttons. The Notion-like compose icon should be the single affordance, then let users choose whether to create a page or database.

Creating a page or database should also behave like navigation: the new item should be written to the workspace recents list so it appears in the sidebar Recent section and the global recent surfaces.

## Scope

- Replace the two footer quick-create buttons with one Notion-like compose button and a compact Page / Database chooser.
- Record newly created pages and databases in workspace recents.
- Update the sidebar navigation UI smoke to assert the chooser and new-page recent behavior.

## Gates

- `npm run typecheck`
- `npm run smoke:sidebar-navigation-ui`
- `git diff --check`
