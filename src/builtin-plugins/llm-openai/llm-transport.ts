export interface LLMToolDefinition {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LLMToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMToolExecutor {
  execute(call: LLMToolCall): Promise<unknown>;
}

export function endpointFor(baseUrl: string, path: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  if (!normalized) return path;
  return `${normalized}/${path.replace(/^\/+/, "")}`;
}
