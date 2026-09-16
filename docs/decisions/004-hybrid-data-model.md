# 004 — A hybrid data model, with no universal `entities` table

**Status:** Accepted

## Context

The central schema question: one polymorphic `entities` table for everything, a separate table
for each type, or something in between?

A universal table is tempting, because anything could link to anything for free. In practice it
turns into a dumping ground: weak types, no meaningful constraints, and every query filtering
on a `type` column.

## Decision

A hybrid:

- **Dedicated typed tables** for structured domains (projects, tasks, jobs and, later, property,
  investments, …), each with purpose-fit columns and `CHECK` constraints.
- **Cross-cutting structures** (notes, favorites, custom fields, activity, source metadata)
  attach to any record through an `entity_type` + `entity_id` pair.
- **Custom fields are `JSONB`** with a GIN index, not an EAV schema.
- **Categories stay in code for now.** A `spaces` table was deliberately postponed until a
  second real category table exists. Before that, it would have been configuration for a
  distinction that didn't exist yet. The navigation registry in code does that job today, and
  adding the table later is a non-breaking change (a nullable `space_id`).

## Consequences

- Domain tables stay clean and strongly typed. Search, favorites, activity and custom fields are
  implemented once, not per domain.
- The polymorphic reference cannot be a real foreign key. Its integrity is enforced in the
  application: one list of valid entity types in code, plus the controlled tools and shared
  query helpers.
- That list comes in two variants on purpose. *Attachable* types can be the target of a note,
  a favorite or an AI create/update. *Trash* types are a superset: a job posting can be deleted,
  but it is only ever created by the agent, never by hand or by the AI.
