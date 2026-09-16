// Portfolio excerpt from Shalev CRM (src/lib/ai/execute.ts). Shown for reading only; not runnable on its own.
// Imports point at modules not included in this repository.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ensureToolsRegistered, toolRegistry } from "@/lib/ai/tools";
import type { ToolDefinition } from "@/lib/ai/tools/types";
import { requiresApproval } from "@/lib/ai/approval-policy";
import { verifyApprovalToken, type VerifyFailureReason } from "@/lib/ai/approval-token";
import { MAX_MUTATING_ACTIONS_PER_REQUEST, type ProposedAction } from "@/lib/ai/engine";
import { recordApprovedMutatingActions } from "@/lib/actions/ai-usage";

/**
 * Executes an approved plan (docs/DECISIONS.md ADR-023). The signed token
 * proves the actions being executed match what was proposed — it is
 * tamper-evidence, not authorization by itself. Every action is
 * re-validated against its own Zod schema and the approval policy here,
 * regardless of the token's validity, before anything runs.
 */

export type ExecutionResult = {
  actionId: string;
  tool: string;
  success: boolean;
  data?: unknown;
  error?: string;
};

export type ExecuteApprovedPlanResult =
  | { kind: "error"; message: string }
  | { kind: "ok"; results: ExecutionResult[] };

const PLACEHOLDER_PATTERN = /^plan:\d+$/;

/** Exported for unit testing — see execute.test.ts. */
export function resolvePlaceholders(
  input: Record<string, unknown>,
  resolvedIds: Map<string, string>,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" && PLACEHOLDER_PATTERN.test(value)) {
      resolved[key] = resolvedIds.get(value) ?? value;
    } else {
      resolved[key] = value;
    }
  }
  return resolved;
}

/** Exported for unit testing — see execute.test.ts. */
export function deriveEntityRef(
  tool: ToolDefinition<unknown>,
  input: Record<string, unknown>,
  data: unknown,
): { entityType: string; entityId: string } | null {
  if (tool.name === "favorite_entity" || tool.name === "unfavorite_entity") {
    const entityType = input.entityType;
    const entityId = input.entityId;
    return typeof entityType === "string" && typeof entityId === "string"
      ? { entityType, entityId }
      : null;
  }
  const row = data as { id?: string } | null;
  if (!row?.id) return null;
  if (tool.name.includes("project")) return { entityType: "project", entityId: row.id };
  if (tool.name.includes("task")) return { entityType: "task", entityId: row.id };
  if (tool.name.includes("idea")) return { entityType: "idea", entityId: row.id };
  if (tool.name.includes("note")) return { entityType: "note", entityId: row.id };
  if (tool.name.includes("inbox")) return { entityType: "inbox_item", entityId: row.id };
  return null;
}

function tokenErrorMessage(reason: VerifyFailureReason): string {
  switch (reason) {
    case "expired":
      return "This proposed plan expired — ask again to get a fresh one.";
    case "signature_mismatch":
      return "This proposed plan couldn't be verified and was not executed.";
    default:
      return "This proposed plan is malformed and was not executed.";
  }
}

export async function executeApprovedPlan(
  actions: ProposedAction[],
  token: string,
  usageId: string | null,
  source?: "web" | "telegram",
): Promise<ExecuteApprovedPlanResult> {
  ensureToolsRegistered();

  const verified = verifyApprovalToken(token);
  if (!verified.valid) {
    return { kind: "error", message: tokenErrorMessage(verified.reason) };
  }

  // Defense in depth: the executed plan must be exactly what was signed —
  // the token is tamper-evidence, not a substitute for the checks below.
  if (JSON.stringify(verified.actions) !== JSON.stringify(actions)) {
    return {
      kind: "error",
      message: "This plan doesn't match what was originally proposed and was not executed.",
    };
  }

  if (actions.length === 0) {
    return { kind: "ok", results: [] };
  }
  if (actions.length > MAX_MUTATING_ACTIONS_PER_REQUEST) {
    return { kind: "error", message: "Too many actions in one plan." };
  }

  // This is the point the number of approved mutating actions is
  // definitively known: the token has verified and the submitted plan
  // matches exactly what was proposed, so the user has approved exactly
  // `actions.length` mutating actions — independent of whether individual
  // actions go on to succeed or fail below (that's a separate, per-action
  // outcome already visible via the results returned and the activity log).
  if (usageId) {
    await recordApprovedMutatingActions(usageId, actions.length);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const resolvedIds = new Map<string, string>();
  const results: ExecutionResult[] = [];

  for (const action of actions) {
    const tool = toolRegistry.get(action.tool);
    if (!tool) {
      results.push({ actionId: action.id, tool: action.tool, success: false, error: "Unknown tool." });
      continue;
    }
    if (!requiresApproval(tool.category)) {
      results.push({
        actionId: action.id,
        tool: action.tool,
        success: false,
        error: "This tool is read-only and should never appear in a proposed plan.",
      });
      continue;
    }

    const resolvedInput = resolvePlaceholders(action.input, resolvedIds);
    const parsed = tool.inputSchema.safeParse(resolvedInput);
    if (!parsed.success) {
      results.push({
        actionId: action.id,
        tool: action.tool,
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input.",
      });
      continue;
    }

    const result = await tool.handler(parsed.data, {});
    if (result.error) {
      results.push({ actionId: action.id, tool: action.tool, success: false, error: result.error });
      continue;
    }

    const data = result.data as { id?: string } | undefined;
    if (data?.id) resolvedIds.set(action.id, data.id);

    if (user) {
      const ref = deriveEntityRef(tool, resolvedInput, result.data);
      if (ref) {
        const { error: logError } = await supabase.from("activity_log").insert({
          user_id: user.id,
          entity_type: ref.entityType,
          entity_id: ref.entityId,
          actor_type: "ai",
          actor_label: tool.name,
          action: `ai_${tool.name}`,
          summary: `AI: ${action.summary}`,
          payload: source ? { source } : undefined,
        });
        if (logError) console.error("[ai-execute] failed to log AI activity:", logError.message);
      }
    }

    results.push({ actionId: action.id, tool: action.tool, success: true, data: result.data });
  }

  return { kind: "ok", results };
}
