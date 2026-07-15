# Pager event: queue backlog growth #10

*值班事件: 队列积压增长 #10*

## Metadata

| Field | Value |
|-------|-------|
| Kind | `Note` |
| Severity | `High` |
| Topic | `Search` |
| Source channel | `Status page` |
| Occurred at | `2026-05-14` |

## Triage

Owner ack'd; no action required this cycle.

## Repro

```bash
curl -i https://api.lotion.local/v1/incidents/row_rs_00010
```

```json
{
  "id": "row_rs_00010",
  "severity": "High",
  "resolved": true
}
```

## Background reading

- [Internal runbook](https://wiki.internal/runbooks/note)
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
