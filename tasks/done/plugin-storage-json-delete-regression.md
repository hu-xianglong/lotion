# Plugin Storage JSON And Delete Regression

Status: done

## Why

Plugin storage backs Advanced Search indexes, GitHub Backup mock remotes, and
LLM Chat JSONL history. JSONL append/read had coverage, but the service-level
JSON read/write path and delete behavior for matching `.json` and `.jsonl`
files needed direct coverage.

## Changes

- Added package-core coverage for `PluginStorageService.writeJson()` and
  `readJson()`.
- Asserted plugin ids and filenames are sanitized into `.lotion/plugins`.
- Asserted `delete()` removes both `.json` and `.jsonl` variants for the same
  logical plugin file.

## Tests

- `npm exec -- tsc -p tsconfig.main.json`
- `node --test test/package-core.test.mjs`
- `npm run typecheck`
- `git diff --check`

No UI test is applicable for this item because it only strengthens service
coverage for plugin storage semantics and does not change renderer behavior.
