#!/usr/bin/env node
import { execFile } from "node:child_process";
import { access, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

if (process.platform !== "darwin") {
  throw new Error("macOS app verification must run on macOS.");
}

const options = parseArgs(process.argv.slice(2));
const appPath = resolve(options.appPath);
const contentsPath = join(appPath, "Contents");
const plistPath = join(contentsPath, "Info.plist");

await access(plistPath);
const iconName = await plistValue(plistPath, "CFBundleIconFile");
if (!iconName || iconName === "electron.icns") {
  throw new Error(`Expected a Lotion app icon, received ${iconName || "no CFBundleIconFile"}.`);
}

const iconPath = join(contentsPath, "Resources", iconName);
const iconStats = await stat(iconPath);
if (!iconStats.isFile() || iconStats.size === 0) {
  throw new Error(`App icon is missing or empty: ${iconPath}`);
}

await execFileAsync("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
const gatekeeper = await runAssessment(appPath);
if (!gatekeeper.accepted && !options.allowUnnotarized) {
  throw new Error([
    "Gatekeeper rejected the app.",
    gatekeeper.output,
    "Sign with a Developer ID Application certificate and notarize before publishing."
  ].filter(Boolean).join("\n"));
}

console.log(JSON.stringify({
  app: basename(appPath),
  codeSignature: "valid",
  gatekeeper: gatekeeper.accepted ? "accepted" : "rejected-unnotarized-preview",
  icon: {
    bytes: iconStats.size,
    name: iconName
  }
}, null, 2));

async function plistValue(plist, key) {
  const result = await execFileAsync("plutil", ["-extract", key, "raw", "-o", "-", plist]);
  return result.stdout.trim();
}

async function runAssessment(target) {
  try {
    const result = await execFileAsync("spctl", ["--assess", "--type", "execute", "--verbose=4", target]);
    return { accepted: true, output: `${result.stdout}${result.stderr}`.trim() };
  } catch (error) {
    return { accepted: false, output: `${error.stdout || ""}${error.stderr || ""}`.trim() };
  }
}

function parseArgs(args) {
  const options = {
    allowUnnotarized: false,
    appPath: ""
  };
  for (const arg of args) {
    if (arg === "--allow-unnotarized") {
      options.allowUnnotarized = true;
    } else if (!options.appPath) {
      options.appPath = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }
  if (!options.appPath) {
    throw new Error("Usage: node scripts/verify-macos-app.mjs <Lotion.app> [--allow-unnotarized]");
  }
  return options;
}
