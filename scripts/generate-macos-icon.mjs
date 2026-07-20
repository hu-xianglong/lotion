#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const source = join(root, "resources", "macos", "LotionIcon.svg");
const output = join(root, "resources", "macos", "Lotion.icns");
const temporaryRoot = await mkdtemp(join(tmpdir(), "lotion-macos-icon-"));
const iconset = join(temporaryRoot, "Lotion.iconset");
const master = join(temporaryRoot, "Lotion-1024.png");

const sizes = [
  [16, "icon_16x16.png"],
  [32, "icon_16x16@2x.png"],
  [32, "icon_32x32.png"],
  [64, "icon_32x32@2x.png"],
  [128, "icon_128x128.png"],
  [256, "icon_128x128@2x.png"],
  [256, "icon_256x256.png"],
  [512, "icon_256x256@2x.png"],
  [512, "icon_512x512.png"],
  [1024, "icon_512x512@2x.png"]
];

try {
  await execFileAsync("mkdir", ["-p", iconset]);
  await execFileAsync("sips", ["-s", "format", "png", source, "--out", master]);
  for (const [size, name] of sizes) {
    await execFileAsync("sips", ["-z", String(size), String(size), master, "--out", join(iconset, name)]);
  }
  await execFileAsync("iconutil", ["-c", "icns", iconset, "-o", output]);
  console.log(output);
} finally {
  await rm(temporaryRoot, { force: true, recursive: true });
}
