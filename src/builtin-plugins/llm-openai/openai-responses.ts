import type { AICompleteRequest } from "../../shared/plugin-api.js";
import type { OpenAILLMSettings } from "./settings.js";
import type { LLMToolDefinition, LLMToolExecutor } from "./llm-transport.js";
import { endpointFor } from "./llm-transport.js";

export interface OpenAIResponsesOptions {
  fetch?: typeof fetch;
  endpoint?: string;
}

type ResponseInputItem =
  | { role: "user" | "developer" | "system" | "assistant"; content: string }
  | { type: "function_call_output"; call_id: string; output: string }
  | Record<string, unknown>;

interface OpenAIResponse {
  id?: string;
  output_text?: string;
  output?: Array<Record<string, unknown>>;
  error?: {
    message?: string;
  };
}

interface FunctionCallItem extends Record<string, unknown> {
  type: "function_call";
  name: string;
  arguments: string;
  call_id: string;
}

export async function completeWithOpenAIResponses(
  settings: OpenAILLMSettings,
  request: AICompleteRequest,
  tools: LLMToolDefinition[],
  executor: LLMToolExecutor,
  options: OpenAIResponsesOptions = {}
): Promise<string> {
  if (!settings.apiKey.trim()) {
    throw new Error(`${settings.providerLabel} API key is not configured.`);
  }
  const fetchImpl = options.fetch ?? fetch;
  const endpoint = options.endpoint ?? endpointFor(settings.baseUrl, "responses");
  const input: ResponseInputItem[] = [
    {
      role: "user",
      content: request.prompt
    }
  ];
  const instructions = [
    request.system,
    "You are the Lotion workspace assistant. Use Lotion tools when you need current workspace data or need to make an allowed workspace change. Do not claim that a write happened unless a Lotion tool returned success."
  ].filter(Boolean).join("\n\n");

  for (let i = 0; i < settings.maxToolIterations; i += 1) {
    const response = await createResponse(fetchImpl, endpoint, settings, input, tools, instructions, request);
    const calls = functionCalls(response);
    if (calls.length === 0) return outputText(response);

    if (Array.isArray(response.output)) input.push(...response.output);
    for (const call of calls) {
      const output = await executor.execute({
        name: call.name,
        arguments: parseToolArguments(call.arguments)
      });
      input.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(output)
      });
    }
  }

  throw new Error(`${settings.providerLabel} response exceeded ${settings.maxToolIterations} tool iterations.`);
}

async function createResponse(
  fetchImpl: typeof fetch,
  endpoint: string,
  settings: OpenAILLMSettings,
  input: ResponseInputItem[],
  tools: LLMToolDefinition[],
  instructions: string,
  request: AICompleteRequest
): Promise<OpenAIResponse> {
  const body: Record<string, unknown> = {
    model: settings.model,
    input,
    tools
  };
  if (instructions) body.instructions = instructions;
  if (request.maxTokens) body.max_output_tokens = request.maxTokens;
  if (request.temperature !== undefined) body.temperature = request.temperature;

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify(body)
  });

  let payload: OpenAIResponse;
  try {
    payload = await response.json() as OpenAIResponse;
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload.error?.message || `${settings.providerLabel} request failed with HTTP ${response.status}`);
  }
  return payload;
}

function functionCalls(response: OpenAIResponse): FunctionCallItem[] {
  return (response.output ?? [])
    .filter((item): item is FunctionCallItem => (
      item.type === "function_call" &&
      typeof item.name === "string" &&
      typeof item.arguments === "string" &&
      typeof item.call_id === "string"
    ));
}

function outputText(response: OpenAIResponse): string {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }
  const parts: string[] = [];
  for (const item of response.output ?? []) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (
        content &&
        typeof content === "object" &&
        "type" in content &&
        content.type === "output_text" &&
        "text" in content &&
        typeof content.text === "string"
      ) {
        parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

function parseToolArguments(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("OpenAI tool arguments must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}
