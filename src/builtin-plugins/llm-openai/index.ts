import type { AICompletionProvider, PluginContext, PluginManifest } from "../../shared/plugin-api.js";
import { openOpenAILLMChat } from "./chat-ui.js";
import { completeOpenAILLMRequest, type OpenAILLMInstallOptions } from "./completion.js";
import { activePageSystemContext } from "./page-context.js";
import { renderOpenAILLMSettings } from "./settings-ui.js";

declare global {
  interface Window {
    __lotionEditorSelectionText?: string;
    __lotionEditorSelectionUpdatedAt?: number;
  }
}

export const manifest: PluginManifest = {
  id: "llm-openai",
  name: "LLM Providers",
  version: "0.0.1",
  description: "OpenAI and OpenAI-compatible LLM providers with Lotion workspace tools.",
  permissions: ["workspace.read", "workspace.write", "network"]
};

export function installOpenAILLM(ctx: PluginContext, options: OpenAILLMInstallOptions = {}): void {
  const provider: AICompletionProvider = {
    type: "openai.responses",
    label: "LLM Provider",
    complete: (req) => completeOpenAILLMRequest(ctx, options, req)
  };

  ctx.ai_providers.register(provider);
  ctx.sidebar.register({
    id: "llm-openai.chat",
    title: "LLM Chat",
    icon: "✦",
    order: 900,
    onClick: () => {
      void openOpenAILLMChat(ctx, options);
    }
  });
  ctx.commands.register({
    id: "llm-openai.chat",
    title: "Open LLM Chat",
    category: "AI",
    run: () => openOpenAILLMChat(ctx, options)
  });
  ctx.commands.register({
    id: "llm-openai.ask-selection",
    title: "Ask LLM about selection",
    category: "AI",
    run: () => {
      const selectedText = readCurrentSelectionText();
      return openOpenAILLMChat(ctx, options, selectedText
        ? {
            initialPrompt: [
              "Help me work with this selected text:",
              "",
              selectedText
            ].join("\n"),
            initialStatus: "Selected text loaded. Edit the prompt or send it."
          }
        : {
            initialStatus: "Select text first or type a prompt."
          });
    }
  });
  ctx.commands.register({
    id: "llm-openai.ask",
    title: "Ask LLM",
    category: "AI",
    run: async () => {
      const prompt = await ctx.ui.prompt("Ask LLM");
      if (!prompt) return;
      try {
        const answer = await ctx.ai.complete({
          prompt,
          system: await activePageSystemContext(ctx)
        });
        ctx.ui.notify(answer, "info");
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    }
  });
  ctx.commands.register({
    id: "llm-openai.draft-page",
    title: "Draft Page with LLM",
    category: "AI",
    run: async () => {
      const title = await ctx.ui.prompt("New page title", "AI Draft");
      if (!title?.trim()) return;
      const instruction = await ctx.ui.prompt("Draft instructions");
      if (!instruction?.trim()) return;
      try {
        const markdown = normalizeGeneratedMarkdown(await ctx.ai.complete({
          prompt: [
            `Draft a Markdown page titled "${title.trim()}".`,
            "",
            "User instruction:",
            instruction.trim(),
            "",
            "Return only the Markdown body. Do not wrap it in a code fence."
          ].join("\n"),
          system: [
            await activePageSystemContext(ctx),
            "You draft concise, well-structured Markdown for Lotion pages."
          ].filter(Boolean).join("\n\n")
        }));
        const page = await ctx.workspace.createPage({ title: title.trim() });
        await ctx.workspace.updatePage(page.id, { markdown });
        ctx.ui.openEntity({
          kind: "page",
          entityId: page.id,
          titleSnapshot: page.title
        });
        ctx.ui.notify(`Created page: ${page.title}`, "info");
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
    }
  });
  ctx.settingsTabs.register({
    id: "llm-openai.settings",
    title: "LLM Providers",
    render: (el) => renderOpenAILLMSettings(el, ctx, options)
  });
}

function normalizeGeneratedMarkdown(markdown: string): string {
  const trimmed = markdown.trim();
  const fenceMatch = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed);
  return (fenceMatch ? fenceMatch[1] : trimmed).trimEnd();
}

function readCurrentSelectionText(): string {
  if (typeof window === "undefined") return "";
  const liveText = window.getSelection()?.toString() ?? "";
  const cachedText = typeof window.__lotionEditorSelectionText === "string"
    && typeof window.__lotionEditorSelectionUpdatedAt === "number"
    && Date.now() - window.__lotionEditorSelectionUpdatedAt < 30_000
    ? window.__lotionEditorSelectionText
    : "";
  delete window.__lotionEditorSelectionText;
  delete window.__lotionEditorSelectionUpdatedAt;
  return (liveText || cachedText)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 8000);
}
