# Frontend Design System

Lotion's UI should feel like a quiet local workbench: dense, white, readable,
keyboard-friendly, and built for repeated use. The unified style is neutral
surfaces, crisp rules, compact type, and one muted indigo accent for primary,
focus, link, and selected states. It should not look like a marketing page. New
user-facing UI should use the shared primitives and tokens below unless a task
records a specific reason to extend them.

## Product Principles

- Prefer document and database ergonomics over decorative layout.
- Keep information dense but scannable: labels, values, actions, and status
  should line up predictably.
- Separate workflow actions from configuration. Workflow surfaces show primary
  actions and live status; settings surfaces hold provider keys, field config,
  sync settings, and defaults.
- Use white/light surfaces as the default. Imported Notion colors, code blocks,
  callouts, warnings, and destructive states may introduce color, but ordinary
  app chrome should stay neutral.
- Use `--accent` as the only routine emphasis path: primary actions, active
  tabs/rows, keyboard focus, and links. Do not introduce pure black primary
  buttons or page-local focus colors.
- Use icons for compact repeated controls and text buttons for clear commands.
- Every user-facing state needs a visible empty, loading, error, warning,
  success, and disabled treatment where applicable.

## Tokens

Use existing CSS variables instead of one-off colors.

| Token | Role |
| --- | --- |
| `--paper` | Primary page, panel, modal, and table surface. |
| `--sand` | App shell, sidebar, tab strip, and muted chrome background. |
| `--vellum` | Hover rows, soft input backgrounds, and secondary panels. |
| `--kraft` | Selected rows, segmented active surface, and quiet active fills. |
| `--ink-1` | Primary text and high-emphasis icons. |
| `--ink-2` | Body text and active secondary controls. |
| `--ink-3` | Labels, metadata, descriptions. |
| `--ink-4` | Muted placeholders, disabled affordances. |
| `--rule` | Thin dividers and quiet borders. |
| `--rule-strong` | Input borders, high-contrast grid rules. |
| `--accent` | Focus rings, links, selected action emphasis. |
| `--accent-hover` / `--accent-soft` / `--accent-ring` | Hover, selected, and focus companions for `--accent`. |
| `--success`, `--warning`, `--danger` and `*-soft` | Status foreground and background pairs. |
| `--r-1` to `--r-4` | Radius scale. Cards and panels should stay at 8px or less unless an existing component requires otherwise. |
| `--shadow-1` | Small surface elevation only. Avoid stacked cards and decorative shadows. |

Status colors should be local to status primitives. Do not tint the whole
surface for routine state, and do not use status colors as primary action
colors.

## Shared Primitives

The current shared primitive classes are demonstrated in the Design System lab
management page:

- `lotion-ui-button`: default, primary, and ghost command buttons.
- `lotion-ui-icon-button`: compact icon-only actions with accessible labels.
- `lotion-ui-segmented`: local mode selection, not global navigation.
- `lotion-ui-field`, `lotion-ui-input-shell`, `lotion-ui-input`,
  `lotion-ui-select`, `lotion-ui-toggle`: form controls.
- `lotion-ui-panel`: one bounded workflow or settings group.
- `lotion-ui-result-item`: search, command palette, and picker rows.
- `lotion-ui-settings-row`: settings summaries and configuration rows.
- `lotion-ui-source-card`: imported source, citation, or attachment references.
- `lotion-ui-status-pill`: compact status/metadata labels.
- `lotion-ui-kbd`: keyboard hint badges.

Future primitives should follow the same naming and token use. Avoid local
classes that redefine button/input spacing unless the component is becoming a
new reusable primitive.

## Layout Rules

- Do not put cards inside cards. Page sections are unframed layouts or
  full-width bands; cards are for repeated items, tool panels, and dialogs.
- Keep page headings proportional to the surface. Management and settings pages
  should use compact headings, not oversized landing-page type.
- Define stable dimensions for toolbars, icon buttons, tables, status pills,
  tabs, and picker rows so hover/focus/content changes do not resize the UI.
- Compact layouts must wrap toolbars and convert multi-column grids to one
  column before horizontal overflow appears.
- Primary controls must remain visible and keyboard focusable on desktop and
  compact viewports.
- App shell chrome should read as one system: `--sand` for sidebar/tab strip,
  `--paper` for the editor canvas, and `--accent` only for the active trail.

## State Patterns

- Empty: short reason plus the next concrete action.
- Loading: preserve the final layout footprint where practical.
- Error: explain what failed, show retry/open-details when useful, and keep
  copied/debuggable text selectable.
- Warning: use a small status pill or inline notice, not a tinted page.
- Success: use compact status, timestamp, or done state. Avoid celebratory
  visual noise in productivity workflows.
- Destructive: separate destructive actions from primary actions and require a
  confirmation when data loss is possible.

## Testing Requirements

Frontend changes should include coded UI coverage when they affect visible
behavior or layout.

- Run `npm run test:renderer-components` when adding or changing shared
  primitives.
- Run `npm run smoke:design-system-ui` when changing design tokens, primitive
  CSS, or the Design System lab.
- UI smokes should cover desktop and compact viewports, assert no horizontal
  overflow, capture useful artifacts, check focus behavior, and avoid relying
  on fixed sleeps.
- Backend/service tests are required only when data, persistence, API, import,
  or provider behavior changes.

## Migration Guidance

New Search & AI, Settings, plugin, management, and import-review surfaces should
start from the primitives above. Existing surfaces can migrate opportunistically
when a task touches the area. A migration is complete only when the surface has
renderer coverage and a focused multi-viewport UI smoke or is included in the
shared UI regression suite.
