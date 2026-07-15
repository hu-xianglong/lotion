# Markdown Showcase

This page exists to exercise every Markdown surface area at once — the
editor's syntax highlighter, the preview renderer, and our Lotion-specific
embed blocks. If something's broken, it'll show up here first.

## Headings

# h1 — top level
## h2 — section
### h3 — subsection
#### h4 — finer

## Inline formatting

This paragraph mixes **bold**, *italic*, ***bold italic***, ~~strikethrough~~,
`inline code`, and a [link to the Lotion repo](https://github.com/hu-xianglong/lotion "Lotion source").

Autolinked URL: <https://example.com>.

中文段落:也要测试一下混排,比如 **加粗中文**、`代码`、还有 [带中文的链接](https://www.wikipedia.org)。

## Lists

Unordered:

- Apples
- Oranges
- Pears
  - Bartlett
  - Anjou

Ordered:

1. Wake up.
2. Drink water.
3. Open Lotion.
   1. Check today's tasks.
   2. Pick the top one.

Tasks:

- [x] Replace the textarea with a real editor.
- [ ] Add live-preview decorations.
- [ ] Persist Vim mode preference per workspace.

## Blockquote

> "Make it work, make it right, make it fast."
> — Kent Beck

Nested:

> Outer quote.
>
> > Inner quote.

## Code

Inline `Math.random().toString(36)` produces a base36 random string.

Plain fenced block:

```
just plain text in a code fence
two lines
```

TypeScript fenced block:

```ts
function createId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${random}`;
}
```

Bash fenced block:

```bash
npm install codemirror @codemirror/lang-markdown
```

## Table

| Field type | Editable inline | Renders as |
|------------|:---------------:|:-----------|
| text       | ✓               | input |
| number     | ✓               | numeric input |
| select     | ✓               | OptionDropdown |
| checkbox   | ✓               | checkbox |
| formula    | —               | computed value |
| page_file  | — (hidden)      | — |

## Horizontal rule

---

## Images

A landscape from picsum.photos (random seed, deterministic):

![Random landscape](https://picsum.photos/seed/lotion-1/640/360)

A second image at a different size:

![Tiny placeholder](https://picsum.photos/seed/lotion-2/200/200 "Hover title for the small image")

## Internal page links

Standard `[text](path)` markdown links pointing at workspace `.md`
files are intercepted on click and routed through the page navigator
(no preview pane / external browser). Paths are relative to the
workspace root (the directory `lotion.json` sits in).

- Top-level page: jump to [the home page](databases/system/pages--db_pages/pages/Home--pg_home.md).
- Another standalone page: open the [weekly review](databases/system/pages--db_pages/pages/Weekly_Review--pg_weekly_review.md).
- Row page inside a database: read the notes on
  [Add a formula field](databases/user/Tasks--db_tasks/pages/Add_a_formula_field--row_task_3.md).
- Book notes: [Designing Data-Intensive Applications](databases/user/Reading_List--db_reading/pages/Designing_Data-Intensive_Applications--row_book_1.md).
- Supporting document: read the local
  [code design note](docs/code-design.md) without leaving the workspace.
- External URL still works as a normal link:
  [the CommonMark spec](https://spec.commonmark.org/).

## Lotion-specific embeds

Database view embedded inline:

```lotion-view
database: db_tasks
view: view_open_high
```

Web page embedded inline:

```lotion-iframe
url: https://en.wikipedia.org/wiki/Markdown
height: 400
title: Wikipedia · Markdown
```

## Edge cases

- Empty list item:

-
- Item after empty.

- Line break within a paragraph: this sentence
  continues on the next line.

- Code in a list item:
  - first
  - `inline code here` works
  - third

- `Backticks in inline code: \`x\`` (escaped).

That's the lot.
