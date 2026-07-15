# CodeMirror Live Preview Writing Surface

Status: done

## Why

The editor should keep CodeMirror's native text-editing behavior for ordinary
markdown while still showing a Notion-like readable surface when the cursor is
not inside a rich block. The current renderer has grown around previews,
embedded views, raw mode, and cursor behavior, so the next step should make the
preview/edit boundary explicit and measurable.

## Scope

- Keep ordinary markdown blocks editable through CodeMirror's default text
  behavior.
- Ensure markdown source for normal text is exposed only where the active cursor
  needs it.
- Keep custom behavior for Lotion objects such as embedded database views.
- Add a focused editor latency benchmark or smoke test for large markdown pages.
- Preserve existing raw markdown mode behavior.

## Non-goals

- Do not build a full block database model.
- Do not redesign the markdown renderer.
- Do not change database table editing internals in this task.

## Acceptance

- Editing normal markdown text remains responsive.
- Raw markdown mode can be toggled without crashing.
- Lotion embedded views still mount and update outside ordinary markdown text.
- A focused editor latency test or benchmark is available.
- `npm run typecheck` passes.
- `npm run test:fixtures` passes.
- `npm run test:latency` passes.

## Implementation

- Added a shared live-preview policy that identifies markdown lines capable of
  changing block-level preview geometry.
- Reused mapped block decorations for plain same-line text edits instead of
  rebuilding the entire block decoration set.
- Avoided inline decoration rebuilds for cursor movement that stays on the same
  active line range.
- Added a focused policy test and a lightweight editor latency benchmark.

## Verification

- `npm run test:editor-policy`
- `npm run benchmark:editor-latency`
- `npm run typecheck`
- `npm run test:fixtures`
- `npm run test:latency`
- `npm run build`
- `git diff --check`
- Electron smoke: temporary demo workspace, `Markdown Lab`, ordinary text input,
  raw markdown on/off toggle, and screenshot
  `/tmp/lotion-editor-raw-smoke.png`.
