# Architecture

## Layers

```
┌───────────────────────────────────────────────────────────────┐
│ Interfaces                                                    │
│   Web app (Next.js App Router)   Telegram bot   Nightly job   │
├───────────────────────────────────────────────────────────────┤
│ AI layer (src/lib/ai)                                         │
│   engine ─ tool registry ─ approval policy ─ executor         │
│   provider interface ─ Anthropic implementation               │
├───────────────────────────────────────────────────────────────┤
│ Server actions (src/lib/actions)                              │
│   the only write path, for humans and for the AI alike        │
├───────────────────────────────────────────────────────────────┤
│ Supabase client (src/lib/supabase/server.ts)                  │
│   anon key + the caller's session, never the service role     │
├───────────────────────────────────────────────────────────────┤
│ Postgres                                                      │
│   typed tables ─ RLS on every table ─ explicit GRANTs         │
│   activity triggers ─ partial indexes over live rows          │
└───────────────────────────────────────────────────────────────┘
```

**The rule that holds it together:** there is exactly one write path. A human clicking a button,
the AI executing an approved plan, and a Telegram approval all end up in the same server
actions, under the same user identity, subject to the same RLS policies.

## Identity per interface

| Interface | How the session is resolved |
|---|---|
| Web | Cookies, refreshed by middleware |
| Telegram webhook | Shared-secret header (timing-safe) → allow-listed Telegram user → a real user session injected through `AsyncLocalStorage` |
| Nightly reminder job | Shared-secret header → the same injected session mechanism |

The service-role key is never reachable from user input or from the AI layer. Because
`createClient()` checks for an injected session first, no server action had to change to
support the background interfaces.

## The AI request lifecycle

1. **Context.** The request carries the current route and, if one is open, the record on screen,
   so "add a task to this" resolves correctly.
2. **Loop.** At most 25 model rounds. Read tools run immediately. Mutating tools are validated
   and queued as `plan:N` placeholders, with at most 10 per request.
3. **Proposal.** The plan goes back to the client with an HMAC-signed token that expires after
   5 minutes. The web flow stores nothing on the server.
4. **Approval.** The executor verifies the token, requires the submitted plan to match the
   signed one exactly, re-validates each input against its schema, resolves placeholders to the
   real IDs created earlier in the same plan, and runs each action.
5. **Attribution.** The database trigger records the write, and the executor adds a second row
   marked `actor = ai` with the tool's name.
6. **Accounting.** Tokens, cost and the number of approved actions are recorded for every
   request, which feeds the AI usage dashboard.

The Telegram flow is the same, except that step 3 persists the plan in a pending-actions row,
because the approval tap can arrive minutes later from a different process.

## Data model conventions

Every user-data table follows the same shape:

- `id uuid`, `user_id uuid default auth.uid()`
- enum-like fields as `text` + `CHECK` constraints
- `custom_fields jsonb` with a GIN index
- source tracking (`source_integration`, `source_id`, `source_url`, `synced_at`)
- `deleted_at` for soft delete, with **partial indexes** `where deleted_at is null`
- `created_at` / `updated_at`, the latter maintained by a trigger
- RLS enabled, with four owner-only policies and explicit grants to `authenticated`

Shared query helpers (`excludeDeleted`, `onlyDeleted`) make "hide deleted rows by default" a
single place to get right, not a filter repeated in every module.

## Integrations

| Integration | Direction | Notes |
|---|---|---|
| Anthropic | outbound | behind a vendor-neutral provider interface |
| Telegram | in + out | capture, commands and asynchronous approval |
| Job-search agent | shared schema + one HTTP trigger | separate repository, governed by a contract file kept identical in both |
| Financial providers | planned, read-only | the provider stays authoritative; no raw merging of data |
| n8n | optional | never a core dependency |
