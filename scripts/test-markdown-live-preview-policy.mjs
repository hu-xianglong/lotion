import assert from "node:assert/strict";
import {
  isMarkdownBlockDecorationCandidateLine,
  shouldRebuildMarkdownBlockDecorationsForTextChange
} from "../dist-electron/shared/markdown-live-preview-policy.js";

assert.equal(isMarkdownBlockDecorationCandidateLine("普通的一行文字"), false);
assert.equal(isMarkdownBlockDecorationCandidateLine("  just plain prose"), false);
assert.equal(isMarkdownBlockDecorationCandidateLine("# Heading"), true);
assert.equal(isMarkdownBlockDecorationCandidateLine("> quote"), true);
assert.equal(isMarkdownBlockDecorationCandidateLine("- [x] done"), true);
assert.equal(isMarkdownBlockDecorationCandidateLine("| A | B |"), true);
assert.equal(isMarkdownBlockDecorationCandidateLine("![alt](attachments/images/a.png)"), true);
assert.equal(isMarkdownBlockDecorationCandidateLine("[doc](attachments/documents/a.pdf)"), true);
assert.equal(isMarkdownBlockDecorationCandidateLine("https://indify.co/widgets/live/countdown/example"), true);
assert.equal(isMarkdownBlockDecorationCandidateLine("```lotion-view"), true);

assert.equal(
  shouldRebuildMarkdownBlockDecorationsForTextChange({
    lineCountChanged: false,
    beforeLines: ["普通的一行文字"],
    afterLines: ["普通的一行文字x"]
  }),
  false
);

assert.equal(
  shouldRebuildMarkdownBlockDecorationsForTextChange({
    lineCountChanged: true,
    beforeLines: ["普通的一行文字"],
    afterLines: ["普通的一行文字", "another line"]
  }),
  true
);

assert.equal(
  shouldRebuildMarkdownBlockDecorationsForTextChange({
    lineCountChanged: false,
    beforeLines: ["Heading"],
    afterLines: ["# Heading"]
  }),
  true
);

assert.equal(
  shouldRebuildMarkdownBlockDecorationsForTextChange({
    lineCountChanged: false,
    beforeLines: ["plain"],
    afterLines: ["https://indify.co/widgets/live/countdown/example"]
  }),
  true
);

console.log("markdown live preview policy tests passed");
