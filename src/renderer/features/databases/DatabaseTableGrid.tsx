import type { CSSProperties, MutableRefObject, ReactNode, RefObject, WheelEvent } from "react";
import type { DatabaseRecord, FieldSchema } from "../../../shared/types";

interface DatabaseTableGridProps {
  embedded: boolean;
  fields: FieldSchema[];
  tableRecords: DatabaseRecord[];
  visibleRecords: DatabaseRecord[];
  startIndex: number;
  endIndex: number;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
  renderedTableWidth: number;
  scrollLeft: number;
  hiddenEmbeddedRows: boolean;
  tableScrollRef: RefObject<HTMLDivElement | null>;
  rowNodesRef: MutableRefObject<Map<string, HTMLTableRowElement>>;
  onWheel?: (event: WheelEvent<HTMLDivElement>) => void;
  onAddRow: () => void;
  addRowDisabled?: boolean;
  renderColGroup: () => ReactNode;
  renderHead: () => ReactNode;
  renderCell: (record: DatabaseRecord, field: FieldSchema) => ReactNode;
  getFieldCellProps?: (field: FieldSchema, index: number) => { className?: string; style?: CSSProperties };
  getRowNumber: (record: DatabaseRecord) => number;
  rowNumberLabel?: string;
  renderRowActions?: (record: DatabaseRecord) => ReactNode;
  onOpenRowMenu?: (record: DatabaseRecord, anchor: { left: number; top: number }) => void;
  addRowLabel: string;
  selectedRowIds?: ReadonlySet<string>;
  onToggleRowSelection?: (rowId: string, index: number, modifiers: { shiftKey: boolean; toggleKey: boolean }) => void;
  onToggleAllRows?: () => void;
  recordGroups?: DisplayRecordGroup[];
  onToggleGroup?: (groupIndex: number, key: string) => void;
  onAddGroupRow?: (key: string, subgroupKey?: string) => void;
}

interface DisplayRecordGroup {
  key: string;
  label: string;
  records: DatabaseRecord[];
  collapsed: boolean;
  subgroups?: Array<{ key: string; label: string; records: DatabaseRecord[]; collapsed: boolean }>;
}

export function DatabaseTableGrid({
  embedded,
  fields,
  tableRecords,
  visibleRecords,
  startIndex,
  endIndex,
  topSpacerHeight,
  bottomSpacerHeight,
  renderedTableWidth,
  scrollLeft,
  hiddenEmbeddedRows,
  tableScrollRef,
  rowNodesRef,
  onWheel,
  onAddRow,
  addRowDisabled = false,
  renderColGroup,
  renderHead,
  renderCell,
  getFieldCellProps,
  getRowNumber,
  rowNumberLabel = "Formula row",
  renderRowActions,
  onOpenRowMenu,
  addRowLabel
  , selectedRowIds = new Set<string>(), onToggleRowSelection, onToggleAllRows, recordGroups, onToggleGroup, onAddGroupRow
}: DatabaseTableGridProps) {
  const indexById = new Map(tableRecords.map((record, index) => [String(record.id), index]));
  function renderRecord(record: DatabaseRecord, keyPrefix = "") {
    const rowId = String(record.id);
    const rowNumber = getRowNumber(record);
    const recordIndex = indexById.get(rowId) ?? 0;
    return <tr key={`${keyPrefix}${rowId}`} data-row-id={rowId} ref={(node) => { if (node) rowNodesRef.current.set(rowId, node); else rowNodesRef.current.delete(rowId); }} onContextMenu={(event) => { if (!onOpenRowMenu) return; event.preventDefault(); onOpenRowMenu(record, { left: event.clientX, top: event.clientY }); }}>
      <td className="row-num" data-formula-row={rowNumber} title={`${rowNumberLabel} ${rowNumber}`}>{onToggleRowSelection ? <input type="checkbox" aria-label={`Select row ${rowNumber}`} checked={selectedRowIds.has(rowId)} onChange={() => undefined} onClick={(event) => { event.stopPropagation(); onToggleRowSelection(rowId, recordIndex, { shiftKey: event.shiftKey, toggleKey: event.metaKey || event.ctrlKey }); }} /> : rowNumber}</td>
      {fields.map((field, fieldIndex) => <td key={field.id} {...getFieldCellProps?.(field, fieldIndex)}>{renderCell(record, field)}</td>)}
      {renderRowActions && <td className="row-actions">{renderRowActions(record)}</td>}
    </tr>;
  }
  return (
    <>
      {embedded && (
        <div className="table-sticky-header">
          <table style={{ minWidth: renderedTableWidth, marginLeft: -scrollLeft }}>
            {renderColGroup()}
          {renderHead()}
          </table>
        </div>
      )}
      <div className="table-scroll" ref={tableScrollRef} onWheel={onWheel}>
        <table style={{ minWidth: renderedTableWidth }}>
          {renderColGroup()}
          {!embedded && renderHead()}
          <tbody>
            {!recordGroups && topSpacerHeight > 0 && (
              <tr aria-hidden="true" className="virtual-spacer" style={{ height: topSpacerHeight }}>
                <td colSpan={fields.length + 2} />
              </tr>
            )}
            {recordGroups ? recordGroups.flatMap((group) => [
              <tr className="database-group-row" data-group-key={group.key} key={`group-${group.key}`}><td colSpan={fields.length + 2}><div className="database-group-header"><button onClick={() => onToggleGroup?.(0, group.key)} aria-expanded={!group.collapsed}>{group.collapsed ? "▸" : "▾"} {group.label} <span>{group.records.length}</span></button><button disabled={addRowDisabled} aria-label={`Add row to ${group.label}`} onClick={() => onAddGroupRow?.(group.key)}>+ New</button></div></td></tr>,
              ...(group.collapsed ? [] : group.subgroups ? group.subgroups.flatMap((subgroup) => [
                <tr className="database-group-row database-subgroup-row" data-group-key={group.key} data-subgroup-key={subgroup.key} key={`subgroup-${group.key}-${subgroup.key}`}><td colSpan={fields.length + 2}><div className="database-group-header"><button onClick={() => onToggleGroup?.(1, subgroup.key)} aria-expanded={!subgroup.collapsed}>{subgroup.collapsed ? "▸" : "▾"} {subgroup.label} <span>{subgroup.records.length}</span></button><button disabled={addRowDisabled} aria-label={`Add row to ${group.label} / ${subgroup.label}`} onClick={() => onAddGroupRow?.(group.key, subgroup.key)}>+ New</button></div></td></tr>,
                ...(subgroup.collapsed ? [] : subgroup.records.map((record) => renderRecord(record, `${group.key}:${subgroup.key}:`)))
              ]) : group.records.map((record) => renderRecord(record, `${group.key}:`)))
            ]) : visibleRecords.map((record) => renderRecord(record))}
            {!recordGroups && bottomSpacerHeight > 0 && (
              <tr aria-hidden="true" className="virtual-spacer" style={{ height: bottomSpacerHeight }}>
                <td colSpan={fields.length + 2} />
              </tr>
            )}
            {endIndex >= tableRecords.length && !hiddenEmbeddedRows && (
              <tr className={addRowDisabled ? "add-row disabled" : "add-row"} aria-disabled={addRowDisabled} onClick={addRowDisabled ? undefined : onAddRow}>
                <td className="row-num" />
                <td className="add-row-cell" colSpan={fields.length + (embedded ? 0 : 1)}>
                  {addRowLabel}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
