# Telemetry blip: mobile crash cluster #9

*遥测异常: 移动端崩溃聚簇 #9*

## Metadata

| Field | Value |
|-------|-------|
| Kind | `Bug` |
| Severity | `Info` |
| Topic | `Analytics` |
| Source channel | `Pager duty` |
| Occurred at | `2026-05-14` |

## Triage

Short note.

## Repro

```bash
curl -i https://api.lotion.local/v1/incidents/row_rs_00009
```

```json
{
  "id": "row_rs_00009",
  "severity": "Info",
  "resolved": false
}
```

## Background reading

- [Internal runbook](https://wiki.internal/runbooks/bug)
- [Postmortem template](https://en.wikipedia.org/wiki/Postmortem_documentation)

## Cross-references

```lotion-view
database: db_views_stress
view: view_critical
```

## Web context

```lotion-iframe
url: https://en.wikipedia.org/wiki/Analytics
height: 360
title: Wikipedia · Analytics
```
