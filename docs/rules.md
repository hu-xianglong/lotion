# Coding rules

Conventions to keep across the codebase. When you find yourself reaching
for a shortcut that violates one of these, stop and rewrite — the
shortcuts always come back.

## Do not design for backward compatibility by default

For feature work, data model changes, import behavior, view settings,
plugin APIs, and workspace file formats, prefer the clean current model
over compatibility shims. Do not add legacy branches, fallback behavior,
or migration scaffolding unless the user explicitly asks for it.

When existing local sample/demo data needs to change, update it to the
new model directly. The product is still moving quickly; carrying old
formats makes the code harder to reason about than the compatibility is
worth.

## Use a real parser for structured input, never regex

Markdown, HTML, JSON, CSV, URL, etc. all have established libraries.
Regex on these formats works *until* it doesn't:

- HTML link / image attribute extraction → use `node-html-parser`
  (already a dependency).
- Markdown link rewriting / heading detection → use a markdown AST
  parser (`markdown-it` is already vendored for our renderer; add as
  needed in main).
- CSV parsing → use the existing CSV helper. Application code should never
  hand-roll `split(",")`; a centralized helper may use a no-quote fast path
  only after pre-scanning for quoted cells and preserving the quoted fallback.
- URL manipulation → use `URL` / `URLSearchParams`.
- Path manipulation → use `path` module helpers (`join`, `resolve`,
  `relative`).

The Notion HTML importer triggered this rule when an attachment whose
filename contained `(1)` shipped as `\(1\)` in the markdown — turndown
escaped the parens but the rewriter's
`\(([^)]+)\)` regex stopped at the first unescaped `)`, truncating the
URL and missing the file. The right fix is to do the rewriting at the
HTML level (where node-html-parser walks `<a>` and `<img>` reliably),
not on the markdown output where escaping rules vary by emitter.

Regex on **un-structured** strings (single-line patterns, log lines,
content sniffing) is fine. The rule is about *parsing* structured
formats.
