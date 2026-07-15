# Production visual style system rollout

Status: completed

Decision state: implemented, production gate passing

## Why

Lotion needs a production-grade visual system, not a one-off restyle. The app
already has a frontend design-system document, UI smoke tests, and a design
system lab, but visual decisions are still scattered across global CSS,
renderer surfaces, builtin plugins, and tests.

The goal is to make Lotion feel like a quiet local knowledge workbench:
dense, white, readable, keyboard-friendly, and reliable for repeated daily use.

## Product style direction

- Neutral workbench chrome, not a marketing page.
- White editor and table surfaces by default.
- Subtle sidebar/tab chrome using shared neutral tokens.
- One muted accent path for primary actions, active navigation, focus rings,
  links, and selected state.
- Status colors only for status: success, warning, error, disabled, loading.
- Compact typography, crisp rules, stable controls, and restrained shadows.
- Cards only for repeated items, dialogs, and bounded tools. Avoid nested cards.

## Production approach

1. Define the style contract.
   - Update the visual principles in `docs/frontend-design-system.md`.
   - Define token roles for surfaces, ink, rules, accent, status, radius,
     shadows, and focus.
   - Record which colors are allowed for routine UI and which are status-only.

2. Build the token layer.
   - Consolidate global CSS variables in `src/renderer/styles.css`.
   - Remove one-off primary button colors and page-local focus colors.
   - Add companion tokens for accent hover, accent soft, focus ring, and
     success/warning/danger states.

3. Normalize shared primitives.
   - Align button, icon button, input, select, toggle, segmented control,
     panel, result row, settings row, source card, status pill, and keyboard
     badge styles.
   - Keep dimensions stable so hover/focus/content changes do not shift layout.
   - Preserve accessibility: visible focus, disabled state, and readable
     contrast.

4. Restyle the app shell first.
   - Sidebar.
   - Tab strip.
   - Main content canvas.
   - Search box and global search dialog.
   - Modal/popover shell.
   - Active navigation trail.

5. Migrate high-traffic surfaces.
   - Page editor chrome.
   - Database table toolbar and view controls.
   - Search & AI / Advanced Search.
   - Settings center.
   - Plugin manager.
   - LLM Chat.
   - Notion Import / audit surfaces.
   - GitHub Backup.

6. Bring builtin plugins into the same system.
   - Replace old fallback CSS values in builtin plugin style strings.
   - Prefer shared app tokens over plugin-local colors.
   - Keep plugin-specific colors only for provider/status meaning.

7. Add visual quality gates.
   - Update design-system smoke token assertions.
   - Update white-theme smoke token assertions.
   - Keep renderer component tests aligned with the design lab.
   - Add screenshots and geometry checks for changed critical surfaces.
   - Ensure artifact contracts validate the current token contract.

## Suggested first slice

Start with the foundation only:

- Update `docs/frontend-design-system.md` with the final style contract.
- Update global CSS tokens.
- Normalize shared primitives.
- Update the design system lab copy and token swatches.
- Update design-system and white-theme smoke assertions.
- Run:
  - `npm run test:renderer-components`
  - `npm run smoke:design-system-ui`
  - `npm run smoke:white-theme-ui`

Do not migrate every business surface in the first slice. The first slice is
successful when the app shell and design primitives visibly follow one unified
system and the visual contract is enforced by tests.

## Progress

2026-06-17: first slice completed.

- Documented the workbench visual contract.
- Updated the global token layer and shared primitive styling.
- Updated the design system lab copy, token swatches, and component coverage.
- Updated design-system and white-theme smoke assertions for the current token
  contract.
- Aligned LLM Chat fallback styling with the new accent and neutral surface
  tokens because white-theme coverage includes the plugin panel.
- Verified with:
  - `npm run typecheck`
  - `npm run test:renderer-components`
  - `npm run smoke:design-system-ui`
  - `npm run smoke:white-theme-ui`
  - `npm run smoke:llm-chat-ui`
  - `node --test test/ui-harness-artifacts.test.mjs`
  - `git diff --check`

