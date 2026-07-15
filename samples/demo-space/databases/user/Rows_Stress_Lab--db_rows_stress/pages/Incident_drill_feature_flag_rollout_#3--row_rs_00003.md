# Incident drill: feature flag rollout #3

*应急演练: 功能开关灰度 #3*

## Metadata

| Field | Value |
|-------|-------|
| Kind | `Bug` |
| Severity | `Low` |
| Topic | `Auth` |
| Source channel | `Support ticket` |
| Occurred at | `2026-05-16` |

## Triage

Owner ack'd; no action required this cycle.

## Repro

```bash
curl -i https://api.lotion.local/v1/incidents/row_rs_00003
```

```json
{
  "id": "row_rs_00003",
  "severity": "Low",
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
url: https://en.wikipedia.org/wiki/Auth
height: 360
title: Wikipedia · Auth
```
