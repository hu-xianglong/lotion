# Investigation: schema migration delay #7

*排查记录: 迁移延期 #7*

## Metadata

| Field | Value |
|-------|-------|
| Kind | `Email` |
| Severity | `Low` |
| Topic | `Mobile` |
| Source channel | `Customer email` |
| Occurred at | `2026-05-15` |

## Triage

Marked as automated rollup; the underlying batch retried successfully on its own. Keep the link for the runbook so we have an example.

## Repro

```bash
curl -i https://api.lotion.local/v1/incidents/row_rs_00007
```

```json
{
  "id": "row_rs_00007",
  "severity": "Low",
  "resolved": false
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
url: https://en.wikipedia.org/wiki/Mobile
height: 360
title: Wikipedia · Mobile
```
