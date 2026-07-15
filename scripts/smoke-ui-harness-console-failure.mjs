#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import {
  readHarnessResultArtifactsSince,
  selectedViewports,
  withLotionUIHarness
} from "./ui-harness.mjs";

const startedAt = Date.now();
const expectedMessage = "intentional Lotion UI harness console failure";
let observedError = null;

try {
  await withLotionUIHarness("ui-harness-console-failure", async ({ page }) => {
    await page.evaluate((message) => console.error(message), expectedMessage);
    return {
      status: "should-fail",
      viewports: selectedViewports().map((viewport) => ({ viewport }))
    };
  });
} catch (error) {
  observedError = error;
}

if (!observedError) {
  throw new Error("Expected the UI harness to fail when a renderer console.error is emitted.");
}
if (!/emitted console\/page errors/.test(observedError.message)) {
  throw new Error(`Expected a console-error harness failure, got: ${observedError.stack || observedError.message}`);
}

const manifests = await readHarnessResultArtifactsSince({ startedAt });
const latest = manifests
  .filter((entry) => entry.manifest.name === "ui-harness-console-failure")
  .at(-1);

if (!latest) {
  throw new Error("Expected a failed ui-harness-console-failure manifest.");
}
if (latest.manifest.status !== "failed") {
  throw new Error(`Expected failed manifest status, got: ${JSON.stringify(latest.manifest.status)}`);
}
if ((latest.manifest.logs?.consoleErrorCount ?? 0) < 1) {
  throw new Error(`Expected consoleErrorCount >= 1, got: ${JSON.stringify(latest.manifest.logs)}`);
}
if (!JSON.stringify(latest.manifest.logs?.consoleIssues || []).includes(expectedMessage)) {
  throw new Error(`Expected manifest consoleIssues to include the intentional error: ${JSON.stringify(latest.manifest.logs)}`);
}

const consoleJsonPath = join(latest.manifest.artifactRoot, "console.json");
await stat(consoleJsonPath);
const consoleEvents = JSON.parse(await readFile(consoleJsonPath, "utf8"));
if (!consoleEvents.some((event) => event.type === "error" && event.text.includes(expectedMessage))) {
  throw new Error(`Expected structured console.json to include the intentional error: ${JSON.stringify(consoleEvents)}`);
}

console.log(JSON.stringify({
  status: "passed",
  expectedFailure: observedError.message,
  harnessManifest: latest.manifestPath,
  consoleJson: consoleJsonPath,
  consoleErrorCount: latest.manifest.logs.consoleErrorCount
}, null, 2));
