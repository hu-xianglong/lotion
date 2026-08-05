import { app, BrowserWindow, ipcMain } from "electron";
import { isAbsolute } from "node:path";
import { createMainWindow } from "./window.js";
import { registerPrivilegedSchemes, registerProtocolHandlers } from "./protocols.js";
import { WorkspaceService } from "./services/workspace-service.js";
import { AppConfigService } from "./services/app-config-service.js";
import { fileService } from "./services/file-service.js";

const userDataOverride = process.env.LOTION_USER_DATA_DIR;
if (userDataOverride && isAbsolute(userDataOverride)) {
  await fileService.ensureDir(userDataOverride);
  app.setPath("userData", userDataOverride);
}

// Must run before app.whenReady() so Electron sees the scheme's
// privileges at startup.
registerPrivilegedSchemes();

const appConfig = new AppConfigService();
const workspace = new WorkspaceService(appConfig);
let primaryWindow: BrowserWindow | undefined;
let isQuitting = false;
let ipcReady: Promise<void> | undefined;
function ensureIpcReady(): Promise<void> {
  ipcReady ??= import("./ipc.js").then(({ registerIpc }) => {
    registerIpc(workspace, appConfig);
  });
  return ipcReady;
}
ipcMain.handle("runtime:ready", () => ensureIpcReady());

function createPrimaryWindow(): BrowserWindow {
  const window = createMainWindow();
  primaryWindow = window;
  window.on("close", (event) => {
    if (process.platform !== "darwin" || isQuitting) return;
    event.preventDefault();
    window.hide();
  });
  window.on("closed", () => {
    if (primaryWindow === window) primaryWindow = undefined;
  });
  return window;
}

app.whenReady().then(() => {
  registerProtocolHandlers(workspace);
  createPrimaryWindow();
  void ensureIpcReady();

  app.on("activate", () => {
    if (primaryWindow && !primaryWindow.isDestroyed()) {
      primaryWindow.show();
      primaryWindow.focus();
    } else {
      createPrimaryWindow();
    }
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
