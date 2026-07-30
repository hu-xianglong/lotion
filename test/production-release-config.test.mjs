import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import builderConfig from "../electron-builder.config.cjs";

test("production package includes both macOS download formats and native runtime files", () => {
  assert.equal(builderConfig.productName, "Lotion");
  assert.equal(builderConfig.mac.icon, "resources/macos/Lotion.icns");
  assert.deepEqual(builderConfig.mac.target, ["dmg", "zip"]);
  assert.ok(builderConfig.asarUnpack.includes("**/*.node"));
  assert.ok(builderConfig.asarUnpack.some((pattern) => pattern.includes("@vscode/ripgrep-")));
  assert.match(builderConfig.artifactName, /\$\{arch\}/);
  assert.equal("CSC_LINK" in process.env, false, "blank signing credentials must not reach electron-builder");
});

test("release workflow builds both Mac architectures and publishes version tags", async () => {
  const workflow = await readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");

  assert.match(workflow, /macos-15-intel/);
  assert.match(workflow, /arch: x64/);
  assert.match(workflow, /arch: arm64/);
  assert.match(workflow, /npm run package:mac/);
  assert.match(workflow, /npm run package:mac:verify/);
  assert.match(workflow, /gh release create/);
  assert.match(workflow, /actions\/checkout@v6/);
  assert.match(workflow, /actions\/upload-artifact@v7/);
  assert.match(workflow, /branches:\s*\n\s*- main/);
  assert.match(workflow, /tags:\s*\n\s*- "v\*"/);
});

test("package verification only requires native modules published for the target architecture", async () => {
  const verifier = await readFile(
    new URL("../scripts/verify-packaged-macos-app.mjs", import.meta.url),
    "utf8"
  );

  assert.match(verifier, /lancedb-darwin-\$\{arch\}/);
  assert.match(verifier, /optionalDependencies/);
  assert.match(verifier, /if \(expectsNativeModules\)/);
  assert.match(verifier, /Packaged Lotion exited during startup/);
});
