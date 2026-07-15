import { app, BrowserWindow } from "electron";
import { isAbsolute } from "node:path";
import { createMainWindow } from "./window.js";
import { registerIpc } from "./ipc.js";
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
registerIpc(workspace, appConfig);

app.whenReady().then(() => {
  registerProtocolHandlers(workspace);
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
