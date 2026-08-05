import { format, isValid, parse, parseISO } from "date-fns";
import type { DateDisplayFormat, FieldSchema, FieldType, TimeDisplayFormat } from "./types.js";

export interface DateTimeDisplayDefaults {
  dateFormat: DateDisplayFormat;
  timeFormat: TimeDisplayFormat;
}

export const DEFAULT_DATE_DISPLAY_FORMAT: DateDisplayFormat = "month_day_year";
export const DEFAULT_TIME_DISPLAY_FORMAT: TimeDisplayFormat = "h12";

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
  if (!isValidDateValue(value)) return "";
  const date = parseDateValue(value);
  return date ? format(date, "yyyy-MM-dd") : "";
}

export function parseDateValue(value: unknown): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return parseDateSegment(firstDateSegment(raw));
}

export function isValidDateValue(value: unknown): boolean {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  const segments = raw.split(DATE_RANGE_SEPARATOR).map(normalizeDateSegmentInput).filter(Boolean);
  return segments.length > 0 && segments.length <= 2 && segments.every((segment) => Boolean(parseDateTimeSegment(segment)));
}

function parseDateSegment(segment: string): Date | null {
  const isoDate = segment.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]|$)/);
  if (isoDate) {
    const year = Number(isoDate[1]);
    const month = Number(isoDate[2]);
    const day = Number(isoDate[3]);
    if (!isValidCalendarDate(year, month, day)) return null;
    const date = new Date(0);
    date.setHours(0, 0, 0, 0);
    date.setFullYear(year, month - 1, day);
    return date;
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

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = month === 2
    ? (isLeapYear(year) ? 29 : 28)
    : ([4, 6, 9, 11].includes(month) ? 30 : 31);
  return day <= daysInMonth;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

export function parseDateTimeValue(value: unknown): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  return parseDateTimeSegment(firstDateSegment(raw));
}

function parseDateTimeSegment(segment: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}/.test(segment)) {
    const iso = parseISO(segment.replace(" ", "T"));
    return isValid(iso) ? iso : null;
  }

  return parseDateSegment(segment);
}

export function isDateLikeFieldType(type: FieldType | string): boolean {
  return type === "date" || type === "created_time" || type === "updated_time";
}

export function defaultDateFormatForField(type: FieldType | string): DateDisplayFormat {
  return isDateLikeFieldType(type) ? DEFAULT_DATE_DISPLAY_FORMAT : "iso";
}

export function defaultTimeFormatForField(type: FieldType | string): TimeDisplayFormat {
  return type === "created_time" || type === "updated_time" ? DEFAULT_TIME_DISPLAY_FORMAT : "none";
}

export function resolveDateFormatForField(
  field: Pick<FieldSchema, "type" | "dateFormat">,
  defaults?: Partial<DateTimeDisplayDefaults>
): DateDisplayFormat {
  return field.dateFormat ?? defaults?.dateFormat ?? defaultDateFormatForField(field.type);
}

export function resolveTimeFormatForField(
  field: Pick<FieldSchema, "type" | "timeFormat">,
  defaults?: Partial<DateTimeDisplayDefaults>
): TimeDisplayFormat {
  if (field.timeFormat) return field.timeFormat;
  if (field.type === "created_time" || field.type === "updated_time") {
    return defaults?.timeFormat ?? defaultTimeFormatForField(field.type);
  }
  return defaultTimeFormatForField(field.type);
}

export function formatDateForField(
  value: unknown,
  field: Pick<FieldSchema, "type" | "dateFormat" | "timeFormat">,
  defaults?: Partial<DateTimeDisplayDefaults>
): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const dateFormat = resolveDateFormatForField(field, defaults);
  const timeFormat = resolveTimeFormatForField(field, defaults);
  const shouldShowTime = timeFormat !== "none" && (field.type !== "date" || hasExplicitTime(raw));
  const date = shouldShowTime ? parseDateTimeValue(raw) : parseDateValue(raw);
  if (!date) return raw;

  const dateText = format(date, datePattern(dateFormat));
  if (!shouldShowTime) return dateText;
  return `${dateText} ${format(date, timePattern(timeFormat))}`;
}

function firstDateSegment(value: string): string {
  return normalizeDateSegmentInput(value.split(DATE_RANGE_SEPARATOR, 1)[0]);
}

function normalizeDateSegmentInput(value: string): string {
  return value
    .replace(/\s+at\s+/i, " ")
    .trim();
}

const DATE_RANGE_SEPARATOR = /\s+(?:→|->|–|—|to)\s+/i;

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
