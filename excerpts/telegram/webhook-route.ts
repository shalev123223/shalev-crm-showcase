// Portfolio excerpt from Shalev CRM (src/app/api/telegram/webhook/route.ts). Shown for reading only; not runnable on its own.
// Imports point at modules not included in this repository.

import "server-only";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerEnv } from "@/config/env";
import { handleTelegramUpdate } from "@/lib/integrations/telegram/handle-update";
import type { TelegramUpdate } from "@/lib/integrations/telegram/types";

/**
 * Telegram webhook entry point (docs/AI_AGENT.md, spec section 21/34). Node
 * runtime required for AsyncLocalStorage in src/lib/supabase/server.ts.
 * Local development only in this phase — no production webhook is
 * registered against this route yet (spec section 35).
 */
export const runtime = "nodejs";

function isValidSecret(received: string | null): boolean {
  const expected = getServerEnv().TELEGRAM_WEBHOOK_SECRET;
  if (!expected || !received) return false;

  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(received);
  if (expectedBuf.length !== receivedBuf.length) return false;
  return timingSafeEqual(expectedBuf, receivedBuf);
}

export async function POST(request: Request): Promise<NextResponse> {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!isValidSecret(secret)) {
    return new NextResponse(null, { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    // Malformed body from something that isn't actually Telegram — nothing
    // to process, but still acknowledge so nothing retries indefinitely.
    return new NextResponse(null, { status: 200 });
  }

  // handleTelegramUpdate never throws for expected failure modes (it turns
  // them into a user-facing Telegram message) — this route doesn't need to
  // translate internal outcomes into the HTTP response.
  await handleTelegramUpdate(update);

  return new NextResponse(null, { status: 200 });
}
