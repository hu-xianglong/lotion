# Systematic Import Audit And Performance Lab

Status: todo

Decision state: accepted, staged rollout

## Why

Manual Notion import testing is too slow and too easy to miss regressions. We
need repeatable checks that compare the source export, the imported workspace,
the UI rendering, and editing/scrolling performance.

## Rollout

1. Make Notion import audit solid and visible in the UI.
   - Shared audit engine used by both CLI and the Notion Import plugin page.
   - Compare source CSV databases with imported Lotion databases.
   - Compare source HTML pages with imported row/page bodies when requested.
   - Detect missing databases, row loss, cell loss, missing source links,
     missing/empty body files, and suspicious value changes.
   - Show summary, errors, and warnings inside the plugin page.

2. Add focused real-data regression cases.
   - Target known fragile pages/databases by source hash or filename.
   - Cover nested databases, nested pages, duplicate Notion hashes,
     Untitled databases, empty rows/pages, attachments, page links, URL fields,
     enum/select fields, and original HTML/CSV references.
   - Preserve original Notion export folder structure for copied source
     HTML/CSV references instead of flattening everything into
     `attachments/web` and `attachments/data`; audit should verify those
     source links still resolve after import.

3. Add full large-dataset regression mode.
   - Reimport a large export into a scratch workspace.
   - Run the audit against the full source.
   - Store a concise report so regressions can be reviewed without clicking
     through Lotion manually.

4. Add UI regression coverage.
   - Electron smoke tests for import plugin page, audit panel, search, sidebar,
     row-page navigation, embedded databases, attachments, and source links.
   - Screenshot checks for representative imported pages versus known-good
     baselines.
   - Detailed task: `tasks/todo/ui-regression-lab-and-renderer-coverage.md`.

5. Add a performance lab.
   - Synthetic huge page with markdown, images, iframes, and many embedded
     databases.
   - Capture load, scroll, edit latency, DOM size, render counts, and long
     tasks before optimizing.
   - Maintain score thresholds so future changes do not silently reintroduce
     jank.

## Current Focus

Build step 1 first. The audit should be usable from the command line and from
the Notion Import plugin page before expanding into broader regression suites.
