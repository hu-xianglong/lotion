# Bug triage: auth latency spike #4

*Bug 分诊: 登录延迟突增 #4*

## Metadata

| Field | Value |
|-------|-------|
| Kind | `Note` |
| Severity | `High` |
| Topic | `Search` |
| Source channel | `Support ticket` |
| Occurred at | `2026-05-16` |

## Triage

Worth a follow up with the owning team. Recheck after the next release branch is cut to confirm the regression is fully gone and that the dashboards reflect the recovered state.

## Repro

```bash
curl -i https://api.lotion.local/v1/incidents/row_rs_00004
```

```json
{
  "id": "row_rs_00004",
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
