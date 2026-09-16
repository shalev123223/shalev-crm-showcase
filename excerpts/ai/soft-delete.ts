// Portfolio excerpt from Shalev CRM (src/lib/ai/tools/soft-delete.ts). Shown for reading only; not runnable on its own.
// Imports point at modules not included in this repository.

import { z } from "zod";
import type { ToolDefinition } from "@/lib/ai/tools/types";
import { softDeleteProject } from "@/lib/actions/projects";
import { softDeleteTask } from "@/lib/actions/tasks";
import { softDeleteIdea } from "@/lib/actions/ideas";
import { softDeleteNote } from "@/lib/actions/notes";
import { dismissInboxItem } from "@/lib/actions/inbox";
import { softDeleteOccasion } from "@/lib/actions/occasions";
import { softDeleteGestureIdea } from "@/lib/actions/gesture-ideas";

const idInput = z.object({ id: z.string().uuid() });

function softDeleteTool(
  name: string,
  entityLabel: string,
  action: (id: string) => Promise<{ data?: unknown; error?: string }>,
): ToolDefinition<{ id: string }> {
  return {
    name,
    description: `Move a ${entityLabel} to Trash (soft delete, recoverable). Requires explicit user confirmation before this tool runs — never call it speculatively.`,
    category: "soft_delete",
    inputSchema: idInput,
    handler: async ({ id }) => {
      const result = await action(id);
      return result.error ? { error: result.error } : { data: result.data };
    },
  };
}

export const softDeleteTools = [
  softDeleteTool("soft_delete_occasion", "occasion", softDeleteOccasion),
  softDeleteTool("soft_delete_gesture_idea", "gesture idea", softDeleteGestureIdea),
  softDeleteTool("soft_delete_project", "project", softDeleteProject),
  softDeleteTool("soft_delete_task", "task", softDeleteTask),
  softDeleteTool("soft_delete_idea", "idea", softDeleteIdea),
  softDeleteTool("soft_delete_note", "note", softDeleteNote),
  softDeleteTool("soft_delete_inbox_item", "inbox item (dismisses it)", dismissInboxItem),
] as ToolDefinition<any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any -- heterogeneous tool array
