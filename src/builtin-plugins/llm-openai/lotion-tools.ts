import type {
  DatabaseRecord,
  DatabaseSummary,
  FieldSchema,
  PageMeta,
  RecordValue
} from "../../shared/types.js";
import type { WorkspaceAPI } from "../../shared/plugin-api.js";
import type { LLMToolCall, LLMToolDefinition, LLMToolExecutor } from "./llm-transport.js";

export interface LotionToolOptions {
  enabledToolNames?: string[];
}

export interface LotionTool extends LLMToolDefinition {
  readOnly: boolean;
  execute(args: Record<string, unknown>): Promise<unknown>;
}

export function createLotionTools(workspace: WorkspaceAPI, options: LotionToolOptions): LotionTool[] {
  const tools: LotionTool[] = [
    {
      type: "function",
      name: "lotion_search",
      description: "Search the current Lotion workspace by title, page body, database field, or reference.",
      readOnly: true,
      parameters: objectSchema({
        query: stringSchema("Search query."),
        limit: numberSchema("Maximum results to return.")
      }, ["query"]),
      execute: async (args) => {
        const result = await workspace.searchWorkspace(requiredString(args, "query"));
        const limit = optionalNumber(args, "limit", 10);
        return {
          truncated: result.truncated,
          hits: result.hits.slice(0, limit)
        };
      }
    },
    {
      type: "function",
      name: "lotion_list_pages",
      description: "List workspace pages with ids and titles.",
      readOnly: true,
      parameters: objectSchema({
        limit: numberSchema("Maximum pages to return.")
      }),
      execute: async (args) => {
        const pages = await workspace.listPages();
        return pages.slice(0, optionalNumber(args, "limit", 50)).map(summarizePage);
      }
    },
    {
      type: "function",
      name: "lotion_get_page",
      description: "Read a page by id, including markdown body.",
      readOnly: true,
      parameters: objectSchema({
        pageId: stringSchema("Page id.")
      }, ["pageId"]),
      execute: async (args) => {
        const page = await workspace.getPage(requiredString(args, "pageId"));
        return {
          meta: summarizePage(page.meta),
          markdown: page.markdown
        };
      }
    },
    {
      type: "function",
      name: "lotion_get_active_page",
      description: "Read the currently open Lotion page, including markdown body. Returns null when the active tab is not a page.",
      readOnly: true,
      parameters: objectSchema({}),
      execute: async () => {
        const page = await workspace.activePage();
        if (!page) return { page: null };
        return {
          meta: summarizePage(page.meta),
          markdown: page.markdown
        };
      }
    },
    {
      type: "function",
      name: "lotion_list_databases",
      description: "List databases with ids, names, and row counts.",
      readOnly: true,
      parameters: objectSchema({
        limit: numberSchema("Maximum databases to return.")
      }),
      execute: async (args) => {
        const databases = await workspace.listDatabases();
        return databases.slice(0, optionalNumber(args, "limit", 50)).map(summarizeDatabase);
      }
    },
    {
      type: "function",
      name: "lotion_get_database",
      description: "Read a database schema and a sample of records by database id.",
      readOnly: true,
      parameters: objectSchema({
        databaseId: stringSchema("Database id."),
        limit: numberSchema("Maximum records to return.")
      }, ["databaseId"]),
      execute: async (args) => {
        const bundle = await workspace.getDatabase(requiredString(args, "databaseId"));
        const limit = optionalNumber(args, "limit", 20);
        return {
          schema: {
            id: bundle.schema.id,
            name: bundle.schema.name,
            fields: bundle.schema.fields.map(summarizeField)
          },
          views: bundle.views.map((view) => ({ id: view.id, name: view.name, type: view.type })),
          records: bundle.records.slice(0, limit).map(summarizeRecord)
        };
      }
    },
    {
      type: "function",
      name: "lotion_create_page",
      description: "Create a Lotion page. Use only when the user asks to create a page.",
      readOnly: false,
      parameters: objectSchema({
        title: stringSchema("Page title."),
        markdown: stringSchema("Initial markdown body.")
      }, ["title"]),
      execute: async (args) => {
        const page = await workspace.createPage({ title: requiredString(args, "title") });
        const markdown = optionalString(args, "markdown", "");
        const updated = markdown.trim()
          ? await workspace.updatePage(page.id, { markdown })
          : page;
        return { ok: true, page: summarizePage(updated) };
      }
    },
    {
      type: "function",
      name: "lotion_update_page",
      description: "Replace a Lotion page markdown body. Use only when the user asks to edit an existing page.",
      readOnly: false,
      parameters: objectSchema({
        pageId: stringSchema("Page id."),
        markdown: stringSchema("New full markdown body.")
      }, ["pageId", "markdown"]),
      execute: async (args) => {
        const page = await workspace.updatePage(requiredString(args, "pageId"), {
          markdown: requiredString(args, "markdown")
        });
        return { ok: true, page: summarizePage(page) };
      }
    },
    {
      type: "function",
      name: "lotion_create_database",
      description: "Create a Lotion database with a title field. Use only when the user asks to create a database.",
      readOnly: false,
      parameters: objectSchema({
        name: stringSchema("Database name.")
      }, ["name"]),
      execute: async (args) => {
        const bundle = await workspace.createDatabase({
          name: requiredString(args, "name")
        });
        return {
          ok: true,
          database: summarizeDatabase({ id: bundle.schema.id, name: bundle.schema.name, rows: bundle.records.length })
        };
      }
    },
    {
      type: "function",
      name: "lotion_add_row",
      description: "Add a blank row to a database.",
      readOnly: false,
      parameters: objectSchema({
        databaseId: stringSchema("Database id.")
      }, ["databaseId"]),
      execute: async (args) => {
        const bundle = await workspace.addRow(requiredString(args, "databaseId"));
        return {
          ok: true,
          row: summarizeRecord(bundle.records[bundle.records.length - 1])
        };
      }
    },
    {
      type: "function",
      name: "lotion_update_cell",
      description: "Update one editable database cell.",
      readOnly: false,
      parameters: objectSchema({
        databaseId: stringSchema("Database id."),
        rowId: stringSchema("Row id."),
        fieldId: stringSchema("Field id, such as title or a schema field id."),
        value: { description: "New cell value." }
      }, ["databaseId", "rowId", "fieldId", "value"]),
      execute: async (args) => {
        const bundle = await workspace.updateCell({
          databaseId: requiredString(args, "databaseId"),
          rowId: requiredString(args, "rowId"),
          fieldId: requiredString(args, "fieldId"),
          value: toRecordValue(args.value)
        });
        const rowId = requiredString(args, "rowId");
        return {
          ok: true,
          row: summarizeRecord(bundle.records.find((record) => String(record.id) === rowId))
        };
      }
    }
  ];

  if (!options.enabledToolNames) return tools;
  const enabled = new Set(options.enabledToolNames);
  return tools.filter((tool) => enabled.has(tool.name));
}

