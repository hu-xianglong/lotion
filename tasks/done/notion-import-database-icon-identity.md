# Task 715: Notion import database icon identity

Status: done

Verification status: verified

Priority: P0

Source: production workspace database icons reported missing on 2026-08-05

## Problem

The production workspace contained 1,185 imported Notion databases with an
empty `schema.icon`. Notion places a full-page database's HTML/Markdown wrapper
inside the database's row folder and gives that wrapper the same 32-character
identity as the CSV. The importer classified every document directly inside
that folder as a row before checking whether its identity was the database
identity. Database metadata therefore bypassed the icon and cover extraction
path.

The existing repair script scanned any HTML page containing a CSV link. That
could copy a parent-page or row-page icon onto an embedded database. Historical
commit `68a54a1` did preserve icons from standalone database wrappers, but its
fixture did not cover wrappers stored inside the database row directory. The
later logical row-folder classification in `53da5c3` therefore bypassed that
path for real exports.

## Acceptance

- HTML and Markdown documents whose Notion identity exactly matches a known
  database are classified as database metadata, never as rows or standalone
  pages.
- Emoji, local image, and remote image database icons are preserved in the
  imported database schema.
- Database covers and offsets continue to import from the same metadata source.
- A normal page containing an embedded or linked database cannot donate its own
  icon to that database.
- Existing imported workspaces can be repaired from preserved original HTML
  using exact database identity or exact link-target icon evidence only.
- Repair is dry-run first, writes backups, uses atomic schema writes, and does
  not alter non-icon schema data.
- The production workspace is repaired and the installed app visibly renders
  the recovered database icons.

## Required Gates

- focused Notion import regression tests
- focused database icon repair tests
- production workspace dry-run and post-apply verification
- `npm run typecheck`
- `npm run test:fixtures`
- `npm run test:latency`
- `npm run test:fast`
- `npm run build`
- `npm run test:task-docs`
- `git diff --check`

## Verification

- Reproduced the production failure: 1,185 imported database schemas lacked an
  icon because exact-ID wrappers inside row directories were indexed as rows.
- Audited local history. `68a54a1` added database-wrapper icon transfer, while
  `53da5c3` later introduced the row-folder classification path that bypassed
  it; the old fixture never exercised that directory layout.
- Added import regressions for local image, emoji, and remote database icons,
  a wrapper located inside its row directory, exact link-target fallback, and
  conflicting evidence that must remain unresolved.
- Added repair regressions covering dry-run behavior, local attachment copy,
  backups, atomic schema replacement, non-icon digest preservation, conflicts,
  decoy parent pages, and post-apply idempotence.
- The production dry-run scanned 41,446 preserved HTML files and found 10 safe
  repairs. Apply mode backed up every schema and repaired `flomo`, `People`,
  `公开文章`, `待办事项`, `想做清单`, `成功日记`, `收集箱`, `每日文章`, `每日计划`,
  and `活动&社群`. The report and backups are in
  `/Users/xianglonghu/Downloads/同步空间/Lotion/reports/database-icon-repair-2026-08-05T15-27-29-818Z/`.
- A post-apply dry-run reported 1,175 schemas without source-backed icons and
  zero remaining recoverable icons. Collection-only pages with unrelated
  titles were inspected and rejected because their header icon belongs to the
  containing page or row, not necessarily to the embedded database.
- `npm run test:notion-database-icons --workspaces=false` passed.
- `npm run test:fast --workspaces=false` passed outside the restricted
  filesystem sandbox: 79/79 core tests plus importer, repair, renderer,
  workspace, fixture, hierarchy, link, and latency gates.
- `npm run build --workspaces=false` passed with the existing Node-version and
  large-chunk warnings; Vite transformed 2,342 modules.
- The arm64 app was packaged, ad-hoc signed, signature-verified, installed at
  `/Applications/Lotion.app`, and matched the packaged `app.asar` checksum.
  Computer Use opened the production workspace and visually confirmed the
  restored `成功日记` icon in the sidebar, tab, and database header with all
  1,702 rows loaded. Startup diagnostics reported 154 ms total.
