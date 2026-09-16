// Portfolio excerpt from Shalev CRM (src/lib/supabase/server.ts). Shown for reading only; not runnable on its own.
// Imports point at modules not included in this repository.

import { AsyncLocalStorage } from "node:async_hooks";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getClientEnv } from "@/config/env";
import type { Database } from "@/types/database";

/**
 * Telegram requests (docs/DECISIONS.md ADR-026) have no browser cookie to
 * resolve a session from, but every AI tool handler and server action calls
 * this module's `createClient()` and must still run under the real user's
 * own authenticated Supabase session — never a service-role client (see
 * docs/ARCHITECTURE.md, docs/SECURITY.md). `runWithServiceSession` lets a
 * request that arrives without a cookie — the Telegram webhook, the nightly
 * Calendar reminder job — supply a real access/refresh token pair for the
 * duration of one request;
 * `createClient()` below checks for it first and falls back to the normal
 * cookie-based resolution otherwise. Every existing caller in
 * src/lib/actions/* and src/lib/ai/tools/* is unchanged and unaware this
 * exists — they just get the right identity depending on who's calling.
 */
const serviceSessionStorage = new AsyncLocalStorage<{
  accessToken: string;
  refreshToken: string;
}>();

export function runWithServiceSession<T>(
  session: { accessToken: string; refreshToken: string },
  fn: () => Promise<T>,
): Promise<T> {
  return serviceSessionStorage.run(session, fn);
}

/**
 * Supabase client for use in Server Components, Server Actions, and Route
 * Handlers. Reads/writes the session via cookies. Still the anon key +
 * RLS — this is not the service-role client.
 *
 * Server Components can't write cookies, so `setAll` there is wrapped in a
 * try/catch and relies on middleware to keep the session refreshed instead.
 */
export async function createClient() {
  const env = getClientEnv();
  const override = serviceSessionStorage.getStore();

  if (override) {
    const client = createServerClient<Database>(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { cookies: { getAll: () => [], setAll: () => {} } },
    );
    await client.auth.setSession({
      access_token: override.accessToken,
      refresh_token: override.refreshToken,
    });
    return client;
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — middleware refreshes the
            // session instead, so this can be safely ignored.
          }
        },
      },
    },
  );
}
