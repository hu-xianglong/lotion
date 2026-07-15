import { writeTextFile } from "./json-file.js";
import type { DatabaseRecord, RecordValue } from "../../shared/types.js";
import { fileService } from "../services/file-service.js";

export async function readCsvFile(path: string): Promise<DatabaseRecord[]> {
  const tStart = performance.now();
  let content = "";
  try {
    content = await fileService.readText(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw error;
  }
  const tRead = performance.now();

  const rows = parseCsv(content.trim());
  const tParse = performance.now();

  if (rows.length === 0) return [];
  const [headers, ...records] = rows;

  const result = records.map((row) => {
    const record: DatabaseRecord = {};
    for (let index = 0; index < headers.length; index += 1) {
      record[headers[index]] = parseCell(row[index] ?? "");
    }
    return record;
  });
  const tEnd = performance.now();

  safeLog(
    `[lotion main] csv read   path=${path.split("/").slice(-3).join("/")} ` +
    `bytes=${content.length} rows=${result.length} ` +
    `read=${(tRead - tStart).toFixed(1)}ms parse=${(tParse - tRead).toFixed(1)}ms build=${(tEnd - tParse).toFixed(1)}ms ` +
    `total=${(tEnd - tStart).toFixed(1)}ms`
  );

  return result;
}

export async function writeCsvFile(path: string, headers: string[], records: DatabaseRecord[]): Promise<void> {
  const rows = [
    headers,
    ...records.map((record) => headers.map((header) => serializeCell(record[header])))
  ];
  const content = `${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n")}\n`;
  await writeTextFile(path, content);
}

let stdoutErrorHandlerInstalled = false;

function safeLog(message: string): void {
  // Dev runners can close stdout while Electron is still reading large CSVs.
  // `console.log` can then emit an async EPIPE outside a try/catch, so write
  // directly and swallow stream errors.
  if (!stdoutErrorHandlerInstalled) {
    stdoutErrorHandlerInstalled = true;
    process.stdout.on("error", () => undefined);
  }
  if (!process.stdout.writable || process.stdout.destroyed) return;
  process.stdout.write(`${message}\n`, () => undefined);
}

function parseCell(value: string): RecordValue {
  if (value === "") return "";
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function serializeCell(value: RecordValue | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function parseCsv(content: string): string[][] {
  if (!content) return [];
  if (!content.includes("\"")) return parseSimpleCsv(content);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === "\"" && inQuotes && next === "\"") {
      cell += "\"";
      index += 1;
    } else if (char === "\"") {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" && !inQuotes) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function parseSimpleCsv(content: string): string[][] {
  return content.split("\n").map((line) => {
    const normalized = line.endsWith("\r") ? line.slice(0, -1) : line;
    return normalized.split(",");
  });
}

function escapeCsvCell(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replaceAll("\"", "\"\"")}"`;
  }
  return value;
}
