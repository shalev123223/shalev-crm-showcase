-- Portfolio excerpt from Shalev CRM (supabase/migrations — activity logging, first table only). Shown for reading only.

-- Phase 2: Activity logging via DB triggers, not application code alone.
-- See docs/DECISIONS.md ADR-019. Triggers run `security invoker` as the
-- acting session, so the existing activity_log "insert own" RLS policy
-- governs them the same as any other write — no privilege escalation
-- needed. Deliberately selective about what gets logged (create,
-- meaningful status change, move, soft-delete/restore, favorite toggle)
-- so the feed stays useful rather than a raw row-change log.

create or replace function public.record_activity(
  p_user_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_summary text,
  p_payload jsonb default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.activity_log (user_id, entity_type, entity_id, action, summary, payload)
  values (p_user_id, p_entity_type, p_entity_id, p_action, p_summary, p_payload);
$$;

revoke execute on function public.record_activity(uuid, text, uuid, text, text, jsonb)
  from public, anon, authenticated;

-- Projects --------------------------------------------------------------

create or replace function public.log_project_activity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.record_activity(
      new.user_id, 'project', new.id, 'created',
      'Created project "' || new.title || '"'
    );
  elsif tg_op = 'UPDATE' then
    if old.deleted_at is null and new.deleted_at is not null then
      perform public.record_activity(
        new.user_id, 'project', new.id, 'soft_deleted',
        'Moved project "' || new.title || '" to Trash'
      );
    elsif old.deleted_at is not null and new.deleted_at is null then
      perform public.record_activity(
        new.user_id, 'project', new.id, 'restored',
        'Restored project "' || new.title || '" from Trash'
      );
    elsif old.status is distinct from new.status then
      perform public.record_activity(
        new.user_id, 'project', new.id, 'status_changed',
        'Project "' || new.title || '" status changed to ' || new.status,
        jsonb_build_object('from', old.status, 'to', new.status)
      );
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.log_project_activity() from public, anon, authenticated;

-- … (the same pattern for tasks, ideas, notes, favorites and inbox items omitted)
