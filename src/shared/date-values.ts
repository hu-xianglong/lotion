import { format, isValid, parse, parseISO } from "date-fns";
import type { DateDisplayFormat, FieldSchema, FieldType, TimeDisplayFormat } from "./types.js";

const DATE_FORMATS = [
  "yyyy-MM-dd",
  "yyyy/M/d",
  "yyyy/MM/dd",
  "yyyy.M.d",
  "yyyy.MM.dd",
  "M/d/yyyy",
  "MM/dd/yyyy",
  "M-d-yyyy",
  "MM-dd-yyyy",
  "EEEE, MMMM d, yyyy",
  "EEE, MMM d, yyyy",
  "MMMM d, yyyy",
  "MMM d, yyyy",
  "MMMM d, yyyy h:mm a",
  "MMM d, yyyy h:mm a",
  "yyyy年M月d日"
];

export function normalizeDateValue(value: unknown): string {
  const date = parseDateValue(value);
  return date ? format(date, "yyyy-MM-dd") : "";
}

export function parseDateValue(value: unknown): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const segment = firstDateSegment(raw);
  const isoDate = segment.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]|$)/);
  if (isoDate) {
    return new Date(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]));
  }

  const iso = parseISO(segment);
  if (isValid(iso)) return iso;

  const reference = new Date(2000, 0, 1);
  for (const pattern of DATE_FORMATS) {
    const parsed = parse(segment, pattern, reference);
    if (isValid(parsed)) return parsed;
  }
  return null;
}

export function parseDateTimeValue(value: unknown): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const segment = firstDateSegment(raw);
  if (/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(segment)) {
    const iso = parseISO(segment.replace(" ", "T"));
    if (isValid(iso)) return iso;
  }

  return parseDateValue(segment);
}

export function isDateLikeFieldType(type: FieldType | string): boolean {
  return type === "date" || type === "created_time" || type === "updated_time";
}

export function defaultDateFormatForField(type: FieldType | string): DateDisplayFormat {
  return isDateLikeFieldType(type) ? "month_day_year" : "iso";
}

export function defaultTimeFormatForField(type: FieldType | string): TimeDisplayFormat {
  return type === "created_time" || type === "updated_time" ? "h12" : "none";
}

export function formatDateForField(value: unknown, field: Pick<FieldSchema, "type" | "dateFormat" | "timeFormat">): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const dateFormat = field.dateFormat ?? defaultDateFormatForField(field.type);
  const timeFormat = field.timeFormat ?? defaultTimeFormatForField(field.type);
  const shouldShowTime = timeFormat !== "none" && (field.type !== "date" || hasExplicitTime(raw));
  const date = shouldShowTime ? parseDateTimeValue(raw) : parseDateValue(raw);
  if (!date) return raw;

  const dateText = format(date, datePattern(dateFormat));
  if (!shouldShowTime) return dateText;
  return `${dateText} ${format(date, timePattern(timeFormat))}`;
}

function firstDateSegment(value: string): string {
  return value
    .split(/\s+(?:→|->|–|—|to)\s+/i, 1)[0]
    .replace(/\s+at\s+/i, " ")
    .trim();
}

function datePattern(formatId: DateDisplayFormat): string {
  if (formatId === "full") return "EEEE, MMMM d, yyyy";
  if (formatId === "day_month_year") return "d MMMM yyyy";
  if (formatId === "year_month_day") return "yyyy MMMM d";
  if (formatId === "iso") return "yyyy-MM-dd";
  return "MMMM d, yyyy";
}

function timePattern(formatId: TimeDisplayFormat): string {
  return formatId === "h24" ? "HH:mm" : "h:mm a";
}

function hasExplicitTime(value: string): boolean {
  return /(?:T|\s)\d{1,2}:\d{2}/.test(value) || /\b\d{1,2}:\d{2}\s*(?:AM|PM)\b/i.test(value);
}
