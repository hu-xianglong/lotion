import { protocol } from "electron";
import { resolve, sep } from "node:path";
import type { WorkspaceService } from "./services/workspace-service.js";
import { fileService } from "./services/file-service.js";

/**
 * Custom scheme so the renderer can load workspace files (page icons,
 * attachments) by their workspace-relative path without disabling
 * webSecurity or computing the absolute path on disk. Standard
 * `file://` URLs are blocked by Electron's default web-security
 * policy from the packaged app's origin.
 *
 *   <img src="lotion-file:///attachments/icons/abc.png" />
 *
 * Must be called at module load time (before app.whenReady). The
 * actual handler is wired up by `registerProtocolHandlers` once the
 * workspace service is available.
 */
export function registerPrivilegedSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "lotion-file",
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ]);
}

/** Call after `app.whenReady()` */
export function registerProtocolHandlers(workspace: WorkspaceService): void {
  protocol.handle("lotion-file", async (request) => {
    try {
      const url = new URL(request.url);
      // URL parsing eats the first path segment as the host
      // (e.g. lotion-file:///attachments/icons/x.png → host=attachments,
      //  pathname=/icons/x.png). Stitch them back together so the
      // resolver sees the full workspace-relative path.
      const hostPart = url.host ? decodeURIComponent(url.host) : "";
      const pathPart = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      const relative = hostPart ? `${hostPart}/${pathPart}` : pathPart;
      const root = workspace.requirePaths().root;
      const target = resolve(root, relative);
      // Refuse anything outside the workspace boundary.
      if (target !== root && !target.startsWith(root + sep)) {
        return new Response("forbidden", { status: 403 });
      }
      const data = await fileService.readBuffer(target);
      return new Response(new Uint8Array(data), {
        headers: { "content-type": guessMime(target) }
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return new Response("not found", { status: 404 });
      }
      return new Response(String(error), { status: 500 });
    }
  });
}

function guessMime(path: string): string {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "avif":
      return "image/avif";
    case "bmp":
      return "image/bmp";
    case "ico":
      return "image/x-icon";
    case "pdf":
      return "application/pdf";
    case "mp4":
    case "m4v":
      return "video/mp4";
    case "mov":
      return "video/quicktime";
    case "webm":
      return "video/webm";
    case "mp3":
      return "audio/mpeg";
    case "m4a":
      return "audio/mp4";
    case "wav":
      return "audio/wav";
    case "ogg":
      return "audio/ogg";
    default:
      return "application/octet-stream";
  }
}
