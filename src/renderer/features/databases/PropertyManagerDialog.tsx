import { useMemo, useRef, useState } from "react";
import type { AddFieldInput, DeletedFieldTombstone, FieldSchema, FieldType, TableView } from "../../../shared/types";
import { FieldTypeIcon } from "../../components/FieldTypeIcon";

export type PropertyManagerMutationStatus = "submitted" | "failed" | "ignored";

export function filterPropertyFields(fields: FieldSchema[], search: string): FieldSchema[] {
  const query = search.trim().toLowerCase();
  return fields.filter((field) => `${field.name} ${field.type}`.toLowerCase().includes(query));
}

export function propertyCreateInput({
  activeViewId,
  name,
  type,
  visibility
}: {
  activeViewId: string;
  name: string;
  type: FieldType;
  visibility: "current" | "all" | "hidden";
}): AddFieldInput {
  return {
    name,
    type,
    visibility,
    ...(visibility === "current" ? { viewId: activeViewId } : {})
  };
}

export function reorderPropertyIds(fields: FieldSchema[], sourceId: string, targetId: string): string[] | null {
  const ids = fields.map((field) => field.id);
  const from = ids.indexOf(sourceId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return null;
  ids.splice(from, 1);
  ids.splice(to, 0, sourceId);
  return ids;
}

export function propertyStateLabel(field: FieldSchema, activeView: TableView): string {
  if (field.system) return "System";
  return activeView.visibleFieldIds.includes(field.id) ? "Visible" : "Hidden in this view";
}

export function dismissPropertyManagerIfIdle(guard: { current: boolean }, onClose: () => void): boolean {
  if (guard.current) return false;
  onClose();
  return true;
}

export async function runPropertyManagerMutation({
  guard,
  mutation,
  onError,
  onPendingChange
}: {
  guard: { current: boolean };
  mutation: () => Promise<void>;
  onError: (message: string | null) => void;
  onPendingChange: (pending: boolean) => void;
}): Promise<PropertyManagerMutationStatus> {
  if (guard.current) return "ignored";
  guard.current = true;
  onError(null);
  onPendingChange(true);
  try {
    await mutation();
    return "submitted";
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error));
    return "failed";
  } finally {
    guard.current = false;
    onPendingChange(false);
  }
}

export function PropertyManagerDialog({ fields, deletedFields, activeView, onClose, onEdit, onAdd, onReorder, onDelete, onRestore, onPermanentlyDelete }: {
  fields: FieldSchema[];
  deletedFields: DeletedFieldTombstone[];
  activeView: TableView;
  onClose: () => void;
  onEdit: (field: FieldSchema) => void;
  onAdd: (input: AddFieldInput) => Promise<void>;
  onReorder: (fieldIds: string[]) => Promise<void>;
  onDelete: (field: FieldSchema) => Promise<void>;
  onRestore: (fieldId: string) => Promise<void>;
  onPermanentlyDelete: (fieldId: string) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("New property");
  const [type, setType] = useState<FieldType>("text");
  const [visibility, setVisibility] = useState<"current" | "all" | "hidden">("current");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draggedId = useRef<string | null>(null);
  const mutationRef = useRef(false);
  const visible = useMemo(() => filterPropertyFields(fields, search), [fields, search]);

  function runMutation(mutation: () => Promise<void>) {
    return runPropertyManagerMutation({
      guard: mutationRef,
      mutation,
      onError: setError,
      onPendingChange: setPending
    });
  }

  async function create() {
    const input = propertyCreateInput({ activeViewId: activeView.id, name, type, visibility });
    const status = await runMutation(() => onAdd(input));
    if (status === "submitted") setCreating(false);
  }

  async function move(sourceId: string, targetId: string) {
    const ids = reorderPropertyIds(fields, sourceId, targetId);
    if (!ids) return;
    await runMutation(() => onReorder(ids));
  }

  function closeIfIdle() {
    dismissPropertyManagerIfIdle(mutationRef, onClose);
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={closeIfIdle}>
      <div className="field-dialog property-manager" role="dialog" aria-modal="true" aria-label="Property manager" aria-busy={pending} onMouseDown={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <div><h2>Properties</h2><p>Database definitions affect every view. Visibility below can target only “{activeView.name}”.</p></div>
          <button disabled={pending} onClick={closeIfIdle}>Close</button>
        </div>
        <div className="property-manager-toolbar">
          <input aria-label="Search properties" placeholder="Search properties" value={search} onChange={(event) => setSearch(event.target.value)} />
          <button className="primary" disabled={pending} onClick={() => setCreating(true)}>New property</button>
        </div>
        {creating && (
          <div className="property-create-panel">
            <label>Name<input aria-label="New property name" disabled={pending} value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label>Type<select aria-label="New property type" disabled={pending} value={type} onChange={(event) => setType(event.target.value as FieldType)}>{fieldTypes.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}</select></label>
            <label>Visibility<select aria-label="New property visibility" disabled={pending} value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)}><option value="current">Current view only</option><option value="all">All views</option><option value="hidden">Hidden in saved views</option></select></label>
            <button className="primary" disabled={pending || !name.trim()} onClick={() => void create()}>{pending ? "Creating…" : "Create property"}</button>
          </div>
        )}
        {error && <div className="dialog-error" role="alert">{error}</div>}
        <div className="property-manager-list">
          {visible.map((field) => (
            <div
              key={field.id}
              className="property-manager-row"
              draggable={!field.system && !pending}
              onDragStart={() => { draggedId.current = field.id; }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => { if (draggedId.current) void move(draggedId.current, field.id); draggedId.current = null; }}
            >
              <span className="drag-handle" aria-hidden="true">⠿</span>
              <button className="property-manager-edit" disabled={pending} onClick={() => onEdit(field)}><FieldTypeIcon type={field.type} isTitle={field.id === "title"} /><span className="property-manager-name">{field.name}<small>{field.type.replaceAll("_", " ")}</small></span></button>
              <span className="property-state">{propertyStateLabel(field, activeView)}</span>
              <button className="property-delete" disabled={pending || field.system || field.id === "title"} onClick={() => {
                if (!window.confirm(`Delete “${field.name}”? It will be removed from views, filters, and sorts, but its values remain recoverable.`)) return;
                void runMutation(() => onDelete(field));
              }}>Delete</button>
            </div>
          ))}
        </div>
        {deletedFields.length > 0 && (
          <section className="deleted-properties">
            <h3>Deleted properties</h3>
            {deletedFields.map((item) => (
              <div className="deleted-property-row" key={item.field.id}>
                <span><strong>{item.field.name}</strong><small>{item.dependencies.length ? `Depends on: ${item.dependencies.join(", ")}` : "No remaining dependencies"}</small></span>
                <button disabled={pending} onClick={() => void runMutation(() => onRestore(item.field.id))}>Restore</button>
                <button className="danger" disabled={pending || item.dependencies.length > 0} title={item.dependencies.length ? "Restore or remove dependencies first." : undefined} onClick={() => {
                  if (!window.confirm(`Permanently delete “${item.field.name}”? Its saved values cannot be recovered.`)) return;
                  void runMutation(() => onPermanentlyDelete(item.field.id));
                }}>Permanently delete</button>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

const fieldTypes: FieldType[] = ["text", "number", "select", "multi_select", "date", "url", "person", "entity_ref", "checkbox", "formula", "rollup"];
