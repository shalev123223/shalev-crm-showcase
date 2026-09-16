# 006 — Explicit `GRANT`s after RLS (a bug story)

**Status:** Accepted

## Context

This bug was found during live browser verification, not in review. Every table created by a
migration came back with `permission denied for table X`, even though its RLS policies were
correct.

The cause: migrations run as the `postgres` role, and in this project the default privileges
**for that role** were narrower than the platform's usual defaults. New tables got only
`TRUNCATE` / `REFERENCES` / `TRIGGER`, with no `SELECT` / `INSERT` / `UPDATE` / `DELETE`. So
Postgres rejected requests at the table-privilege level, *before RLS was ever evaluated*.

It was easy to miss for two reasons:

- Queries run through an admin SQL console execute as a superuser and never hit this check.
- The platform's security advisor doesn't check for missing grants.

## Decision

Every migration that creates a user-data table must include explicit grants in the same file,
covering only the operations its RLS policies allow:

```sql
grant select, insert, update, delete on public.<table> to authenticated;
```

`anon` is never granted anything on a table with user data, because the app has no anonymous
access path. A corrective migration fixed the tables that already existed.

## Consequences

- There is a little more boilerplate per migration. In return, each table's security is visible
  in its own migration file instead of depending on project settings that aren't.
- The lesson I kept: **verify security through the same path real users take.** An advisor
  report and a superuser query are not the same thing as an authenticated request.
