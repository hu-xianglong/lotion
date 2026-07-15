import { PluginHost } from "../../shared/plugin-host/index.js";
import type { PluginHostPlatform } from "../../shared/plugin-host/index.js";
import type { ContextMenuItem, Disposable, ModalOptions, UIAPI, WorkspaceAPI } from "../../shared/plugin-api.js";
import type { PageDocument } from "../../shared/types.js";

/**
 * Renderer-side PluginHost singleton.
 *
 * Constructed once when this module first loads. Built-in plugins
 * (src/builtin-plugins/*) register their providers against it on
 * startup; the rest of the renderer reads from `pluginHost.fields`,
 * `pluginHost.views`, etc. when rendering cells / views / blocks.
 *
 * Cross-process: this host is independent of the main-process host.
 * Field/view/block/preview providers live here (DOM-bound). Sync /
 * importer / AI providers live in main. The loader (task #76)
 * bridges events + cross-process provider calls.
 */

type ActivePageReader = () => PageDocument | null | Promise<PageDocument | null>;

let activePageReader: ActivePageReader | undefined;
let closeActivePluginContextMenu: (() => void) | undefined;

export function setRendererActivePageReader(reader: ActivePageReader): Disposable {
  activePageReader = reader;
  return {
    dispose() {
      if (activePageReader === reader) activePageReader = undefined;
    }
  };
}

/** WorkspaceAPI implementation that delegates to `window.lotion.*`
 *  (the contextBridge IPC surface). Plugins call this without
 *  knowing they're going over IPC.
 *
 *  Methods that have a 1:1 IPC counterpart pass through directly.
 *  Methods without one (move-page, etc.) throw
 *  TODO — wired up incrementally as plugins demand them. */
function createRendererWorkspace(): WorkspaceAPI {
  const lotion = (): typeof window.lotion => {
    if (typeof window === "undefined" || !window.lotion) {
      throw new Error("window.lotion is not available (renderer host not in Electron?)");
    }
    return window.lotion;
  };
  return {
    // Pages
    listPages: () => lotion().pages.list(),
    getPage: (id) => lotion().pages.get(id),
    // create/update on window.lotion return PageDocument; WorkspaceAPI
    // promises PageMeta. Strip the body off.
    createPage: async (input) => {
      const doc = await lotion().pages.create(input);
      return doc.meta;
    },
    updatePage: async (id, input) => {
      const doc = await lotion().pages.update(id, input);
      return doc.meta;
    },
    deletePage: (id) => lotion().pages.delete(id),
    movePage: async (id, newParent) => {
      const current = await lotion().pages.get(id);
      if (newParent === null) {
        await lotion().pages.update(id, {
          parentId: null,
          parentKind: null,
          path: [current.meta.title]
        });
        return;
      }
      if (newParent === id) {
        throw new Error("WorkspaceAPI.movePage cannot move a page under itself");
      }
      const parent = await lotion().pages.get(newParent);
      const parentPath = parent.meta.path && parent.meta.path.length > 0
        ? parent.meta.path
        : [parent.meta.title];
      await lotion().pages.update(id, {
        parentId: parent.meta.id,
        parentKind: "page",
        path: [...parentPath, current.meta.title]
      });
    },
    activePage: async () => activePageReader?.() ?? null,

    // Databases
    listDatabases: () => lotion().databases.list(),
    getDatabase: (id) => lotion().databases.get(id),
    createDatabase: (input) => lotion().databases.create(input),
    deleteDatabase: (id) => lotion().databases.delete(id),

    searchWorkspace: async (pattern) => {
      const result = await lotion().search.query(pattern);
      return {
        truncated: result.truncated,
        hits: result.hits.map((hit) => {
          if (hit.kind === "page") {
            return {
              kind: "page",
              pageId: hit.pageId,
              title: hit.title,
              preview: hit.text,
              path: hit.entityPath ?? hit.path
            };
          }
          if (hit.kind === "database") {
            return {
              kind: "database",
              databaseId: hit.databaseId,
              title: hit.databaseName,
              preview: hit.text,
              path: hit.entityPath ?? hit.path
            };
          }
          return {
            kind: hit.kind,
            databaseId: hit.databaseId,
            rowId: "rowId" in hit ? hit.rowId : undefined,
            title: hit.kind === "row" ? hit.rowTitle : hit.rowTitle ?? hit.pageFile,
            preview: hit.text,
            path: hit.entityPath ?? hit.path
          };
        })
      };
    },
    getBacklinks: (entityId) => lotion().entities.backlinks(entityId),

    // Schema
    addField: (databaseId, input) => lotion().databases.addField(databaseId, input),
    updateField: (input) => lotion().databases.updateField(input),
    deleteField: (databaseId, fieldId) => lotion().databases.deleteField(databaseId, fieldId),

    // Rows / cells
    getRowPage: async (databaseId, rowId) => {
      const rowPage = await lotion().rowPages.open(databaseId, rowId);
      return { meta: rowPage.meta, markdown: rowPage.markdown };
    },
    addRow: (databaseId) => lotion().databases.addRow(databaseId),
    updateCell: (input) => lotion().databases.updateCell(input),
    deleteRow: (databaseId, rowId) =>
      lotion().databases.deleteRow({ databaseId, rowId }),

    // Views
    createView: (input) => lotion().views.create(input),
    duplicateView: (databaseId, viewId, name) => lotion().views.duplicate({ databaseId, viewId, name }),
    updateView: (input) => lotion().views.update(input),
    deleteView: (databaseId, viewId) => lotion().views.delete({ databaseId, viewId }),
    setDefaultView: (databaseId, viewId) => lotion().views.setDefault({ databaseId, viewId }),

    // Attachments
    listAttachments: () => lotion().attachments.list(),
    getAttachment: (sha) => lotion().attachments.get(sha),
    addAttachment: (data, ext) => lotion().attachments.add(data, ext)
  };
}

