// Portfolio excerpt from Shalev CRM (src/lib/ai/tools/registry.ts). Shown for reading only; not runnable on its own.
// Imports point at modules not included in this repository.

import { z } from "zod";
import type { ToolDefinition } from "@/lib/ai/tools/types";
import type { AIJSONSchema, AIToolDef } from "@/lib/ai/provider";

/**
 * The Tool Registry — the application's source of truth for what the AI may
 * call (docs/AI_AGENT.md, docs/DECISIONS.md ADR-007). Tools are registered
 * once at module load (see tools/index.ts) and looked up by name; a name
 * not in this map is never invoked, regardless of what a model requests —
 * this is the enforcement point for "the model cannot invent unknown
 * tools."
 */
class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition<unknown>>();

  register<TInput>(tool: ToolDefinition<TInput>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered.`);
    }
    this.tools.set(tool.name, tool as ToolDefinition<unknown>);
  }

  get(name: string): ToolDefinition<unknown> | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition<unknown>[] {
    return Array.from(this.tools.values());
  }

  /** JSON Schema tool definitions for the AI provider — see src/lib/ai/provider.ts. */
  toProviderToolDefs(): AIToolDef[] {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: toJSONSchema(tool.inputSchema),
    }));
  }
}

function toJSONSchema(schema: z.ZodType<unknown>): AIJSONSchema {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-7" }) as AIJSONSchema;
  delete jsonSchema.$schema;
  return jsonSchema;
}

export const toolRegistry = new ToolRegistry();
