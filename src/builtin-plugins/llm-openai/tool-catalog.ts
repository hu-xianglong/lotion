export type LotionToolCategory = "read" | "write";

export interface LotionToolCatalogItem {
  name: string;
  label: string;
  category: LotionToolCategory;
}

export const LOTION_TOOL_CATALOG: LotionToolCatalogItem[] = [
  { name: "lotion_search", label: "Search workspace", category: "read" },
  { name: "lotion_list_pages", label: "List pages", category: "read" },
  { name: "lotion_get_page", label: "Read page", category: "read" },
  { name: "lotion_get_active_page", label: "Read active page", category: "read" },
  { name: "lotion_list_databases", label: "List databases", category: "read" },
  { name: "lotion_get_database", label: "Read database", category: "read" },
  { name: "lotion_create_page", label: "Create page", category: "write" },
  { name: "lotion_update_page", label: "Update page", category: "write" },
  { name: "lotion_create_database", label: "Create database", category: "write" },
  { name: "lotion_add_row", label: "Add database row", category: "write" },
  { name: "lotion_update_cell", label: "Update database cell", category: "write" }
];

export const ALL_LOTION_TOOL_NAMES = LOTION_TOOL_CATALOG.map((tool) => tool.name);
