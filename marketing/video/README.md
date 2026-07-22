# Lotion vs Notion: Core Workflow Video

Run `npm run marketing:video` to generate a 1920x1080 H.264 product video and poster.

The comparison is intentionally scoped to core workspace workflows, not full feature parity:

1. Pages and blocks
2. Databases and views
3. Search and connected pages
4. Moving a workspace
5. Product tradeoffs and ownership model

The video uses real Lotion screenshots and explicitly identifies areas where Notion remains ahead.

The live-operation shot list is documented in [`REALTIME_SCRIPT.zh-CN.md`](REALTIME_SCRIPT.zh-CN.md).

## Real-time comparison

Generate the real Electron interaction recording and compose it with the title,
full-screen chapter cards, tradeoff card, end card, and an original generated
ambient soundtrack. `edge-tts` generates chapter-aligned English narration
with the Microsoft `AvaMultilingualNeural` voice, and the soundtrack
automatically ducks under the voiceover:

```bash
npm run marketing:video:live
```

Install the neural text-to-speech CLI before rendering:

```bash
python3 -m pip install edge-tts
```

Set `LOTION_TTS_COMMAND` when `edge-tts` is installed in a virtual environment
or is otherwise not available on `PATH`.

The recorder copies `samples/demo-space` to a temporary directory, creates a
synthetic Notion HTML+CSV export, and removes both after rendering. It never
opens a personal workspace. Intermediate recordings are also removed after a
successful render. The UI is captured directly at 1920x1080 so text and thin
lines are not softened by post-recording scaling. Pass `--keep-intermediates`
when debugging. To drive a separate Lotion checkout that already
has dependencies installed:

```bash
node scripts/record-realtime-comparison.mjs \
  --app-root /absolute/path/to/lotion \
  --skip-build
```

Outputs:

- `lotion-vs-notion-realtime.mp4`
- `lotion-vs-notion-realtime-poster.png`

## Notion comparison baseline

- [Writing and editing basics](https://www.notion.com/help/writing-and-editing-basics)
- [Views, filters, sorts and groups](https://www.notion.com/help/views-filters-and-sorts)
- [Links and backlinks](https://www.notion.com/help/create-links-and-backlinks)
- [Workspace search](https://www.notion.com/help/search)
- [Import and export](https://www.notion.com/help/category/import-export-and-integrate)
