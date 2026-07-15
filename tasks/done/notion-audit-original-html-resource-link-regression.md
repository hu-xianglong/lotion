# Notion audit original HTML resource link regression

Status: done

## Why

Preserving the original Notion HTML is only useful for review if the copied HTML
can still load its relative images and attachments. The audit should catch
missing resources referenced by copied original HTML.

## Scope

- Check relative `src`/`href` resource links inside audited copied original HTML.
- Skip external URLs, anchors, and non-file pseudo-protocols.
- Add a regression that corrupts one copied row HTML image reference.

## Gates

- `npm exec tsc -- -p tsconfig.main.json`
- `node scripts/test-notion-import-service.mjs`
- `git diff --check`
