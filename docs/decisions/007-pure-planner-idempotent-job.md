# 007 — A pure reminder planner and an idempotent job

**Status:** Accepted

## Context

The Calendar requirement was not "remind me on a date". It was closer to editorial judgement:

- skip a minor recurring gesture in a week that already holds a major occasion;
- suggest something when a long stretch has had nothing positive in it;
- don't let several reminders pile up in the same week.

This is real logic. Logic that lives inside a nightly cron job, running against a production
database, is logic nobody can test.

## Decision

**The planner is a pure function.** `today` is a parameter, not a clock read. Occasions arrive
as plain domain objects, and the planner never touches the database or the network. The job
loads rows, calls the planner and writes the result. That is the whole split.

Two rules came from thinking about how this could disappoint someone in practice:

- **One-off occasions are never suppressed.** Skipping a weekly gesture costs nothing, because
  another one comes next week. Skipping a one-off loses it for good.
- **A catch-up reminder.** An occasion added after its planning window has opened (say, a
  birthday entered three weeks ahead against a 60-day schedule) would otherwise produce silence.
  If every scheduled reminder is already in the past, the planner emits exactly one reminder,
  due today.

A reminder on the day itself is never capped. Missing the actual day is the one failure the
module exists to prevent.

**Reminders are materialized rows**, because snooze, dismissal and future delivery channels
need a stable row to act on.

**Idempotency is a database guarantee.** Each reminder has a deterministic `dedupe_key`
protected by a unique index. Unlike every other unique index in the schema, this one is
**not** partial on `deleted_at is null`. A reminder the user threw away must stay thrown away,
and a partial index would not see it and would recreate it the next night.

**Silence is the failure mode, so it is made visible.** Every run is recorded, and the UI shows
"last checked …" and warns loudly when that is stale. A cron job that stopped three weeks ago
otherwise looks exactly like a quiet month.

## Consequences

- Every behaviour is covered by unit tests with no database and no network, including
  idempotency: feeding a run's output back in as existing keys yields an empty plan.
- The year view and the live preview in the event editor call the same functions, so what the
  UI shows is what the job will actually do.
- The single clock read is isolated and resolves in the local time zone, because the job runs at
  an hour that is still the previous day in UTC for part of the year.
