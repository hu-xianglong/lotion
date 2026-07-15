import type { ReactNode } from "react";
import type { FieldRenderContext, FieldTypeProvider } from "./plugin-api.js";
import type { RecordValue, SelectOption } from "./types.js";

/**
 * Optional React renderer extension for field providers.
 *
 * The base plugin API stays framework-agnostic and accepts DOM nodes.
 * Lotion's renderer can also consume this React shape so built-in and
 * React-based plugins do not mount a React root per cell.
 */
export interface ReactFieldTypeProvider extends FieldTypeProvider {
  renderReact?(value: RecordValue, ctx: RendererFieldRenderContext): ReactNode;
}

export interface RendererFieldRenderContext extends FieldRenderContext {
  commit?(value: RecordValue): void;
  onOptionsChange?(options: SelectOption[]): void;
  wrap?: boolean;
  placeholder?: string;
}

export function isReactProvider(
  provider: FieldTypeProvider
): provider is ReactFieldTypeProvider {
  return typeof (provider as ReactFieldTypeProvider).renderReact === "function";
}
