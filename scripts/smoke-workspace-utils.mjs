export const smokeTempWorkspaceNeedles = [
  "/lotion-notion-audit-ui-",
  "/lotion-search-ui-",
  "/lotion-search-title-",
  "/lotion-first-launch-",
  "/lotion-embedded-",
  "/lotion-editor-scroll-",
  "/lotion-editor-regression-",
  "/lotion-sidebar-nav-",
  "/lotion-sidebar-settings-",
  "/lotion-settings-center-",
  "/lotion-row-page-nav-",
  "/lotion-source-attachments-",
  "/lotion-markdown-preview-",
  "/lotion-page-path-slash-",
  "/lotion-page-backlinks-",
  "/lotion-plugin-manager-",
  "/lotion-llm-chat-",
  "/lotion-url-field-",
  "/lotion-image-lightbox-",
  "/lotion-window-popout-",
  "/lotion-database-template-"
];

export async function currentNonSmokeWorkspacePath(page) {
  return page.evaluate(async (needles) => {
    const recents = await window.lotion.workspace.listRecent();
    return recents.find((recent) => !needles.some((needle) => recent.path.includes(needle)))?.path ??
      recents[0]?.path ??
      "";
  }, smokeTempWorkspaceNeedles);
}
