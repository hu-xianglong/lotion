import { BrowserWindow } from "electron";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

interface CreateWindowOptions {
  /** When true, open DevTools alongside the renderer in dev mode.
   *  Only honored for the first window — secondary windows opened via
   *  `windows:openNew` skip DevTools so the user isn't flooded with
   *  panels. */
  openDevTools?: boolean;
}

export function createMainWindow(options: CreateWindowOptions = { openDevTools: true }): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    title: "Lotion",
    backgroundColor: "#f7f5f0",
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void window.loadURL(devServerUrl);
    if (options.openDevTools) {
      window.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    void window.loadFile(join(__dirname, "../../dist/renderer/index.html"));
  }

  return window;
}
