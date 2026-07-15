import type { CreateDatabaseInput, FieldSchema } from "../../../shared/types";

export interface DatabaseTemplate {
  id: string;
  name: string;
  description: string;
  emoji: string;
  buildInput(): CreateDatabaseInput;
}

const TASK_OPTIONS = [
  { id: "opt_todo", name: "Todo", color: "gray" },
  { id: "opt_in_progress", name: "In Progress", color: "blue" },
  { id: "opt_done", name: "Done", color: "green" }
];
const PRIORITY_OPTIONS = [
  { id: "opt_high", name: "High", color: "red" },
  { id: "opt_medium", name: "Medium", color: "yellow" },
  { id: "opt_low", name: "Low", color: "gray" }
];
const READ_STATUS_OPTIONS = [
  { id: "opt_to_read", name: "To read", color: "gray" },
  { id: "opt_reading", name: "Reading", color: "blue" },
  { id: "opt_finished", name: "Finished", color: "green" }
];

/**
 * Built-in database seed shapes. Each template returns a complete
 * CreateDatabaseInput — service composes it with the system fields.
 * A blank "Empty" template short-circuits to no extra fields so the
 * default database matches the historical behaviour.
 */
export const TEMPLATES: DatabaseTemplate[] = [
  {
    id: "empty",
    name: "Empty",
    description: "Plain title + timestamps. Add columns as you go.",
    emoji: "✱",
    buildInput: () => ({ name: "Untitled" })
  },
  {
    id: "tasks",
    name: "Tasks",
    description: "Status + priority + due date.",
    emoji: "✓",
    buildInput: () => ({
      name: "Tasks",
      template: {
        fields: [
          { id: "status", name: "Status", type: "select", options: TASK_OPTIONS } as FieldSchema,
          { id: "priority", name: "Priority", type: "select", options: PRIORITY_OPTIONS } as FieldSchema,
          { id: "due", name: "Due", type: "date" } as FieldSchema
        ],
        rows: [
          { title: "Plan the week", status: "opt_todo", priority: "opt_high" },
          { title: "Reply to inbox", status: "opt_todo", priority: "opt_medium" },
          { title: "Workout", status: "opt_done", priority: "opt_low" }
        ]
      }
    })
  },
  {
    id: "reading",
    name: "Reading list",
    description: "Title + author + status + rating.",
    emoji: "📖",
    buildInput: () => ({
      name: "Reading List",
      template: {
        fields: [
          { id: "author", name: "Author", type: "text" } as FieldSchema,
          { id: "status", name: "Status", type: "select", options: READ_STATUS_OPTIONS } as FieldSchema,
          { id: "rating", name: "Rating", type: "number" } as FieldSchema,
          { id: "finished_on", name: "Finished on", type: "date" } as FieldSchema
        ],
        rows: [
          { title: "A Pattern Language", author: "Christopher Alexander", status: "opt_to_read" }
        ]
      }
    })
  },
  {
    id: "journal",
    name: "Journal",
    description: "Date-keyed entries with tags.",
    emoji: "📓",
    buildInput: () => ({
      name: "Journal",
      template: {
        fields: [
          { id: "entry_date", name: "Date", type: "date" } as FieldSchema,
          { id: "tags", name: "Tags", type: "multi_select", options: [
            { id: "opt_work", name: "Work", color: "blue" },
            { id: "opt_life", name: "Life", color: "green" },
            { id: "opt_health", name: "Health", color: "red" }
          ] } as FieldSchema,
          { id: "mood", name: "Mood", type: "number" } as FieldSchema
        ],
        rows: [
          { title: "First entry", entry_date: new Date().toISOString().slice(0, 10) }
        ]
      }
    })
  }
];
