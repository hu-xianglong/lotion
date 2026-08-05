# Renderer Markdown Dead-Code Removal

Status: done

Verification status: verified

## Goal

Resolve the zero-hit `src/renderer/lib/markdown.ts` finding honestly by removing
the obsolete renderer rather than adding tests that cannot exercise a user
path.

## Audit

- Repository-wide symbol/import search finds `parseMarkdown` only at its
  definition.
- No renderer, builtin plugin, script, or test imports the module.
- The active page editor renders Markdown through CodeMirror and
  `features/pages/markdown-decorations.ts`.
- Keeping and testing this independent basic renderer would create coverage
  without protecting production behavior.

## Acceptance Criteria

- Remove the unreferenced module.
- Confirm the renderer inventory decreases by one without missing-source
  coverage errors.
- Run Markdown component/editor/UI coverage, typecheck, production visual,
  build, task-documentation, and diff checks.
- Record the evidence and move to done/verified.

## Verification

Verified on 2026-07-23.

- Repository-wide import/symbol search found no consumer of
  `src/renderer/lib/markdown.ts` or `parseMarkdown`; only the definition
  remained. The active editor path is CodeMirror plus
  `features/pages/markdown-decorations.ts`.
- Removed the obsolete 86-line parallel renderer rather than adding artificial
  coverage for unreachable behavior.
- `npm run smoke:markdown-preview-ui` passed desktop and compact with complete
  formatting, task, callout, image, iframe, toggle, equation, table, link,
  missing-database, source-editing, selection, persistence, and geometry
  evidence. Both committed selected-source baselines had zero differing pixels.
  Artifact:
  `artifacts/ui-smoke/markdown-preview-ui-2026-07-23T21-33-27-318Z/`.
- `npm run test:renderer-coverage` passed: the exact inventory changed from 67
  to 66 files with no missing or unexpected source, while all 64 previously
  covered files remained covered. The verified baseline is now
  15,378/24,330 lines/statements (63.21%), 286/1,133 functions (25.24%), and
  1,188/1,860 branches (63.87%).
- `npm run test:production-visual` passed 16/16 suites, 79 screenshots, and 48
  strict zero-diff baselines. The production artifact records zero trend delta:
  `artifacts/ui-smoke/ui-suite-2026-07-23T21-34-15-634Z/production-visual-gate/production-visual-gate.json`.
- `npm run typecheck`, `npm run build`, `npm run test:task-docs`, and
  `git diff --check` passed. Vite emitted only its existing large-chunk
  advisory.
