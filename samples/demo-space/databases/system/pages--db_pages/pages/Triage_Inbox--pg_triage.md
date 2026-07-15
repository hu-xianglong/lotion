# Triage Inbox

A mid-sized stress page. Each embed pulls a filtered slice of the 2K-row
dataset, so virtualization carries real weight here — only the visible
rows are in the DOM, but scrolling inside the embed still walks the full
list.

## Bugs (db_rows_2k)

```lotion-view
database: db_rows_2k
view: view_bugs
```

## Critical severity (db_rows_2k)

```lotion-view
database: db_rows_2k
view: view_critical
```

## Customer emails (db_rows_2k)

```lotion-view
database: db_rows_2k
view: view_emails
```