/** UI primitives exposed to renderer plugins. Notifications are forwarded to
 *  the app shell so plugins don't block the UI with modal alerts. */
function notifyPluginUI(text: string, level: "info" | "warn" | "error" = "info") {
  window.dispatchEvent(new CustomEvent("lotion:notify", {
    detail: { text, level }
  }));
}

function reportPluginUIError(label: string, error: unknown) {
  console.error(label, error);
  notifyPluginUI(label, "error");
}

function openPluginModal<T>(options: ModalOptions<T>): Promise<T | null> {
  if (typeof document === "undefined") {
    return Promise.reject(new Error("ui.modal requires a renderer DOM"));
  }

  return new Promise<T | null>((resolve, reject) => {
    const backdrop = document.createElement("div");
    backdrop.className = "dialog-backdrop plugin-modal-backdrop";

    const dialog = document.createElement("section");
    dialog.className = "plugin-modal";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.tabIndex = -1;
    if (typeof options.width === "number" && Number.isFinite(options.width)) {
      dialog.style.width = `min(${Math.max(280, Math.round(options.width))}px, 100%)`;
    }

    const header = document.createElement("div");
    header.className = "dialog-header";

    const titleWrap = document.createElement("div");
    const title = document.createElement("h2");
    title.textContent = options.title;
    titleWrap.append(title);

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "plugin-modal-close";
    closeButton.setAttribute("aria-label", "Close");
    closeButton.textContent = "×";
    header.append(titleWrap, closeButton);

    const body = document.createElement("div");
    body.className = "plugin-modal-body";

    dialog.append(header, body);
    backdrop.append(dialog);

    let settled = false;
    let disposable: Disposable | void;
    const cleanup = () => {
      window.removeEventListener("keydown", onKeyDown, true);
      try {
        disposable?.dispose();
      } catch (error) {
        console.error("[plugin-modal] dispose failed", error);
      }
      backdrop.remove();
    };
    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(null);
      }
    }

    backdrop.addEventListener("mousedown", (event) => {
      if (event.target === backdrop) finish(null);
    });
    closeButton.addEventListener("click", () => finish(null));

    document.body.append(backdrop);
    window.addEventListener("keydown", onKeyDown, true);

    try {
      disposable = options.render(body, finish);
    } catch (error) {
      if (!settled) {
        settled = true;
        cleanup();
        reject(error);
      }
      return;
    }

    requestAnimationFrame(() => dialog.focus());
  });
}

