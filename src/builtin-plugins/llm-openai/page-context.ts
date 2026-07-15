import type { PluginContext } from "../../shared/plugin-api.js";

export async function activePageSystemContext(ctx: Pick<PluginContext, "workspace">): Promise<string | undefined> {
  try {
    const page = await ctx.workspace.activePage();
    if (!page) return undefined;
    const title = page.meta.title.trim() || "Untitled";
    const path = page.meta.path?.filter(Boolean).join(" / ");
    return [
      "The user is asking from an open Lotion page.",
      `Current page id: ${page.meta.id}`,
      `Current page title: ${title}`,
      path ? `Current page path: ${path}` : undefined,
      "If the answer requires the page body, call the lotion_get_active_page tool before answering."
    ].filter(Boolean).join("\n");
  } catch {
    return undefined;
  }
}
