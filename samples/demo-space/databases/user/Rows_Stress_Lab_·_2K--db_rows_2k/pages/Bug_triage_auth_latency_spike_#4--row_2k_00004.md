# Bug triage: auth latency spike #4

Synthesized 2K-row stress entry. Use this page to test:

1. Switching between **Edit / 对照 / 预览** modes on a row page.
2. Editing the properties panel above and watching the table reflect it.
3. Embedding a view into the body and confirming it virtualizes.

```lotion-view
database: db_rows_2k
view: view_high
```
