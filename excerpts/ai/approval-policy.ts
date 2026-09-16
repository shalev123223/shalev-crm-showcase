// Portfolio excerpt from Shalev CRM (src/lib/ai/approval-policy.ts). Shown for reading only; not runnable on its own.
// Imports point at modules not included in this repository.

/**
 * Centralized approval policy (docs/AI_AGENT.md, "Destructive or ambiguous
 * actions require confirmation"). Pure and synchronous — no model call, no
 * I/O — so it's trivially unit-testable and cannot be talked out of its
 * answer by anything the AI produces.
 */

export type ToolCategory = "read" | "create" | "update" | "soft_delete" | "restore" | "permanent_delete";

/**
 * Every non-read category requires confirmation. There is deliberately no
 * `permanent_delete` tool in the registry (docs/AI_AGENT.md, docs/SECURITY.md)
 * — this case exists only as a guard for a future phase, which must not
 * treat a plain boolean as sufficient for "high-friction" confirmation.
 */
export function requiresApproval(category: ToolCategory): boolean {
  return category !== "read";
}
