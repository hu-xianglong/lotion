import { fileService } from "../services/file-service.js";

export async function readJsonFile<T>(path: string): Promise<T> {
  const content = await fileService.readText(path);
  return JSON.parse(content) as T;
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  await writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeTextFile(path: string, value: string): Promise<void> {
  await fileService.writeTextAtomic(path, value);
}
