# Doc update: analytics gap #6

*文档更新: 数据上报缺口 #6*

## Metadata

| Field | Value |
|-------|-------|
| Kind | `Doc` |
| Severity | `High` |
| Topic | `Search` |
| Source channel | `Telemetry alert` |
| Occurred at | `2026-05-15` |

## Triage

Customer is unblocked but reports a similar symptom intermittently. Tagging for the next cross-team review.

## Repro

```bash
curl -i https://api.lotion.local/v1/incidents/row_rs_00006
```

```json
{
  "id": "row_rs_00006",
  "severity": "High",
  "resolved": false
}
```

## Background reading

- [Internal runbook](https://wiki.internal/runbooks/doc)
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
