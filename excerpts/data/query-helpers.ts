// Portfolio excerpt from Shalev CRM (src/lib/data/query-helpers.ts). Shown for reading only; not runnable on its own.
// Imports point at modules not included in this repository.

/**
 * Shared query-shape helpers so "exclude soft-deleted rows by default" is
 * one discipline point, not a filter repeated (and eventually forgotten)
 * in every data module — see docs/DATABASE.md "Soft delete".
 */

type DeletedAtFilterable = {
  is(column: "deleted_at", value: null): DeletedAtFilterable;
};

/** Default list/read view: active rows only. */
export function excludeDeleted<Q extends DeletedAtFilterable>(query: Q): Q {
  return query.is("deleted_at", null) as Q;
}

type DeletedAtNotNullFilterable = {
  not(column: "deleted_at", operator: "is", value: null): DeletedAtNotNullFilterable;
};

/** Trash view: soft-deleted rows only. */
export function onlyDeleted<Q extends DeletedAtNotNullFilterable>(query: Q): Q {
  return query.not("deleted_at", "is", null) as Q;
}
