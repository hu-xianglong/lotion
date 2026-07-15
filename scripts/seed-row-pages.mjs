// Seed Markdown bodies for a curated subset of rows across the demo
// databases so the file tree, page editor, and properties panel all have
// real content to show.
//
// Idempotent — re-running rewrites the same files and CSV cells.
// Run with:
//
//     node scripts/seed-row-pages.mjs

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const spaceRoot = join(repoRoot, "samples", "demo-space");

// ── shared helpers ─────────────────────────────────────────────────────────

function slugifyTitle(value, maxLength = 72) {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/[\\/:*?"<>|\x00]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLength)
    .replace(/_+$/g, "");
  return cleaned || "untitled";
}

function pageFileName(rowId, title) {
  const slug = slugifyTitle(title, 72);
  return slug && slug !== rowId ? `${slug}--${rowId}.md` : `${rowId}.md`;
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    const next = content[i + 1];
    if (ch === "\"" && inQuotes && next === "\"") { cell += "\""; i += 1; }
    else if (ch === "\"") inQuotes = !inQuotes;
    else if (ch === "," && !inQuotes) { row.push(cell); cell = ""; }
    else if (ch === "\n" && !inQuotes) { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell !== "" || row.length > 0) { row.push(cell); rows.push(row); }
  return rows;
}

function serializeCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function rowsToCsv(headers, rows) {
  const lines = [headers.map(serializeCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => serializeCell(row[h])).join(","));
  }
  return lines.join("\n") + "\n";
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

// ── seed plans ─────────────────────────────────────────────────────────────

// Returns a markdown body string for a given row. Each seed plan attaches a
// template — keep them short and varied so the demo shows a range of
// formatting, embeds, and Chinese / English mixes.

const PLANS = [
  {
    id: "db_tasks",
    rows: "all",
    body: (row) =>
`# ${row.title}

> ${row.status} · ${row.priority} priority · due ${row.due_date}

## Context

Working notes for **${row.title}**. ${prettyTags(row.tags)} ${row.effort ? `Estimated effort: ${row.effort} pts.` : ""}

## Plan

1. Sketch the approach in a comment thread.
2. Write the smallest possible reproduction.
3. Land a first PR that's easy to revert.

## Next steps

- [ ] Outline the approach.
- [ ] Pair on the riskiest change.
- [ ] Land a small first PR.

## Reference snippet

\`\`\`ts
function createId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return \`\${prefix}_\${random}\`;
}
\`\`\`

## Related reading

See [Designing Data-Intensive Applications](https://dataintensive.net) for
the broader background, and the project's
[code-design.md](docs/code-design.md) for our take.

![Hero illustration](https://picsum.photos/seed/${slugifyTitle(row.title)}/640/240)

## Dependencies (live table)

\`\`\`lotion-view
database: db_reading
view: view_default
\`\`\`
`
  },
  {
    id: "db_reading",
    rows: "all",
    body: (row) =>
`# ${row.title}

*by ${row.author || "unknown"}* · status: ${row.status}

![Cover](https://picsum.photos/seed/${slugifyTitle(row.title)}-cover/240/360)

## Why I picked it up

Short note on what drew me to this one. Replace with whatever the
real reason is. Worth flagging the [author's bio](https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(row.author || row.title)}) too.

## Highlights

| Page | Idea | Stars |
|------|------|:----:|
| p. 23 | The argument for redundancy | ★★★ |
| p. 71 | A counter-example I didn't see coming | ★★★★ |
| p. 142 | Quotable opener of chapter 8 | ★★ |

## Notes from chapter 3

> "The pragmatic engineer optimizes for **predictability**, not for cleverness."

This squares with how we picked CodeMirror over a fancier WYSIWYG —
predictable file format outweighed editing flair.

## To act on

- [ ] Re-read chapter 3 with a notebook open.
- [ ] Cross-reference the author's [blog](https://example.com/blog) for follow-ups.

## Next action

> ${row.next_action || "Keep reading."}
`
  },
  {
    id: "db_field_lab",
    rows: "all",
    body: (row) =>
`# ${row.title}

Lab note exploring the **${row.title}** field type.

The point of this row is to make sure the cell editor and the
properties panel both behave on this type.

- [ ] Try editing the cell inline from the table.
- [ ] Try editing the same value from the row page's properties panel.
- [ ] Make sure both surfaces stay in sync.
`
  },
  {
    id: "db_view_lab",
    rows: "all",
    body: (row) =>
`# ${row.title}

View-lab scratch space. Each row here represents a configuration to
verify against the table view: filter, sort, visible-field changes.

Reasonable thing to do: open one of the other lab databases here and
embed it, then check that filters from this row's settings propagate
correctly.
`
  },
  {
    id: "db_formula_lab",
    rows: "all",
    body: (row) =>
`# ${row.title}

Formula reference row. The point is to walk through how the formula
column reacts when its dependencies change.

\`\`\`text
title:    ${row.title}
status:   ${row.status}
priority: ${row.priority}
\`\`\`

Try toggling \`status\` or \`priority\` from the properties panel
and watch the computed \`score\` (or whatever the formula field is
named) update on every render.
`
  },
  {
    id: "db_views_stress",
    rows: 10,
    body: (row) =>
`# ${row.title}

${row.chinese_title ? `> 中文标题: **${row.chinese_title}**\n` : ""}
**Status:** ${row.status} · **Priority:** ${row.priority} · **Team:** ${row.team}

## Owner notes

${row.owner_notes_zh || "Notes pending."}

## Plan

- [ ] Reproduce the symptom locally.
- [ ] Identify the smallest fix.
- [ ] Add a regression test.

${row.notes ? `## Background\n\n${row.notes}\n` : ""}`
  },
  {
    id: "db_rows_stress",
    rows: 10,
    body: (row) =>
`# ${row.title}

${row.chinese_title ? `*${row.chinese_title}*\n` : ""}
## Metadata

| Field | Value |
|-------|-------|
| Kind | \`${row.kind}\` |
| Severity | \`${row.severity}\` |
| Topic | \`${row.topic}\` |
| Source channel | \`${row.source_channel}\` |
| Occurred at | \`${row.occurred_at}\` |

## Triage

${row.note || row.chinese_note || "No notes yet."}

## Repro

\`\`\`bash
curl -i https://api.lotion.local/v1/incidents/${row.id}
\`\`\`

\`\`\`json
{
  "id": "${row.id}",
  "severity": "${row.severity}",
  "resolved": ${row.resolved || false}
}
\`\`\`

## Background reading

- [Internal runbook](https://wiki.internal/runbooks/${row.kind?.toLowerCase?.() || "general"})
- [Postmortem template](https://en.wikipedia.org/wiki/Postmortem_documentation)

## Cross-references

\`\`\`lotion-view
database: db_views_stress
view: view_critical
\`\`\`

## Web context

\`\`\`lotion-iframe
url: https://en.wikipedia.org/wiki/${encodeURIComponent(row.topic || "Software_bug")}
height: 360
title: Wikipedia · ${row.topic || "Software_bug"}
\`\`\`
`
  },
  {
    id: "db_rows_2k",
    rows: 10,
    body: (row) =>
`# ${row.title}

Synthesized 2K-row stress entry. Use this page to test:

1. Switching between **Edit / 对照 / 预览** modes on a row page.
2. Editing the properties panel above and watching the table reflect it.
3. Embedding a view into the body and confirming it virtualizes.

\`\`\`lotion-view
database: db_rows_2k
view: view_high
\`\`\`
`
  }
];

function prettyTags(value) {
  if (!value) return "";
  const tags = String(value).split(";").map((tag) => tag.trim()).filter(Boolean);
  if (tags.length === 0) return "";
  return `Tags: ${tags.map((tag) => `\`${tag}\``).join(", ")}.`;
}

// ── runner ─────────────────────────────────────────────────────────────────

async function seedDatabase(plan) {
  const dir = databasePath(plan.id);
  const schema = await readJson(join(dir, "schema.json"));
  const csvPath = join(dir, "data.csv");
  const csvRaw = await readFile(csvPath, "utf8");
  const grid = parseCsv(csvRaw.trim());
  const headers = grid[0];
  const records = grid.slice(1).map((cells) =>
    Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]))
  );

  const pageFileIndex = headers.indexOf("page_file");
  if (pageFileIndex === -1) {
    throw new Error(`${plan.id} has no page_file column`);
  }

  const sliceCount = plan.rows === "all" ? records.length : Math.min(plan.rows, records.length);
  const rowPagesDir = join(dir, "pages");
  await mkdir(rowPagesDir, { recursive: true });

  const usedNames = new Set();
  let seeded = 0;

  for (let i = 0; i < sliceCount; i += 1) {
    const record = records[i];
    const title = String(record.title ?? "");
    const base = pageFileName(record.id, title);
    let fileName = base;
    let attempt = 1;
    while (usedNames.has(fileName)) {
      fileName = `${base.replace(/\.md$/i, "")}_${attempt}.md`;
      attempt += 1;
    }
    usedNames.add(fileName);

    const body = plan.body(record);
    await writeFile(join(rowPagesDir, fileName), body);
    record.page_file = fileName;
    seeded += 1;
  }

  const csvOut = rowsToCsv(headers, records);
  await writeFile(csvPath, csvOut);
  console.log(`Seeded ${plan.id}: ${seeded} row page(s)`);
}

function databasePath(id) {
  const base = join(spaceRoot, "databases", "user");
  if (existsSync(base)) {
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === id || entry.name.endsWith(`--${id}`)) return join(base, entry.name);
    }
  }
  return join(base, id);
}

for (const plan of PLANS) {
  await seedDatabase(plan);
}
