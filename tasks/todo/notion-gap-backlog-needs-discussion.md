# Notion Gap Backlog

Status: todo

Decision state: needs discussion

## Why

Lotion has a growing amount of real infrastructure, but the everyday product
experience is still far from Notion. This backlog captures the main gap areas
from the current brainstorm without treating every item as committed scope.

Use this file as a discussion queue. Move individual items into their own task
files only after the product direction is agreed.

## Priority Candidates

These are the strongest near-term candidates because they improve the daily
interaction model rather than only adding backend capability.

Completed or substantially covered by `tasks/QUEUE.md`:

- Page embedded view picker and settings.
- Page hierarchy and sidebar tree.
- CodeMirror live preview writing surface.
- Database row page polish and database view management.
- Slash menu and insert blocks.
- Notion import hierarchy/audit visibility and source-link recovery.
- Backlinks API and page panel with click-through navigation, source context,
  excerpts, counts, source path/type disambiguation, property field context,
  readable property excerpts, property-row click-through, and duplicate source
  collapse.
- Notion import fidelity for source links, page icons/covers, option colors,
  person fields, underline/strikethrough/link preview, Indify/media previews,
  toggle/callout/equation blocks, and color/highlight rendering.

Remaining high-value priority candidates:

1. Command palette / quick switcher.
   - Unified Cmd-K style surface for pages, databases, row pages, commands,
     and eventually plugin commands.
   - Decision: this must support both navigation and command execution.
   - Split task: `tasks/todo/unified-command-palette-navigation-and-actions.md`.

2. Search / AI Q&A.
   - Advanced Search is the local semantic retrieval foundation.
   - LLM Chat is the assistant UI and safe-write foundation.
   - Decision: this is a high-priority Notion-parity surface with cited
     answers, database-property awareness, and later page-history awareness.
   - Split task: `tasks/todo/ai-qa-agent-search-and-history.md`.

3. Git history and restore.
   - Diff viewer, restore previous version, conflict handling, and status per
     page.
   - Decision: this is core page experience plus Git/backup settings, not a
     settings-only workflow.
   - Split task: `tasks/todo/github-backup-page-history-redesign.md`.

4. Keyboard shortcut settings.
   - Central registry, discoverable shortcuts, user overrides, conflict
     detection, reset/disable, and shortcut labels in command palette/tooltips.
   - Decision: this is a high-priority keyboard-first product surface.
   - Split task: `tasks/todo/keyboard-shortcut-settings-and-registry.md`.

5. Tag pages and richer backlinks.
   - Backlinks now have a page panel for incoming page/row references with
     source context, excerpts, counts, source path/type disambiguation,
     property field context, readable property excerpts, property-row
     click-through, and duplicate source collapse.
   - Provide useful tag pages rather than only tag values in databases.
   - Needs discussion: whether richer backlinks/tag pages are core navigation
     or later knowledge-management polish.

6. Gallery/calendar polish.
   - Better view-specific settings.
   - Better cards/date controls and empty-state handling.
   - Needs discussion: which Notion view controls matter for daily use.

7. Plugin platform v0.2.
   - Permissions, external loader, enable/disable/reload, and richer settings.
   - Needs discussion: exact permission model and safety boundaries.

## Discussion Buckets

### Page Experience

- Real page hierarchy.
- Page title area polish: icon, cover, properties, favorite, more actions.
- Child-page creation.
- Wikilink autocomplete and richer backlinks.
- Block-level hover handles, delete, move, copy link.

Deferred for now:

- Block-level interaction and a full block editor are not near-term scope.
  Continue improving the Markdown-backed live preview editor, slash commands,
  paste behavior, and keyboard-first workflows instead.

Needs discussion:

- Whether tag pages and richer backlink workflows are core MVP or later
  knowledge-management polish.

### Embedded Views

- View picker.
- Embedded-view header.
- Open / Refresh / Settings actions.
- Inline view switching inside a page.
- Create linked view from a page.

Needs discussion:

- Whether embedded views should only reference saved views, or eventually allow
  per-embed overrides.

### Databases

- View duplicate, rename, delete, and set default.
- Better field settings panel.
- Relation and rollup follow-up polish.
- Database row templates.
- Better Kanban card display and column controls.
- More polished calendar and gallery views.

Already covered:

- Relation/rollup first pass is done: schema metadata, relation cell rendering,
  relation settings, target database picker, rollup schema, read computation,
  relation/target field pickers, validation, and benchmark coverage.

Remaining possible follow-ups:

- Relation cell editing with search/picker UX.
- Rollup display formatting polish.
- More advanced relation/rollup behavior only if product direction calls for
  heavier Notion parity.

### Editor And Writing

- Default live preview.
- Inline attachments.
- Toggle, callout, quote, code, math.
- Selection toolbar.
- Paste handling for URL, images, Markdown tables, and Notion content.

Deferred for now:

- Do not pursue a full block editor or block-level manipulation model yet.

Needs discussion:

- How much visible Markdown should remain in normal editing.
- Whether selection toolbar is necessary or if slash/keyboard shortcuts are
  enough.

### Navigation And Search

- Command palette.
- Keyboard shortcut settings and discoverability.
- Recent/favorites improvements.
- Richer backlinks panel.
- Tag pages.
- Search result preview and jump-to-hit.
- Search / AI Q&A with cited answers.

Decisions:

- Semantic/vector search direction is now split into
  `tasks/todo/advanced-search-lancedb-qwen3-local-embedding.md`; keep this
  bucket focused on command palette ergonomics and search result preview/jump
  behavior.
- AI Q&A is high priority and split into
  `tasks/todo/ai-qa-agent-search-and-history.md`.
- Keyboard shortcut settings are high priority and split into
  `tasks/todo/keyboard-shortcut-settings-and-registry.md`.

### Settings And Preferences

- Keyboard shortcuts registry and settings UI.
- Shortcut conflict detection.
- Shortcut labels in command palette rows and toolbar tooltips.
- Local user preference persistence for shortcut overrides.

Decision:

- Shortcut settings are a first-class product surface for keyboard-first users,
  not just implementation cleanup.

### Git And Local-First

- Last backup status per page.
- Page diff viewer.
- Workspace history.
- Restore previous version.
- Push/pull UI.
- Conflict resolution.
- Large attachment strategy.

Decision:

- Git history and restore are core page experience surfaces, backed by local Git
  first and remote Git only when configured. Continue through
  `tasks/todo/github-backup-page-history-redesign.md`.

### LLM-First

- Ask current page/database.
- Selected-text rewrite/summarize/translate.
- AI field provider.
- Previewable LLM diffs.
- "Turn this text into a task database" style transformations.
- Source-cited Q&A over workspace content, database properties, and local page
  history.

Decisions:

- Embeddings for local semantic search should use Qwen3 through Ollama first.
- LLM writes must stay previewable/confirmable before apply.
- Agent/Q&A depth is now split into
  `tasks/todo/ai-qa-agent-search-and-history.md`.

### Plugin Platform

- Plugin Manager v0.2: permissions, config schema, capabilities.
- External plugin loader.
- Disable/reload plugin.
- Permission UI.
- Plugin settings UI.

Needs discussion:

- Do not build the loader until the built-in provider dogfood has stabilized
  enough extension points.
