#!/usr/bin/env node
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { createStartupWorkspaceFixture } from "./startup-workspace-fixture.mjs";
import {
  assertNoDocumentHorizontalOverflow,
  assertWithinViewport,
  captureElementSnapshot,
  forEachViewport,
  selectedViewports,
  withLotionUIHarness
} from "./ui-harness.mjs";

const result = await withLotionUIHarness("workspace-open-ui", async ({ artifactRoot, cdpUrl, openWorkspace, page, registerTempWorkspace }) => {
  const viewports = [];
  await forEachViewport(page, selectedViewports(), async (viewport) => {
    const fixture = await createStartupWorkspaceFixture({
      name: `workspace-open-${viewport.name}`,
      pageCount: 4,
      databaseCount: 1,
      rowsPerDatabase: 3
    });
    registerTempWorkspace(fixture.root);
    const otherFixture = await createStartupWorkspaceFixture({
      name: `other-workspace-${viewport.name}`,
      pageCount: 1,
      databaseCount: 1,
      rowsPerDatabase: 1
    });
    registerTempWorkspace(otherFixture.root);
    await openWorkspace(fixture.root);
    await waitForWorkspacePage(page, fixture.targetTitle);

    const wrongParent = join(fixture.root, "Lotion Manual Test");
    const suggestedChild = join(wrongParent, "workspace");
    await mkdir(suggestedChild, { recursive: true });
    const recentWorkspace = {
      path: otherFixture.root,
      name: `First Launch other-workspace-${viewport.name}`
    };
    await page.evaluate(async ({ currentRoot, otherRoot }) => {
      await window.lotion.workspace.open(otherRoot);
      await window.lotion.workspace.open(currentRoot);
    }, { currentRoot: fixture.root, otherRoot: otherFixture.root });

    await page.locator(".workspace-selector").click();
    const menu = page.locator(".workspace-selector-menu").first();
    await menu.waitFor({ timeout: 8_000 });
    await assertWithinViewport(page, menu, `workspace selector menu ${viewport.name}`, 4);
    await menu.getByText(recentWorkspace.name).waitFor({ timeout: 8_000 });
    await menu.getByText(shortenTail(recentWorkspace.path)).waitFor({ timeout: 8_000 });
    await assertNoDocumentHorizontalOverflow(page, `workspace menu ${viewport.name}`, 2);

    await menu.getByRole("button", { name: new RegExp(escapeRegExp(recentWorkspace.name)) }).click();
    const confirm = page.locator(".workspace-selector-confirm").first();
    await confirm.waitFor({ timeout: 8_000 });
    await confirm.getByText("Open workspace?").waitFor({ timeout: 8_000 });
    await confirm.getByText(recentWorkspace.name).waitFor({ timeout: 8_000 });
    await confirm.getByText(recentWorkspace.path).waitFor({ timeout: 8_000 });
    await assertWithinViewport(page, confirm, `workspace switch confirmation ${viewport.name}`, 4);
    await assertNoDocumentHorizontalOverflow(page, `workspace switch confirmation ${viewport.name}`, 2);

    await confirm.getByRole("button", { name: "Cancel" }).click();
    await page.evaluate(({ selected, suggested }) => {
      window.dispatchEvent(new CustomEvent("lotion:workspace-open-error", {
        detail: {
          message: [
            "Cannot open workspace: the selected folder does not contain lotion.json.",
            `Selected folder: ${selected}`,
            `Suggested workspace folder: ${suggested}`
          ].join("\n")
        }
      }));
    }, { selected: wrongParent, suggested: suggestedChild });
    const alert = page.locator(".workspace-selector-error").first();
    await alert.waitFor({ timeout: 8_000 });
    const alertText = (await alert.textContent({ timeout: 5_000 })) ?? "";
    for (const expected of [
      "selected folder does not contain lotion.json",
      `Selected folder: ${wrongParent}`,
      `Suggested workspace folder: ${suggestedChild}`
    ]) {
      if (!alertText.includes(expected)) {
        throw new Error(`Workspace open alert missing ${expected} in ${viewport.name}: ${alertText}`);
      }
    }
    await assertWithinViewport(page, alert, `workspace open error ${viewport.name}`, 4);
    await assertNoDocumentHorizontalOverflow(page, `workspace open error ${viewport.name}`, 2);

    const snapshot = await captureElementSnapshot({
      artifactRoot,
      locator: alert,
      metadata: {
        phase: "wrong-folder-error",
        recentWorkspace,
        selectedPath: wrongParent,
        suggestedPath: suggestedChild,
        viewport: viewport.name
      },
      name: `workspace-open-error-${viewport.name}`,
      page,
      viewport
    });
    viewports.push({
      viewport: viewport.name,
      selectedPath: wrongParent,
      suggestedPath: suggestedChild,
      recentPath: recentWorkspace.path,
      alertText,
      snapshot
    });
  });

  return { cdpUrl, status: "passed", viewports };
});

console.log(JSON.stringify(result, null, 2));

async function waitForWorkspacePage(page, pageTitle) {
  await page.waitForFunction((title) => {
    const editor = document.querySelector('[data-testid="markdown-editor"]');
    const rect = editor?.getBoundingClientRect();
    return Boolean(
      editor &&
      rect &&
      rect.width > 0 &&
      rect.height > 0 &&
      editor.textContent?.includes(title)
    );
  }, pageTitle, { timeout: 20_000 });
}

function shortenTail(path) {
  const parts = path.split(/[\\/]/);
  if (parts.length <= 3) return path;
  return `…/${parts.slice(-2).join("/")}`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