function positionPluginContextMenu(menu: HTMLElement, anchor: { x: number; y: number }) {
  const margin = 8;
  const anchorX = Number.isFinite(anchor.x) ? anchor.x : margin;
  const anchorY = Number.isFinite(anchor.y) ? anchor.y : margin;
  const rect = menu.getBoundingClientRect();
  const maxX = Math.max(margin, window.innerWidth - rect.width - margin);
  const maxY = Math.max(margin, window.innerHeight - rect.height - margin);
  menu.style.left = `${Math.min(Math.max(anchorX, margin), maxX)}px`;
  menu.style.top = `${Math.min(Math.max(anchorY, margin), maxY)}px`;
}

function openPluginContextMenu(items: ContextMenuItem[], anchor: { x: number; y: number }) {
  if (typeof document === "undefined") {
    throw new Error("ui.contextMenu requires a renderer DOM");
  }

  closeActivePluginContextMenu?.();

  const menu = document.createElement("div");
  menu.className = "plugin-context-menu";
  menu.setAttribute("role", "menu");

  for (const item of items) {
    if (item.separator) {
      const separator = document.createElement("div");
      separator.className = "plugin-context-menu-separator";
      separator.setAttribute("role", "separator");
      menu.append(separator);
      continue;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "plugin-context-menu-item";
    button.setAttribute("role", "menuitem");
    button.disabled = !item.run;

    const icon = document.createElement("span");
    icon.className = "plugin-context-menu-icon";
    icon.textContent = item.icon ?? "";
    icon.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "plugin-context-menu-label";
    label.textContent = item.label;
    button.append(icon, label);

    button.addEventListener("click", () => {
      closeMenu();
      if (!item.run) return;
      try {
        const maybePromise = item.run() as unknown;
        if (maybePromise && typeof (maybePromise as PromiseLike<void>).then === "function") {
          (maybePromise as PromiseLike<void>).then(undefined, (error) => {
            reportPluginUIError("Plugin menu action failed", error);
          });
        }
      } catch (error) {
        reportPluginUIError("Plugin menu action failed", error);
      }
    });
    menu.append(button);
  }

  let closeListenerTimer = 0;
  function closeMenu() {
    window.clearTimeout(closeListenerTimer);
    document.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("keydown", onKeyDown, true);
    menu.remove();
    if (closeActivePluginContextMenu === closeMenu) closeActivePluginContextMenu = undefined;
  }
  function onPointerDown(event: PointerEvent) {
    const target = event.target;
    if (target instanceof Node && menu.contains(target)) return;
    closeMenu();
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    }
  }

  document.body.append(menu);
  positionPluginContextMenu(menu, anchor);
  closeActivePluginContextMenu = closeMenu;
  closeListenerTimer = window.setTimeout(() => {
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
  }, 0);
}

function createRendererUI(): UIAPI {
  return {
    notify(text: string, level?: "info" | "warn" | "error") {
      notifyPluginUI(text, level ?? "info");
    },
    modal: openPluginModal,
    contextMenu: openPluginContextMenu,
    prompt: (label: string, defaultValue?: string) =>
      Promise.resolve(window.prompt(label, defaultValue) ?? null),
    confirm: (message: string) => Promise.resolve(window.confirm(message)),
    openUrl: async (url: string) => {
      const message = await window.lotion.shell.openLink(url);
      if (message) throw new Error(message);
    },
    openEntity: (ref) => {
      window.dispatchEvent(new CustomEvent("lotion:open-entity", { detail: ref }));
    }
  };
}

const platform: PluginHostPlatform = {
  workspace: createRendererWorkspace(),
  ui: createRendererUI(),
  storage: {
    appendJsonl: (pluginId, fileName, value) =>
      window.lotion.plugins.appendJsonl(pluginId, fileName, value),
    readJsonl: (pluginId, fileName, options) =>
      window.lotion.plugins.readJsonl(pluginId, fileName, options),
    readJson: (pluginId, fileName) =>
      window.lotion.plugins.readJson(pluginId, fileName),
    writeJson: (pluginId, fileName, value) =>
      window.lotion.plugins.writeJson(pluginId, fileName, value),
    delete: (pluginId, fileName) =>
      window.lotion.plugins.deleteFile(pluginId, fileName)
  }
};

export const pluginHost = new PluginHost(platform);