2026-06-17: second slice completed.

- Polished app shell navigation states for sidebar history, section controls,
  active nav rows, footer links, quick create, and workspace selector.
- Aligned tab strip active, hover, close, pop-out, add, and keyboard focus
  states with the shared accent path.
- Tokenized global search and Search & AI shell details, including radius,
  count/progress chips, active result focus, database badges, and primary tabs.
- Replaced startup loading theme-accent usage with the production accent token
  and tightened empty/loading surfaces.
- Stabilized the workspace-open UI smoke readiness wait to match the existing
  DOM-based editor readiness pattern.
- Verified with:
  - `npm run typecheck`
  - `npm run test:renderer-components`
  - `npm run smoke:sidebar-navigation-ui`
  - `npm run smoke:sidebar-settings-ui`
  - `npm run smoke:workspace-open-ui`
  - `npm run smoke:search-ui`
  - `npm run smoke:search-ai-ui`
  - `npm run smoke:white-theme-ui`
  - `npm run smoke:first-launch-ui`
  - `node --test test/ui-harness-artifacts.test.mjs`
  - `git diff --check`

2026-06-17: third slice completed.

- Polished page editor chrome for cover actions, page action focus states,
  backlinks, history status rows, secondary panels, and top-level/row
  properties.
- Aligned row property inputs, date pickers, checkboxes, source links,
  option-search chips, URL cells, entity reference chips, and cell focus rings
  with the shared accent path.
- Polished database toolbar, view tabs, toolbar icons, new-row menus, filter
  and sort popovers, table cell focus, embedded table borders, pagination, and
  load-more controls.
- Kept field-type badges neutral/accent-only so success/warning/danger remain
  reserved for status meaning.
- Stabilized the UI harness workspace reload helper for transient
  `ERR_NETWORK_CHANGED` reload failures.
- Verified with:
  - `npm run typecheck`
  - `npm run test:renderer-components`
  - `npm run smoke:page-secondary-ui`
  - `npm run smoke:row-page-property-visual-ui`
  - `npm run smoke:url-field-ui`
  - `npm run smoke:database-created-views-ui`
  - `npm run smoke:editor-scroll-ui`
  - `npm run smoke:editor-link-click-ui`
  - `npm run smoke:row-page-navigation-ui`
  - `npm run smoke:white-theme-ui`
  - `npm run smoke:embedded-view-ui`
  - `node --test test/ui-harness-artifacts.test.mjs`
  - `git diff --check`
- Supplemental broad `npm run smoke:editor-regression-ui` was attempted, but
  did not produce a product failure: runs failed at the harness layer with
  CDP startup timeout, transient `ERR_NETWORK_CHANGED`, or a closed Playwright
  context before completing viewport evidence. The focused editor, row-page,
  URL, embedded-view, and white-theme gates above passed.

2026-06-17: fourth slice completed.

- Polished management and settings surfaces for Settings Center, Plugin
  Manager, Advanced Search, GitHub Backup, Git Sync, and Notion Import/audit.
- Replaced remaining legacy `--focus` / `--muted` references and one-off colors
  in these surfaces with the shared accent, neutral, and status tokens.
- Kept selected/navigation affordances on the accent path while reserving
  success, warning, and danger colors for real status states.
- Tokenized shared modal, lightbox, gallery placeholder, option menu, sidebar
  folder, and database field-management details that were still using old
  hard-coded visual values.
- Stabilized the Notion import smoke helper by retrying the plugin-detail open
  event if the first dispatch does not surface the Notion Import settings page.
- Verified with:
  - `npm run typecheck`
  - `npm run test:renderer-components`
  - `npm run smoke:settings-center-ui`
  - `npm run smoke:plugin-manager-ui`
  - `npm run smoke:advanced-search-ui`
  - `npm run smoke:github-backup-ui`
  - `npm run smoke:notion-import-ui`
  - `npm run smoke:white-theme-ui`
  - `node --test test/ui-harness-artifacts.test.mjs`
