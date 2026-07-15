# Page Open Latency Benchmark

Status: done

## Why

Opening a page should stay fast even for large markdown bodies. The performance
lab needs a backend page-open benchmark before broader UI performance cases.

## Scope

- Add a benchmark that uses the real WorkspaceService/PageService.
- Measure cold-cache and warm-cache `pages.get` calls.
- Add a check mode with conservative thresholds.
- Add package scripts for manual benchmark and regression gate.

## Gates

- `npm run test:page-open-latency`
- `git diff --check`
