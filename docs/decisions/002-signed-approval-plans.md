# 002 — Stateless signed approval plans

**Status:** Accepted

## Context

AI-proposed changes must never run before the user explicitly approves them. The web Command
Center works in a single request/response turn: the server proposes, the browser shows the
plan, and the user approves or rejects it. I wanted to avoid storing conversation or approval
state unless it was actually needed.

## Decision

No pending-actions table for the web flow. The server returns the proposed action list together
with a **short-lived (5-minute) HMAC-SHA256 token** covering exactly that list. On approval, the
client sends both back, and the server:

1. verifies the signature (timing-safe) and the expiry;
2. requires the submitted actions to match the signed payload **exactly**;
3. enforces the per-request action cap;
4. looks each tool up again and rejects any read-only tool found in a plan;
5. **re-validates every input** against the tool's own schema;
6. only then executes.

The token proves the plan wasn't tampered with. It is **never authorization on its own**.

## Consequences

- There is no persistent state for web approvals.
- A plan cannot survive a server restart or be approved from another device. That is an
  accepted limitation for a single-user Command Center.
- I noted at the time that an asynchronous interface would need real persistence and its own
  decision. That happened with Telegram (decision 003), which reuses this same token and
  executor instead of adding a second approval engine.
