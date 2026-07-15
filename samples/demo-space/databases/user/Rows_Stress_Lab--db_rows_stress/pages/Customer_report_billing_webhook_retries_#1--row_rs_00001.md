# Customer report: billing webhook retries #1

*客户反馈: 账单 Webhook 重试 #1*

## Metadata

| Field | Value |
|-------|-------|
| Kind | `Email` |
| Severity | `Low` |
| Topic | `Billing` |
| Source channel | `Customer email` |
| Occurred at | `2026-05-17` |

## Triage

No notes yet.

## Repro

```bash
curl -i https://api.lotion.local/v1/incidents/row_rs_00001
```

```json
{
  "id": "row_rs_00001",
  "severity": "Low",
  "resolved": true
}
```

## Background reading

- [Internal runbook](https://wiki.internal/runbooks/email)
- [Postmortem template](https://en.wikipedia.org/wiki/Postmortem_documentation)

## Cross-references

```lotion-view
database: db_views_stress
view: view_critical
```

## Web context

```lotion-iframe
url: https://en.wikipedia.org/wiki/Billing
height: 360
title: Wikipedia · Billing
```
