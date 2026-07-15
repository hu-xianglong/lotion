import type { AICompleteRequest } from "../../shared/plugin-api.js";
import type { OpenAILLMSettings } from "./settings.js";
import type { LLMToolDefinition, LLMToolExecutor } from "./llm-transport.js";
import { endpointFor } from "./llm-transport.js";

export interface OpenAIChatCompletionsOptions {
  fetch?: typeof fetch;
  endpoint?: string;
}

type ChatMessage =
  | { role: "system" | "user" | "assistant"; content: string | null; tool_calls?: ChatToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface ChatToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: ChatToolCall[];
    };
  }>;
  error?: {
    message?: string;
  };
}

export async function completeWithOpenAICompatibleChat(
  settings: OpenAILLMSettings,
  request: AICompleteRequest,
  tools: LLMToolDefinition[],
  executor: LLMToolExecutor,
  options: OpenAIChatCompletionsOptions = {}
): Promise<string> {
  if (!settings.apiKey.trim()) {
    throw new Error(`${settings.providerLabel} API key is not configured.`);
  }
  const fetchImpl = options.fetch ?? fetch;
  const endpoint = options.endpoint ?? endpointFor(settings.baseUrl, "chat/completions");
  const instructions = [
    request.system,
    "You are the Lotion workspace assistant. Use Lotion tools when you need current workspace data or need to make an allowed workspace change. Do not claim that a write happened unless a Lotion tool returned success."
  ].filter(Boolean).join("\n\n");

  const messages: ChatMessage[] = [];
  if (instructions) messages.push({ role: "system", content: instructions });
  messages.push({ role: "user", content: request.prompt });

  for (let i = 0; i < settings.maxToolIterations; i += 1) {
    const response = await createChatCompletion(fetchImpl, endpoint, settings, messages, tools, request);
    const message = response.choices?.[0]?.message;
    if (!message) return "";
    const calls = message.tool_calls ?? [];
    if (calls.length === 0) return (message.content ?? "").trim();

    messages.push({
      role: "assistant",
      content: message.content ?? null,
      tool_calls: calls
    });
    for (const call of calls) {
      const output = await executor.execute({
        name: call.function.name,
        arguments: parseToolArguments(call.function.arguments)
      });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(output)
      });
    }
  }

  throw new Error(`${settings.providerLabel} response exceeded ${settings.maxToolIterations} tool iterations.`);
}

async function createChatCompletion(
  fetchImpl: typeof fetch,
  endpoint: string,
  settings: OpenAILLMSettings,
  messages: ChatMessage[],
  tools: LLMToolDefinition[],
  request: AICompleteRequest
): Promise<ChatCompletionResponse> {
  const body: Record<string, unknown> = {
    model: settings.model,
    messages,
    tools: tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }))
  };
  if (request.maxTokens) body.max_tokens = request.maxTokens;
  if (request.temperature !== undefined) body.temperature = request.temperature;

  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify(body)
  });

  let payload: ChatCompletionResponse;
  try {
    payload = await response.json() as ChatCompletionResponse;
  } catch {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload.error?.message || `${settings.providerLabel} request failed with HTTP ${response.status}`);
  }
  return payload;
}

function parseToolArguments(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("LLM tool arguments must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}
