import type { MutableRefObject, ReactNode, RefObject, WheelEvent } from "react";
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
  renderColGroup: () => ReactNode;
  renderHead: () => ReactNode;
  renderCell: (record: DatabaseRecord, field: FieldSchema) => ReactNode;
  renderRowActions?: (record: DatabaseRecord) => ReactNode;
  addRowLabel: string;
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
  renderColGroup,
  renderHead,
  renderCell,
  renderRowActions,
  addRowLabel
}: DatabaseTableGridProps) {
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
            {topSpacerHeight > 0 && (
              <tr aria-hidden="true" className="virtual-spacer" style={{ height: topSpacerHeight }}>
                <td colSpan={fields.length + 2} />
              </tr>
            )}
            {visibleRecords.map((record, i) => {
              const rowId = String(record.id);
              return (
                <tr
                  key={rowId}
                  data-row-id={rowId}
                  ref={(node) => {
                    if (node) rowNodesRef.current.set(rowId, node);
                    else rowNodesRef.current.delete(rowId);
                  }}
                >
                  <td className="row-num">{startIndex + i + 1}</td>
                  {fields.map((field) => (
                    <td key={field.id}>
                      {renderCell(record, field)}
                    </td>
                  ))}
                  {renderRowActions && (
                    <td className="row-actions">
                      {renderRowActions(record)}
                    </td>
                  )}
                </tr>
              );
            })}
            {bottomSpacerHeight > 0 && (
              <tr aria-hidden="true" className="virtual-spacer" style={{ height: bottomSpacerHeight }}>
                <td colSpan={fields.length + 2} />
              </tr>
            )}
            {endIndex >= tableRecords.length && !hiddenEmbeddedRows && (
              <tr className="add-row" onClick={onAddRow}>
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
