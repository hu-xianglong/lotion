# Engineering note: infra cost trend #2

*工程笔记: 基础设施成本上扬 #2*

## Metadata

| Field | Value |
|-------|-------|
| Kind | `Slack` |
| Severity | `Critical` |
| Topic | `Search` |
| Source channel | `Pager duty` |
| Occurred at | `2026-05-16` |

## Triage

Short note.

## Repro

```bash
curl -i https://api.lotion.local/v1/incidents/row_rs_00002
```

```json
{
  "id": "row_rs_00002",
  "severity": "Critical",
  "resolved": true
}
```

## Background reading

- [Internal runbook](https://wiki.internal/runbooks/slack)
- [Postmortem template](https://en.wikipedia.org/wiki/Postmortem_documentation)

## Cross-references

```lotion-view
database: db_views_stress
view: view_critical
```

## Web context

```lotion-iframe
url: https://en.wikipedia.org/wiki/Search
height: 360
title: Wikipedia · Search
```
