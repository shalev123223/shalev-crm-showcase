// Portfolio excerpt from Shalev CRM (src/lib/ai/tools/types.ts). Shown for reading only; not runnable on its own.
// Imports point at modules not included in this repository.

import type { z } from "zod";
import type { ToolCategory } from "@/lib/ai/approval-policy";

export type ToolResult = { data?: unknown; error?: string };

/**
 * ToolContext carries nothing privileged — every handler calls the existing
 * Phase 2 server actions (src/lib/actions/*), which resolve their own
 * Supabase client from the authenticated request. This is the enforcement
 * point for "tools execute under the authenticated user's permissions, not
 * a service-role client" (docs/SECURITY.md).
 */
export type ToolContext = Record<string, never>;

export type ToolDefinition<TInput = unknown> = {
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: z.ZodType<TInput>;
  handler: (input: TInput, ctx: ToolContext) => Promise<ToolResult>;
};
