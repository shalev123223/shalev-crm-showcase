# 003 — Telegram: a real user session, and asynchronous approval

**Status:** Accepted

## Context

Telegram puts the same AI Command Center on the phone. That raised two problems:

1. **Identity.** A webhook request has no browser cookie. The rule is that the AI layer never
   uses the Supabase service-role client; every tool call runs under the real user's session.
   Rewriting every server action to accept an injected client would have touched almost the
   entire data layer.
2. **Asynchrony.** Approval is a button tap that can arrive minutes later. Telegram's
   `callback_data` is also limited to 64 bytes, far too small to hold the signed plan.

## Decision

**Identity.** A one-time local script signs in through the normal email/password flow and
produces a refresh token, which is stored only in the server environment. At runtime it is
exchanged for an access token and cached in memory. `createClient()` checks an
`AsyncLocalStorage` store first: during a Telegram request it returns a client authenticated
with that session, and every other caller is unaffected.

*Rejected alternative:* a service-role client with manual `user_id` filtering. It conflicts
directly with the security rule, and a single missed filter would leak data.

**Asynchrony.** A `telegram_pending_actions` table holds the plan, **the same signed token** the
web flow produces, a status (`pending → approved/cancelled/expired → executed/failed`) and a
15-minute expiry. The inline button carries only `approve:<id>` or `reject:<id>`. Status changes
are a compare-and-swap:

```sql
UPDATE telegram_pending_actions SET status = 'approved'
WHERE id = $1 AND status = 'pending'
```

When the update affects no rows, the caller treats it as *already handled*, not as an error.
A double tap is therefore a no-op. Execution goes through the **unchanged** web executor, which
verifies the stored token again.

## Consequences

- Every existing tool and server action works from Telegram with zero changes. RLS applies
  identically, so "Telegram is not a bypass" is true by construction.
- The same mechanism was later reused for the nightly reminder job. There is one user, so there
  is one background identity and one credential to rotate.
- If the stored token is revoked, the bot fails loudly with a clear "re-run the bootstrap"
  message instead of silently degrading.
