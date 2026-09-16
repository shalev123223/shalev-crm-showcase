// Portfolio excerpt from Shalev CRM (src/lib/ai/engine.ts — the tool loop). Shown for reading only; not runnable on its own.
// Imports point at modules not included in this repository.

import "server-only";
import { getAIProvider } from "@/lib/ai/providers";
import { ensureToolsRegistered, toolRegistry } from "@/lib/ai/tools";
import { calculateCost } from "@/lib/ai/pricing";
import { signApprovalPlan } from "@/lib/ai/approval-token";
import { recordUsage } from "@/lib/actions/ai-usage";
import { AIProviderError, type AIMessage, type AIToolUseBlock } from "@/lib/ai/provider";

export const MAX_MUTATING_ACTIONS_PER_REQUEST = 10;
const MAX_TOOL_ROUNDS = 25;
const MAX_TOKENS = 4096;
const PLACEHOLDER_UUID = "00000000-0000-0000-0000-000000000000";

// … (types, system prompt and setup omitted — inside runCommand():)

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await provider.sendMessage({
        system,
        messages,
        tools,
        maxTokens: MAX_TOKENS,
      });
      totalInputTokens += response.usage.inputTokens;
      totalOutputTokens += response.usage.outputTokens;

      const textBlocks = response.content.filter((block) => block.type === "text");
      assistantText = textBlocks
        .map((block) => block.text)
        .join("\n")
        .trim();

      if (response.stopReason !== "tool_use") {
        break;
      }

      const toolUseBlocks = response.content.filter(
        (block): block is AIToolUseBlock => block.type === "tool_use",
      );
      messages.push({ role: "assistant", content: response.content });

      const toolResultContent: AIMessage["content"] = [];

      for (const toolUse of toolUseBlocks) {
        toolCallsCount++;
        const tool = toolRegistry.get(toolUse.name);

        if (!tool) {
          toolResultContent.push({
            type: "tool_result",
            toolUseId: toolUse.id,
            content: `Unknown tool "${toolUse.name}". It is not registered and cannot be called.`,
            isError: true,
          });
          continue;
        }

        if (tool.category === "read") {
          const parsed = tool.inputSchema.safeParse(toolUse.input);
          if (!parsed.success) {
            toolResultContent.push({
              type: "tool_result",
              toolUseId: toolUse.id,
              content: `Invalid input: ${parsed.error.issues[0]?.message ?? "validation failed"}`,
              isError: true,
            });
            continue;
          }
          const result = await tool.handler(parsed.data, {});
          if (!result.error) {
            const resolved = extractResolvedEntity(tool.name, result.data);
            if (resolved) resolvedEntity = resolved;
          }
          toolResultContent.push({
            type: "tool_result",
            toolUseId: toolUse.id,
            content: JSON.stringify(
              result.error ? { error: result.error } : (result.data ?? null),
            ),
            isError: Boolean(result.error),
          });
          continue;
        }

        // Mutating tool: validate now, queue for approval, never execute here.
        if (proposedActions.length >= MAX_MUTATING_ACTIONS_PER_REQUEST) {
          capReached = true;
          toolResultContent.push({
            type: "tool_result",
            toolUseId: toolUse.id,
            content: `Safety limit reached: at most ${MAX_MUTATING_ACTIONS_PER_REQUEST} mutating actions can be proposed per request. Stop proposing more and tell the user to ask you to continue.`,
            isError: true,
          });
          continue;
        }

        const { sanitized, placeholderFields } = substitutePlaceholdersForValidation(
          toolUse.input,
          knownPlaceholders,
        );
        const parsed = tool.inputSchema.safeParse(sanitized);
        if (!parsed.success) {
          toolResultContent.push({
            type: "tool_result",
            toolUseId: toolUse.id,
            content: `Invalid input: ${parsed.error.issues[0]?.message ?? "validation failed"}`,
            isError: true,
          });
          continue;
        }

        const finalInput = { ...(parsed.data as Record<string, unknown>) };
        for (const [key, placeholder] of Object.entries(placeholderFields)) {
          if (key in finalInput) finalInput[key] = placeholder;
        }

        planNumber++;
        const placeholderId = `plan:${planNumber}`;
        knownPlaceholders.add(placeholderId);
        proposedActions.push({
          id: placeholderId,
          tool: tool.name,
          input: finalInput,
          summary: summarizeAction(tool.name, finalInput),
        });

        toolResultContent.push({
          type: "tool_result",
          toolUseId: toolUse.id,
          content: JSON.stringify({ queued: true, placeholderId }),
        });
      }

      messages.push({ role: "user", content: toolResultContent });

      if (capReached) break;
    }
// … (error handling, usage accounting and plan signing omitted)
