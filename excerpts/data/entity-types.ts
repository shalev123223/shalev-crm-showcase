// Portfolio excerpt from Shalev CRM (src/lib/entity-types.ts). Shown for reading only; not runnable on its own.
// Imports point at modules not included in this repository.

/**
 * The set of record types that can participate in the cross-cutting
 * polymorphic structures (Notes' entity link, Favorites, Activity Log —
 * see docs/DATABASE.md, ADR-010). There is no DB-level foreign key across
 * possible target tables, so this list is the application-layer source of
 * truth for which `entity_type` values are valid — extend it here when a
 * new domain becomes attachable, not by editing a DB constraint.
 */
export const entityTypes = [
  "project",
  "task",
  "idea",
  "note",
  "inbox_item",
  "occasion",
  "gesture_idea",
] as const;

export type EntityType = (typeof entityTypes)[number];

/**
 * Entity types a Note or Favorite may point at, and the set Universal Add,
 * Inbox conversion and the AI create/update tools are keyed off. `inbox_item`
 * is excluded — it's a landing zone, not a target — and so are calendar
 * reminders, which are materialized artifacts of the planner rather than
 * something the user authored.
 *
 * NOT the same list as what Trash restores. Trash's own `TrashEntityType`
 * (src/lib/data/trash-entities.ts) is a superset: `job_posting` is soft-deletable and
 * so appears there, but nobody creates or edits a job posting by hand — the
 * agent inserts them (docs/CONTRACT.md) — so it must not appear here.
 */
export const attachableEntityTypes = [
  "project",
  "task",
  "idea",
  "note",
  "occasion",
  "gesture_idea",
] as const;

export type AttachableEntityType = (typeof attachableEntityTypes)[number];

export function isEntityType(value: string): value is EntityType {
  return (entityTypes as readonly string[]).includes(value);
}