- Note: the first `npm run smoke:notion-import-ui` attempt timed out while
  waiting for the Notion Import plugin detail page after dispatching the open
  event. A rerun passed, then the smoke helper was hardened and rerun
  successfully.

2026-06-17: fifth slice completed.

- Polished the builtin plugin ecosystem for LLM Chat, OpenAI/LLM provider
  settings, and the Kanban view provider.
- Removed old plugin-local fallback colors and tied plugin shells, actions,
  focus states, and empty states to the shared surface, ink, rule, accent,
  radius, and shadow tokens.
- Kept plugin-specific colors only where they carry data meaning, and aligned
  Kanban option colors with the default database field-provider palette.
- Added a direct Kanban provider DOM regression to
  `scripts/test-renderer-components.mjs` covering shell surface, group pill,
  card rules, option chips, and drag-over outline styling.
- Verified with:
  - `npm run typecheck`
  - `npm run test:renderer-components`
  - `npm run smoke:database-created-views-ui`
  - `npm run smoke:plugin-manager-ui`
  - `npm run smoke:llm-chat-ui`
  - `npm run smoke:settings-center-ui`
  - `npm run smoke:white-theme-ui`
  - `node --test test/ui-harness-artifacts.test.mjs`
  - `git diff --check`
- Note: the first `npm run smoke:plugin-manager-ui` rerun timed out while
  waiting for the fixture page title after opening the smoke workspace. A rerun
  passed without code changes, so no product failure was observed.

2026-06-18: sixth slice completed.

- Promoted the production visual gate to the release-critical UI surface set:
  design system, white theme, search, Search & AI, markdown preview, embedded
  views, database created views, row-page properties, page secondary panels,
  Notion import, settings center, plugin manager, LLM Chat, and Advanced Search.
- Standardized production gate viewport coverage on desktop, compact, and wide
  `1728x1100` evidence, while preserving suite-specific extra coverage such as
  page-secondary laptop screenshots.
- Added production gate checks for required suite coverage, required viewport
  coverage, screenshot byte evidence, console errors, artifact detail text,
  reproduce commands, horizontal overflow, and overlapping created-view tabs.
- Linked the production visual gate into the UI suite artifact index and
  release-test flow so release candidates carry both the suite index and gate
  contract.
- Hardened artifact summaries so release evidence retains critical visual
  details: search screenshot metadata, database active/visible tabs, and
  page-secondary backlinks/TOC counts.
- Production artifacts:
  - `artifacts/ui-smoke/ui-suite-2026-06-18T02-01-11-535Z/ui-suite-artifacts.json`
  - `artifacts/ui-smoke/ui-suite-2026-06-18T02-01-11-535Z/ui-suite-artifacts.md`
  - `artifacts/ui-smoke/ui-suite-2026-06-18T02-01-11-535Z/production-visual-gate/production-visual-gate.json`
- Verified with:
  - `node --test test/ui-harness-artifacts.test.mjs`
  - `npm run test:production-visual`
  - `node --test test/test-release.test.mjs`
  - `npm run typecheck`
  - `git diff --check`

## Remaining slices

None. The production visual style rollout is complete; future visual work should
be tracked as separate hardening or feature tasks.

## Acceptance criteria

- The visual style contract is documented and specific enough for future UI
  work.
- Core tokens are centralized and used by app shell, primitives, and high-traffic
  surfaces.
- Primary actions, focus rings, links, and active states use the same accent
  path.
- Success/warning/error colors are limited to status meaning.
- The design system lab demonstrates the current visual language.
- Renderer component and UI smoke tests assert the current token contract.
- The production rollout runs successfully or records explicit blockers with
  reproduce commands.

## Open questions

- Should the accent remain muted indigo long term, or should it eventually
  align with a configurable icon/theme accent?
- Should users eventually be able to choose visual themes, or should production
  continue shipping one fixed workbench theme?
