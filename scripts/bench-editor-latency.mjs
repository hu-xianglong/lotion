import {
  shouldRebuildMarkdownBlockDecorationsForTextChange
} from "../dist-electron/shared/markdown-live-preview-policy.js";

const args = new Set(process.argv.slice(2));
const check = args.has("--check");
const iterations = Number(process.env.LOTION_EDITOR_BENCH_ITERATIONS ?? 5000);
const thresholdMs = Number(process.env.LOTION_EDITOR_BENCH_THRESHOLD_MS ?? 35);

const plainLines = Array.from({ length: 50000 }, (_, index) =>
  `普通文本 line ${index} with enough words to simulate a large daily note body`
);
const candidateLines = [
  "# Heading",
  "| A | B |",
  "![image](attachments/images/a.png)",
  "[doc](attachments/documents/a.pdf)",
  "https://indify.co/widgets/live/countdown/example",
  "```lotion-view"
];

let plainRebuilds = 0;
let candidateRebuilds = 0;
const t0 = performance.now();
for (let index = 0; index < iterations; index += 1) {
  const line = plainLines[index % plainLines.length];
  if (shouldRebuildMarkdownBlockDecorationsForTextChange({
    lineCountChanged: false,
    beforeLines: [line],
    afterLines: [`${line}x`]
  })) {
    plainRebuilds += 1;
  }
}
const plainMs = performance.now() - t0;

const t1 = performance.now();
for (let index = 0; index < candidateLines.length; index += 1) {
  const line = candidateLines[index];
  if (shouldRebuildMarkdownBlockDecorationsForTextChange({
    lineCountChanged: false,
    beforeLines: [line],
    afterLines: [`${line}x`]
  })) {
    candidateRebuilds += 1;
  }
}
const candidateMs = performance.now() - t1;

const summary = {
  iterations,
  plainMs: Number(plainMs.toFixed(2)),
  plainAvgMs: Number((plainMs / iterations).toFixed(5)),
  plainRebuilds,
  candidateMs: Number(candidateMs.toFixed(2)),
  candidateRebuilds
};

console.log(JSON.stringify(summary, null, 2));

if (check) {
  if (plainRebuilds !== 0) {
    throw new Error(`Expected plain text edits to reuse block decorations, got ${plainRebuilds} rebuilds`);
  }
  if (candidateRebuilds !== candidateLines.length) {
    throw new Error(`Expected all candidate edits to rebuild block decorations, got ${candidateRebuilds}`);
  }
  if (plainMs > thresholdMs) {
    throw new Error(`Plain text policy check took ${plainMs.toFixed(2)}ms, threshold ${thresholdMs}ms`);
  }
}
