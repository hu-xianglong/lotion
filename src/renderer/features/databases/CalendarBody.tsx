import { useMemo, useState } from "react";
import type { DatabaseRecord, FieldSchema, TableView } from "../../../shared/types";
import { parseDateValue } from "../../../shared/date-values";
import { EntityIcon } from "../../components/EntityIcon";
import { resolveRowIcon } from "../../../shared/row-icons";

interface CalendarBodyProps {
  records: DatabaseRecord[];
  fields: FieldSchema[];
  view: TableView;
  databaseIcon?: string;
  onOpenRow: (rowId: string) => void;
}

const WEEKDAYS_ZH = ["日", "一", "二", "三", "四", "五", "六"];

/**
 * Month-grid calendar view. Picks the date for each row from
 * `view.dateFieldId` (or, if unset, the first date-typed field, then
 * the `created_time` system column as a last resort). Rows whose date
 * lands inside the current month show up as compact title chips on
 * their day cell — clicking opens the row detail page.
 *
 * Date parsing is permissive: imported Notion date fields can be ISO,
 * slash-separated, or month-name strings. Anything that fails to parse
 * is silently dropped.
 */
export function CalendarBody({ records, fields, view, databaseIcon, onOpenRow }: CalendarBodyProps) {
  // Default to today's month when first mounted. The user can step
  // through months with the toolbar arrows.
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set());

  const dateFieldId = useMemo(() => {
    if (view.dateFieldId) return view.dateFieldId;
    const dateField = fields.find((f) => f.type === "date");
    if (dateField) return dateField.id;
    return "created_time";
  }, [view.dateFieldId, fields]);

  const byDay = useMemo(() => {
    const map = new Map<string, DatabaseRecord[]>();
    for (const record of records) {
      const raw = record[dateFieldId];
      if (raw === undefined || raw === null || raw === "") continue;
      const date = parseDateValue(raw);
      if (!date) continue;
      if (date.getFullYear() !== cursor.year || date.getMonth() !== cursor.month) continue;
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const list = map.get(key) || [];
      list.push(record);
      map.set(key, list);
    }
    return map;
  }, [records, dateFieldId, cursor]);

  // First-of-month + how many cells we need for the leading blanks
  // (Sun-based week). Total cells = leading blanks + days in month,
  // rounded up to the nearest multiple of 7 so the trailing row is
  // complete.
  const first = new Date(cursor.year, cursor.month, 1);
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const leading = first.getDay();
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;
  const today = new Date();
  const todayInCursorMonth = today.getFullYear() === cursor.year && today.getMonth() === cursor.month;

  function step(delta: number) {
    setExpandedDays(new Set());
    setCursor((c) => {
      const next = new Date(c.year, c.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  function toggleExpandedDay(key: string) {
    setExpandedDays((days) => {
      const next = new Set(days);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <div className="calendar-body">
      <div className="calendar-toolbar">
        <button type="button" className="calendar-nav" onClick={() => step(-1)}>‹</button>
        <span className="calendar-month-label">
          {cursor.year} 年 {cursor.month + 1} 月
        </span>
        <button type="button" className="calendar-nav" onClick={() => step(1)}>›</button>
        <button
          type="button"
          className="calendar-today"
          onClick={() => {
            const now = new Date();
            setExpandedDays(new Set());
            setCursor({ year: now.getFullYear(), month: now.getMonth() });
          }}
        >
          今天
        </button>
      </div>
      <div className="calendar-grid">
        {WEEKDAYS_ZH.map((d) => (
          <div key={d} className="calendar-weekday">{d}</div>
        ))}
        {Array.from({ length: totalCells }).map((_, idx) => {
          const dayNum = idx - leading + 1;
          if (dayNum < 1 || dayNum > daysInMonth) {
            return <div key={idx} className="calendar-cell empty" />;
          }
          const key = `${cursor.year}-${cursor.month}-${dayNum}`;
          const rows = byDay.get(key) || [];
          const isToday = todayInCursorMonth && today.getDate() === dayNum;
          const isExpanded = expandedDays.has(key);
          const visibleRows = isExpanded ? rows : rows.slice(0, 3);
          return (
            <div
              key={idx}
              className={`calendar-cell${isToday ? " today" : ""}`}
              aria-current={isToday ? "date" : undefined}
            >
              <div className="calendar-cell-day">{dayNum}</div>
              {visibleRows.map((record) => (
                <button
                  key={String(record.id)}
                  type="button"
                  className="calendar-cell-row"
                  onClick={() => onOpenRow(String(record.id))}
                  title={String(record.title ?? "")}
                >
                  <EntityIcon kind="row_page" icon={resolveRowIcon(record, databaseIcon)} size={12} />
                  <span>{String(record.title ?? "") || "Untitled"}</span>
                </button>
              ))}
              {rows.length > 3 && (
                <button
                  type="button"
                  className="calendar-cell-more"
                  onClick={() => toggleExpandedDay(key)}
                  aria-expanded={isExpanded}
                >
                  {isExpanded ? "收起" : `+${rows.length - 3}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
