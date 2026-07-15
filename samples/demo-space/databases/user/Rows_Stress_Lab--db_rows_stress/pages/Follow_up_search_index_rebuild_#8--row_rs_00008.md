# Follow up: search index rebuild #8

*跟进事项: 搜索索引重建 #8*

## Metadata

| Field | Value |
|-------|-------|
| Kind | `Slack` |
| Severity | `Info` |
| Topic | `UI` |
| Source channel | `Pager duty` |
| Occurred at | `2026-05-14` |

## Triage

No notes yet.

## Repro

```bash
curl -i https://api.lotion.local/v1/incidents/row_rs_00008
```

```json
{
  "id": "row_rs_00008",
  "severity": "Info",
  "resolved": false
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
url: https://en.wikipedia.org/wiki/UI
height: 360
title: Wikipedia · UI
```
