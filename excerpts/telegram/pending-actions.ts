// Portfolio excerpt from Shalev CRM (src/lib/integrations/telegram/pending-actions.ts). Shown for reading only; not runnable on its own.
// Imports point at modules not included in this repository.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ProposedAction } from "@/lib/ai/engine";
import type { Json, Tables, TablesUpdate } from "@/types/database";

/**
 * Async hand-off storage for AI-proposed plans awaiting Telegram approval
 * (docs/DECISIONS.md ADR-025). Not a second approval engine — the stored
 * `approval_token` is the exact same signed token src/lib/ai/execute.ts
 * already verifies; this module only manages the status machine around it.
 */

export type PendingActionStatus = "pending" | "approved" | "executed" | "cancelled" | "expired" | "failed";
export type TelegramPendingAction = Tables<"telegram_pending_actions">;

const PENDING_ACTION_TTL_MS = 15 * 60 * 1000;

export async function createPendingAction(input: {
  telegramChatId: number;
  telegramUserId: number;
  telegramMessageId?: number;
  actions: ProposedAction[];
  approvalToken: string;
  usageId: string | null;
  summary: string;
}): Promise<TelegramPendingAction | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("telegram_pending_actions")
    .insert({
      telegram_chat_id: input.telegramChatId,
      telegram_user_id: input.telegramUserId,
      telegram_message_id: input.telegramMessageId ?? null,
      actions: input.actions as unknown as Json,
      approval_token: input.approvalToken,
      usage_id: input.usageId,
      summary: input.summary,
      status: "pending",
      expires_at: new Date(Date.now() + PENDING_ACTION_TTL_MS).toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error("[telegram][pending-actions] failed to create pending action:", error.message);
    return null;
  }
  return data;
}

export async function getPendingAction(id: string): Promise<TelegramPendingAction | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("telegram_pending_actions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[telegram][pending-actions] failed to load pending action:", error.message);
    return null;
  }
  return data;
}

/**
 * Idempotent compare-and-swap status transition: `UPDATE ... WHERE id = $1
 * AND status = from`. Returns the updated row on success, or `null` if the
 * row wasn't in `from` anymore (already claimed by an earlier callback,
 * already expired, etc.) — every caller treats `null` as "already handled,"
 * not an error. This is what makes double-tapping Approve safe.
 */
export async function claimPendingAction(
  id: string,
  from: PendingActionStatus,
  to: PendingActionStatus,
): Promise<TelegramPendingAction | null> {
  const supabase = await createClient();
  const patch: TablesUpdate<"telegram_pending_actions"> = { status: to };
  if (to === "executed" || to === "failed") patch.executed_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("telegram_pending_actions")
    .update(patch)
    .eq("id", id)
    .eq("status", from)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[telegram][pending-actions] failed to claim pending action:", error.message);
    return null;
  }
  return data;
}

export function isExpired(row: TelegramPendingAction): boolean {
  return new Date(row.expires_at).getTime() < Date.now();
}
