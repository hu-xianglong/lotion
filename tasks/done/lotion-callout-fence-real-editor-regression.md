# Lotion callout fence real editor regression

Status: done

## Why

Imported Notion callouts and direct Markdown editing both rely on
`lotion-callout` fenced blocks. Slash insertion is already covered, but direct
typing of the fenced callout should also stay Notion-like: render a callout,
hide source after the cursor leaves, preserve the icon/body, and keep ordinary
typing below the callout working.

## Acceptance

- The editor regression smoke types a `lotion-callout` fenced block directly.
- The live preview renders the callout widget with the expected icon and body.
- Inactive source fence lines are hidden after the cursor leaves the callout.
- Typing continues below the callout and persists after the closing fence.
- The smoke runs across desktop and compact viewports and asserts no horizontal
  overflow.

## Verification

- `node --check scripts/smoke-editor-regression-ui.mjs`
- `npm run smoke:editor-regression-ui`
  - Artifact: `artifacts/ui-smoke/editor-regression-2026-06-13T22-48-28-492Z`
  - Covered desktop and compact direct `lotion-callout` fenced block editing.
  - Verified rendered callout icon/body, hidden inactive source fence, continued
    typing below the callout, persisted Markdown, and no horizontal overflow.
- `npm run test:renderer-components`
- `npm run typecheck`
- `git diff --check`

No backend/parser changes were needed; this item adds real-editor UI regression
coverage for existing callout rendering behavior.
