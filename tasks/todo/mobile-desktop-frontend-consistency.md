# Mobile Desktop Frontend Consistency

Status: needs discussion

## Goal

Define how Lotion should keep the desktop and future mobile clients visually
and behaviorally consistent without forcing mobile to be a tiny desktop UI.

## Product Position

The goal is not exact pixel equality across phone and desktop. The goal is:

- Same visual language: tokens, typography scale, colors, icons, block styling,
  selection states, and density rules.
- Same content model: pages, blocks, databases, rows, backlinks, attachments,
  and sync behavior should mean the same thing on every client.
- Platform-appropriate interaction: desktop can use hover, right click, slash
  menus, popovers, and wide sidebars; mobile should use long press, bottom
  sheets, keyboard accessory bars, and stack navigation.

## Feasibility

It is possible to make the mobile and desktop experience feel like the same
product if the UI is built from shared contracts:

- Shared design tokens as the source of truth.
- Shared component contracts for Button, Menu, Popover, Sheet, Toolbar, Block,
  Editor, Database view, Backlinks, Settings, and Search.
- Shared interaction contracts for editor behavior such as selection visibility,
  toggle rendering, hidden markdown source, image previews, callout formatting,
  slash commands, and inline formatting.
- Shared fixture pages and visual regression tests across desktop, tablet, and
  mobile viewports.

Exact same layout is possible only if the mobile app is a responsive web shell,
but that usually produces weaker mobile ergonomics. A better target is visual
and semantic consistency with native mobile interaction patterns.

## Design Rules

- Tokens must drive every durable visual decision: color, spacing, radius,
  typography, shadow, border, and motion.
- Components must expose semantic variants, not one-off CSS. Example:
  `Button variant=ghost size=icon`, `Menu density=compact`, `Block state=selected`.
- Desktop popovers need mobile equivalents before a feature is considered
  portable. Example: slash menu becomes a bottom command sheet on mobile.
- Hover-only controls must have touch equivalents.
- Selection and editing behavior must be specified as contracts, not only CSS.
- Mobile layouts should preserve content meaning, not desktop geometry.

## Test Plan

- Add fixture pages that cover editor blocks, databases, backlinks, attachments,
  callouts, toggles, highlights, slash commands, and search.
- Run visual snapshots for desktop, tablet, and mobile viewports from the same
  fixtures.
- Add interaction smoke tests for platform-specific equivalents:
  desktop popover vs mobile sheet, hover toolbar vs keyboard accessory toolbar,
  sidebar navigation vs stacked navigation.
- Add contract tests for shared tokens and component variant coverage.

## Open Decisions

- Whether mobile should be a responsive web app, React Native app, or native
  Swift/Kotlin clients.
- Whether the first mobile target is read-only, capture-first, or full editor.
- Whether the editor core should be shared at the markdown/model layer only or
  also share rendering code.
- How much offline and sync behavior must ship in the first mobile version.

## Required Gates

- Design token export smoke.
- Component contract renderer tests.
- Desktop/tablet/mobile visual regression snapshots.
- Editor interaction smoke for selection, highlight, toggle, callout, and image
  source hiding.
