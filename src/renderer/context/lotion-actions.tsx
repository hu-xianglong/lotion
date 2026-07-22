import { createContext, useContext, type ReactNode } from "react";
import type { CreatePageInput, PageDocument } from "../../shared/types";
import type { ManageKind } from "../state/app-store";

/**
 * App-wide navigation + creation actions exposed via Context, so any
 * component (no matter how deeply nested under PageEditor →
 * EmbeddedViewRenderer → DatabaseTable) can call them without every
 * intermediate layer needing a matching prop.
 *
 * Local state callbacks (saving a page's body, editing a row cell, etc.)
 * stay as ordinary props on the components that own that state.
 */
export interface LotionActions {
  selectPage(id: string, options?: NavigationJumpOptions): Promise<void> | void;
  selectDatabase(id: string): void;
  /** Open a management landing page (all databases / all pages / recent). */
  openManage(kind: ManageKind): void;
  openRowPage(databaseId: string, rowId: string, options?: NavigationJumpOptions): void;
  openRowPageByFile(databaseId: string, fileName: string, options?: NavigationJumpOptions): void;
  createPage(input?: Partial<CreatePageInput>, options?: { open?: boolean }): Promise<PageDocument>;
  duplicatePage(id: string): Promise<PageDocument>;
  createDatabase(): void;
  deletePage(id: string): Promise<void>;
  toggleFavoriteCurrent(): Promise<void> | void;
  toggleFullWidthCurrent(): Promise<void> | void;
  toggleSmallTextCurrent(): Promise<void> | void;
  openActiveInNewWindow(): void;
  openSidebarSettings(): void;
  toggleVimMode(): void;
  toggleRawMarkdownMode(): void;
  toggleEmbedSourceVisibility(): void;
  goBack(): void;
  goForward(): void;
  canBack: boolean;
  canForward: boolean;
  backLabel?: string;
  forwardLabel?: string;
}

export interface NavigationJumpOptions {
  /** 1-based markdown line to scroll/select after opening a page body. */
  markdownLine?: number;
}

const LotionActionsContext = createContext<LotionActions | null>(null);

export function LotionActionsProvider({
  value,
  children
}: {
  value: LotionActions;
  children: ReactNode;
}) {
  return <LotionActionsContext.Provider value={value}>{children}</LotionActionsContext.Provider>;
}

export function useLotionActions(): LotionActions {
  const ctx = useContext(LotionActionsContext);
  if (!ctx) {
    throw new Error("useLotionActions must be used inside a LotionActionsProvider");
  }
  return ctx;
}
