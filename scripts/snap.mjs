#!/usr/bin/env node
/**
 * Attach to the running Electron's renderer via CDP and screenshot it.
 *
 * Prereqs:
 *   - Electron must be launched with `--remote-debugging-port=9222`
 *     (scripts/dev.mjs already does this).
 *
 * Usage:
 *   node scripts/snap.mjs                       # → /tmp/lotion-<ts>.png
 *   node scripts/snap.mjs out.png               # → ./out.png
 *   node scripts/snap.mjs --full out.png        # full page (no viewport clip)
 *   node scripts/snap.mjs --eval "expr"         # run JS in renderer, print result
 *   node scripts/snap.mjs --key "Meta+Shift+F"  # press a hotkey, then screenshot
 */
import { chromium } from "playwright-core";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CDP_URL = "http://127.0.0.1:9222";

function parseArgs(argv) {
  const args = { fullPage: false, evalExpr: null, key: null, out: null, type: null, fill: null, wait: 0 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--full") args.fullPage = true;
    else if (a === "--eval") args.evalExpr = argv[++i];
    else if (a === "--key") args.key = argv[++i];
    else if (a === "--type") args.type = argv[++i];
    else if (a === "--fill") { args.fill = { selector: argv[++i], value: argv[++i] }; }
    else if (a === "--wait") args.wait = Number(argv[++i]);
    else if (!args.out) args.out = a;
  }
  if (!args.out) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    args.out = `/tmp/lotion-${ts}.png`;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
  } catch (err) {
    console.error(`Could not attach to Electron at ${CDP_URL}.`);
    console.error("Make sure dev is running and Electron was launched");
    console.error("with --remote-debugging-port=9222 (scripts/dev.mjs).");
    console.error(`  ${err.message}`);
    process.exit(1);
  }

  // The first "context" exposed over CDP is the default browsing context
  // (the Electron BrowserWindow). Pages = its renderer frames.
  const contexts = browser.contexts();
  if (contexts.length === 0) {
    console.error("No contexts available over CDP — is Electron up?");
    process.exit(1);
  }
  const pages = contexts[0].pages();
  // Prefer the actual app page (Vite dev URL or file://) over devtools.
  let page = pages.find((p) =>
    /127\.0\.0\.1:5173|localhost:5173|index\.html/.test(p.url())
  );
  if (!page) page = pages[0];
  if (!page) {
    console.error("No pages in Electron context — is the app loaded?");
    process.exit(1);
  }

  if (args.key) {
    await page.bringToFront();
    await page.keyboard.press(args.key);
    await page.waitForTimeout(250);
  }

  if (args.fill) {
    await page.bringToFront();
    await page.fill(args.fill.selector, args.fill.value);
  }

  if (args.type) {
    await page.bringToFront();
    await page.keyboard.type(args.type);
  }

  if (args.wait > 0) {
    await page.waitForTimeout(args.wait);
  }

  if (args.evalExpr) {
    const result = await page.evaluate(args.evalExpr);
    console.log(JSON.stringify(result, null, 2));
  }

  const buf = await page.screenshot({ fullPage: args.fullPage });
  const outPath = resolve(args.out);
  await writeFile(outPath, buf);
  console.log(outPath);

  // Detach without closing the renderer.
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
