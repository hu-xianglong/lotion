# Refresh Notion import icon docs

Status: done

## Why

The Notion import docs still described page icons as unused and stored through
frontmatter. Current importer behavior stores icons through page/entity
metadata instead, so the docs pointed future fixes at the wrong layer.

## Scope

- Update the compatibility checklist for emoji and image page icons.
- Replace the old frontmatter pitfall with the current icon metadata lanes.
- Keep cover image called out as the remaining unsupported page media item.

## Gates

- `git diff --check`
