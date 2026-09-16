-- Portfolio excerpt from Shalev CRM (supabase/migrations). Shown for reading only.

-- Phase 2: Tasks. A task can stand alone or link to a Project (never
-- forced into a hierarchy — docs/PRODUCT.md "Tasks linked to
-- projects/categories"). `calendar_event_id` is reserved now so a future
-- Google Calendar integration (docs/ROADMAP.md Phase 4) doesn't need a
-- schema change to attach — no calendar logic is implemented in this phase.

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  title text not null check (char_length(btrim(title)) > 0),
  description text,
  status text not null default 'todo'
    check (status in ('todo', 'in_progress', 'done', 'cancelled')),
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high', 'urgent')),
  due_at timestamptz,
  completed_at timestamptz,
  calendar_event_id text,
  custom_fields jsonb not null default '{}'::jsonb,
  source_integration text not null default 'manual',
  source_id text,
  source_url text,
  synced_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tasks is
  'Actionable items. Standalone or linked to a Project, never forced into one hierarchy.';

create index if not exists tasks_user_id_idx on public.tasks (user_id);
create index if not exists tasks_project_id_idx on public.tasks (project_id);
create index if not exists tasks_status_idx on public.tasks (status) where deleted_at is null;
create index if not exists tasks_due_at_idx on public.tasks (due_at) where deleted_at is null;
create index if not exists tasks_deleted_at_idx on public.tasks (deleted_at) where deleted_at is not null;
create index if not exists tasks_custom_fields_idx on public.tasks using gin (custom_fields jsonb_path_ops);

alter table public.tasks enable row level security;

drop policy if exists "tasks_select_own" on public.tasks;
create policy "tasks_select_own"
  on public.tasks
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "tasks_insert_own" on public.tasks;
create policy "tasks_insert_own"
  on public.tasks
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "tasks_update_own" on public.tasks;
create policy "tasks_update_own"
  on public.tasks
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "tasks_delete_own" on public.tasks;
create policy "tasks_delete_own"
  on public.tasks
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace trigger tasks_set_updated_at
  before update on public.tasks
  for each row
  execute function public.set_updated_at();
