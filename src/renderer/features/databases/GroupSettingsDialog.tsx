import { useMemo, useRef, useState } from "react";
import type { DatabaseRecord, FieldSchema, TableView, ViewGroup } from "../../../shared/types";
import { groupDatabaseRecords, isGroupableField } from "../../../shared/database-grouping";

export type GroupSettingsSubmissionStatus = "submitted" | "failed" | "ignored";

export function dismissGroupSettingsIfIdle(guard: { current: boolean }, onClose: () => void): boolean {
  if (guard.current) return false;
  onClose();
  return true;
}

export async function runGroupSettingsSubmission({
  guard,
  onError,
  onPendingChange,
  onSuccess,
  submit
}: {
  guard: { current: boolean };
  onError: (message: string) => void;
  onPendingChange: (pending: boolean) => void;
  onSuccess: () => void;
  submit: () => Promise<void>;
}): Promise<GroupSettingsSubmissionStatus> {
  if (guard.current) return "ignored";
  guard.current = true;
  onError("");
  onPendingChange(true);
  try {
    await submit();
  } catch (error) {
    onError(error instanceof Error ? error.message : String(error));
    return "failed";
  } finally {
    guard.current = false;
    onPendingChange(false);
  }
  onSuccess();
  return "submitted";
}

export function GroupSettingsDialog({ view, fields, records, onClose, onSave }: { view: TableView; fields: FieldSchema[]; records: DatabaseRecord[]; onClose: () => void; onSave: (groups: ViewGroup[]) => Promise<void> }) {
  const [primaryId, setPrimaryId] = useState(view.groups?.[0]?.fieldId ?? "");
  const [secondaryId, setSecondaryId] = useState(view.groups?.[1]?.fieldId ?? "");
  const current = view.groups?.[0];
  const [order, setOrder] = useState<ViewGroup["order"]>(current?.order ?? "manual");
  const [hideEmpty, setHideEmpty] = useState(Boolean(current?.hideEmpty));
  const [hidden, setHidden] = useState(() => new Set(current?.hiddenGroupKeys ?? []));
  const [collapsed, setCollapsed] = useState(() => new Set(current?.collapsedGroupKeys ?? []));
  const secondaryCurrent = view.groups?.[1];
  const [secondaryOrder, setSecondaryOrder] = useState<ViewGroup["order"]>(secondaryCurrent?.order ?? "manual");
  const [secondaryHideEmpty, setSecondaryHideEmpty] = useState(Boolean(secondaryCurrent?.hideEmpty));
  const [secondaryHidden, setSecondaryHidden] = useState(() => new Set(secondaryCurrent?.hiddenGroupKeys ?? []));
  const [secondaryCollapsed, setSecondaryCollapsed] = useState(() => new Set(secondaryCurrent?.collapsedGroupKeys ?? []));
  const [pending, setPending] = useState(false);
  const [saveError, setSaveError] = useState("");
  const submissionRef = useRef(false);
  const primary = fields.find((field) => field.id === primaryId);
  const secondary = fields.find((field) => field.id === secondaryId && field.id !== primaryId);
  const preview = useMemo(() => primary ? groupDatabaseRecords(records, primary, { version: 1, id: current?.id ?? "group-primary", fieldId: primary.id, order, hideEmpty, groupOrder: current?.fieldId === primary.id ? current.groupOrder : undefined }) : [], [current?.fieldId, current?.groupOrder, current?.id, hideEmpty, order, primary, records]);
  const secondaryPreview = useMemo(() => secondary ? groupDatabaseRecords(records, secondary, { version: 1, id: secondaryCurrent?.id ?? "group-secondary", fieldId: secondary.id, order: secondaryOrder, hideEmpty: secondaryHideEmpty, groupOrder: secondaryCurrent?.fieldId === secondary.id ? secondaryCurrent.groupOrder : undefined }) : [], [records, secondary, secondaryCurrent?.fieldId, secondaryCurrent?.groupOrder, secondaryCurrent?.id, secondaryHideEmpty, secondaryOrder]);
  function closeIfIdle() {
    dismissGroupSettingsIfIdle(submissionRef, onClose);
  }
  function save() {
    const groups: ViewGroup[] = [];
    if (primary) groups.push({ version: 1, id: current?.id ?? "group-primary", fieldId: primary.id, order, hideEmpty, groupOrder: preview.map((bucket) => bucket.key), hiddenGroupKeys: [...hidden], collapsedGroupKeys: [...collapsed] });
    if (secondary) groups.push({ version: 1, id: secondaryCurrent?.id ?? "group-secondary", fieldId: secondary.id, order: secondaryOrder, hideEmpty: secondaryHideEmpty, groupOrder: secondaryPreview.map((bucket) => bucket.key), hiddenGroupKeys: [...secondaryHidden], collapsedGroupKeys: [...secondaryCollapsed] });
    return runGroupSettingsSubmission({
      guard: submissionRef,
      onError: setSaveError,
      onPendingChange: setPending,
      onSuccess: onClose,
      submit: () => onSave(groups)
    });
  }
  return <div className="dialog-backdrop" onMouseDown={closeIfIdle}><div className="field-dialog group-settings-dialog" role="dialog" aria-modal="true" aria-label="Group settings" aria-busy={pending} onMouseDown={(event) => event.stopPropagation()}>
    <div className="dialog-header"><div><h2>Group records</h2><p>Grouping is saved with this view and does not change row sort order.</p></div><button disabled={pending} onClick={closeIfIdle}>Close</button></div>
    {saveError && <div className="dialog-error" role="alert">{saveError}</div>}
    <fieldset disabled={pending} style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}>
    <label>Group by<select aria-label="Group by" value={primaryId} onChange={(event) => { setPrimaryId(event.target.value); setSecondaryId(""); setOrder("manual"); setHideEmpty(false); setHidden(new Set()); setCollapsed(new Set()); setSecondaryOrder("manual"); setSecondaryHideEmpty(false); setSecondaryHidden(new Set()); setSecondaryCollapsed(new Set()); }}><option value="">No grouping</option>{fields.filter(isGroupableField).map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label>
    {primary && <><label>Sub-group<select aria-label="Sub-group by" value={secondaryId} onChange={(event) => { setSecondaryId(event.target.value); setSecondaryOrder("manual"); setSecondaryHideEmpty(false); setSecondaryHidden(new Set()); setSecondaryCollapsed(new Set()); }}><option value="">None</option>{fields.filter((field) => field.id !== primary.id && isGroupableField(field)).map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label><label>Group order<select aria-label="Group order" value={order} onChange={(event) => setOrder(event.target.value as ViewGroup["order"])}><option value="manual">Property option order</option><option value="asc">Alphabetical</option><option value="desc">Reverse alphabetical</option></select></label><label className="checkbox-row"><input type="checkbox" checked={hideEmpty} onChange={(event) => setHideEmpty(event.target.checked)} /> Hide empty groups</label><BucketSettings buckets={preview} hidden={hidden} collapsed={collapsed} onHidden={setHidden} onCollapsed={setCollapsed} />{secondary && <div className="subgroup-settings"><h3>Sub-group settings</h3><label>Sub-group order<select aria-label="Sub-group order" value={secondaryOrder} onChange={(event) => setSecondaryOrder(event.target.value as ViewGroup["order"])}><option value="manual">Property option order</option><option value="asc">Alphabetical</option><option value="desc">Reverse alphabetical</option></select></label><label className="checkbox-row"><input type="checkbox" checked={secondaryHideEmpty} onChange={(event) => setSecondaryHideEmpty(event.target.checked)} /> Hide empty sub-groups</label><BucketSettings buckets={secondaryPreview} hidden={secondaryHidden} collapsed={secondaryCollapsed} onHidden={setSecondaryHidden} onCollapsed={setSecondaryCollapsed} /></div>}</>}
    <div className="dialog-actions"><button onClick={closeIfIdle}>Cancel</button><button className="primary" onClick={() => void save()}>{pending ? "Saving grouping…" : "Save grouping"}</button></div>
    </fieldset>
  </div></div>;
}

function BucketSettings({ buckets, hidden, collapsed, onHidden, onCollapsed }: { buckets: ReturnType<typeof groupDatabaseRecords>; hidden: Set<string>; collapsed: Set<string>; onHidden: (value: Set<string>) => void; onCollapsed: (value: Set<string>) => void }) {
  return <div className="group-bucket-settings">{buckets.map((bucket) => <div key={bucket.key}><strong>{bucket.label}<small>{bucket.records.length}</small></strong><label><input type="checkbox" aria-label={`Show ${bucket.label}`} checked={!hidden.has(bucket.key)} onChange={(event) => onHidden(toggleSet(hidden, bucket.key, !event.target.checked))} /> Show</label><label><input type="checkbox" aria-label={`Collapse ${bucket.label}`} checked={collapsed.has(bucket.key)} onChange={(event) => onCollapsed(toggleSet(collapsed, bucket.key, event.target.checked))} /> Collapsed</label></div>)}</div>;
}
function toggleSet(source: Set<string>, key: string, add: boolean): Set<string> { const next = new Set(source); if (add) next.add(key); else next.delete(key); return next; }