export function createLotionToolExecutor(tools: LotionTool[]): LLMToolExecutor {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  return {
    execute: async (call: LLMToolCall) => {
      const tool = byName.get(call.name);
      if (!tool) {
        return { ok: false, error: `Unknown Lotion tool: ${call.name}` };
      }
      try {
        return await tool.execute(call.arguments);
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  };
}

function summarizePage(page: PageMeta): Record<string, unknown> {
  return {
    id: page.id,
    title: page.title,
    path: page.path,
    parentId: page.parentId,
    parentKind: page.parentKind,
    updated_time: page.updated_time
  };
}

function summarizeDatabase(database: DatabaseSummary & { rows?: number }): Record<string, unknown> {
  return {
    id: database.id,
    name: database.name,
    rows: database.rows
  };
}

function summarizeField(field: FieldSchema): Record<string, unknown> {
  return {
    id: field.id,
    name: field.name,
    type: field.type,
    hidden: field.hidden,
    system: field.system,
    options: field.options?.map((option) => ({ id: option.id, name: option.name }))
  };
}

function summarizeRecord(record: DatabaseRecord | undefined): Record<string, unknown> | null {
  if (!record) return null;
  return {
    id: record.id,
    title: record.title,
    created_time: record.created_time,
    updated_time: record.updated_time,
    values: Object.fromEntries(
      Object.entries(record)
        .filter(([key]) => !["id", "created_time", "updated_time", "body_path", "page_file"].includes(key))
        .slice(0, 30)
    )
  };
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false
  };
}

function stringSchema(description: string): Record<string, unknown> {
  return { type: "string", description };
}

function numberSchema(description: string): Record<string, unknown> {
  return { type: "number", description };
}

function requiredString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required string argument: ${key}`);
  }
  return value.trim();
}

function optionalString(args: Record<string, unknown>, key: string, fallback: string): string {
  const value = args[key];
  return typeof value === "string" ? value : fallback;
}

function optionalNumber(args: Record<string, unknown>, key: string, fallback: number): number {
  const value = Number(args[key]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(100, Math.round(value)));
}

function toRecordValue(value: unknown): RecordValue {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
    return value as RecordValue;
  }
  return JSON.stringify(value);
}
