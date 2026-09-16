# 001 — Controlled AI tools, not database access

**Status:** Accepted

## Context

The AI layer needs to read, create, update and delete data. Giving a model a query interface
would be the fastest way to build that, and it would make the AI's behaviour unbounded and
impossible to audit.

## Decision

The AI acts only through a fixed, explicit registry of tools. Each tool has:

- a unique name (registering a duplicate throws);
- a category: `read`, `create`, `update`, `soft_delete` or `restore`;
- a Zod input schema, which is also converted to JSON Schema for the model;
- a handler that calls an existing server action.

A tool name that isn't in the registry is never invoked, whatever the model asks for. No tool
runs arbitrary SQL, and **there is no permanent-delete tool**. Soft delete to Trash is the only
kind of deletion the AI can propose.

Every category except `read` requires approval. That decision is made by a pure function, so
nothing in the conversation can change it.

## Consequences

- Each new AI capability means deliberately adding a tool. That is slower than handing the model
  a query interface, and it's the point: behaviour stays bounded, auditable, and safe to extend
  step by step.
- Because handlers call the same server actions as the UI, validation, RLS and activity logging
  apply to the AI with no extra code.
- Handlers receive an intentionally empty context object, so no handler can reach for a
  privileged client.
