# 005 — Activity logging through database triggers, with one exception

**Status:** Accepted

## Context

An audit trail that depends on every code path remembering to call a logger breaks silently as
the application grows: a new mutation added without its log call, or a bug that skips it.

## Decision

`activity_log` rows are written by `AFTER INSERT/UPDATE` triggers on the participating tables.

- The triggers are **selective**. They log creation, meaningful status changes, moves, soft
  delete and restore, and favorite toggles, not every column change, so the feed stays readable.
- A shared `record_activity()` function performs the insert. The per-table trigger functions
  decide *what* is worth logging.
- The functions run as `security invoker` with an empty `search_path`, so RLS governs them like
  any other write.

**The exception: AI attribution.** A trigger sees row data, not *who asked* for the change.
An AI-executed write happens under the user's session, so the trigger correctly records it as
`actor = user`. Rather than pass actor context into every trigger (a per-table wrapper RPC and a
second insert path to keep in sync), the executor adds **one extra row** per successful AI action,
marked `actor = ai` and naming the tool.

## Consequences

- The trail is reliable by construction. Forgetting to log is no longer possible.
- The "what is loggable" logic lives in SQL, which is a different place to look when extending it.
- An AI action produces two rows. Both are true: a write happened, and the AI proposed it and the
  user approved it. The exception is confined to a single call site and documented as an
  exception, not as a reversal of the rule.
