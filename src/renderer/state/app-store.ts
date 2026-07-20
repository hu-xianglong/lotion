import type { DatabaseSummary, FavoriteItem, PageDocument, PageMeta, PagesTree, RecentItem, SpaceManifest } from "../../shared/types";

export type BuiltInManageKind = "databases" | "pages" | "favorites" | "recent" | "plugins" | "settings" | "design-system";
export type TagManageKind = `tag:${string}`;
export type ManageKind = BuiltInManageKind | TagManageKind;

export function tagManageKind(tag: string): TagManageKind {
  return `tag:${encodeURIComponent(tag.trim())}` as TagManageKind;
}

export function isTagManageKind(kind: ManageKind): kind is TagManageKind {
  return kind.startsWith("tag:");
}

export function tagFromManageKind(kind: ManageKind): string | null {
  if (!isTagManageKind(kind)) return null;
  const encoded = kind.slice("tag:".length);
  try {
    return decodeURIComponent(encoded);
  } catch {
    return encoded;
  }
}

export type ActiveItem =
  | { type: "page"; id: string }
  | { type: "database"; id: string }
  | { type: "row_page"; databaseId: string; rowId: string; title?: string }
  | { type: "manage"; kind: ManageKind };

export interface ActiveRowPageRef {
  databaseId: string;
  rowId: string;
  meta?: PageMeta;
  title?: string;
  markdown: string;
  fullWidth?: boolean;
}

/** A single tab in the main window. `item` is undefined for a blank
 *  "new tab" awaiting the user's first navigation. */
export interface TabState {
  id: string;
  item?: ActiveItem;
}

export interface AppState {
  manifest?: SpaceManifest;
  pages: PageMeta[];
  databases: DatabaseSummary[];
  /** Bookmarks (pages, databases, and row-pages) from manifest.favorites. */
  favorites: FavoriteItem[];
  /** Most-recent navigations, most-recent first. */
  recents: RecentItem[];
  activeItem?: ActiveItem;
  activePage?: PageDocument;
  /** Schema + records for the active database live in DatabaseCache.
   *  This is just the id so any consumer can pull from the cache. */
  activeDatabaseId?: string;
  activeDatabaseLoadMs?: number;
  /** Bundle for this row's database also lives in DatabaseCache. */
  activeRowPage?: ActiveRowPageRef;
  pagesTree?: PagesTree;
  searchQuery: string;
  isLoading: boolean;
  error?: string;
  /** Tab strip — session-only (lost on reload). */
  tabs: TabState[];
  activeTabIndex: number;
}

export const initialAppState: AppState = {
  pages: [],
  databases: [],
  favorites: [],
  recents: [],
  searchQuery: "",
  isLoading: true,
  tabs: [{ id: "tab_0" }],
  activeTabIndex: 0
};
