create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.profiles
  add column if not exists email text not null default '',
  add column if not exists full_name text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.medical_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text,
  original_filename text not null,
  mime_type text not null,
  file_size bigint not null,
  storage_bucket text not null,
  storage_path text not null unique,
  ocr_text text,
  ocr_raw_text text,
  ocr_structured jsonb,
  ocr_engine text,
  ocr_status text not null default 'pending',
  analysis_json jsonb,
  insights_json jsonb,
  report_status text not null default 'uploaded',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.medical_reports
  add column if not exists title text,
  add column if not exists original_filename text,
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists ocr_text text,
  add column if not exists ocr_raw_text text,
  add column if not exists ocr_structured jsonb,
  add column if not exists ocr_engine text,
  add column if not exists ocr_status text default 'pending',
  add column if not exists analysis_json jsonb,
  add column if not exists insights_json jsonb,
  add column if not exists report_status text default 'uploaded',
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists medical_reports_storage_path_key
on public.medical_reports (storage_path);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.medical_reports (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  message text not null,
  response_json jsonb,
  created_at timestamptz not null default now()
);

alter table if exists public.chat_messages
  add column if not exists report_id uuid references public.medical_reports (id) on delete cascade,
  add column if not exists role text,
  add column if not exists response_json jsonb;

create table if not exists public.medicine_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  report_id uuid references public.medical_reports (id) on delete cascade,
  medicine_name text not null,
  dosage text,
  schedule text not null,
  instructions text,
  reminder_times jsonb not null default '[]'::jsonb,
  alarm_tone text not null default 'default',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.medicine_reminders
  add column if not exists report_id uuid references public.medical_reports (id) on delete cascade,
  add column if not exists medicine_name text,
  add column if not exists dosage text,
  add column if not exists schedule text,
  add column if not exists instructions text,
  add column if not exists reminder_times jsonb not null default '[]'::jsonb,
  add column if not exists alarm_tone text not null default 'default',
  add column if not exists active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists medicine_reminders_user_created_idx
on public.medicine_reminders (user_id, created_at desc);

create index if not exists medicine_reminders_report_idx
on public.medicine_reminders (report_id);

alter table if exists public.chat_messages
  drop constraint if exists chat_messages_role_check;

alter table if exists public.chat_messages
  add constraint chat_messages_role_check
  check (role in ('user', 'assistant'));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists medical_reports_set_updated_at on public.medical_reports;
create trigger medical_reports_set_updated_at
before update on public.medical_reports
for each row execute function public.set_updated_at();

drop trigger if exists medicine_reminders_set_updated_at on public.medicine_reminders;
create trigger medicine_reminders_set_updated_at
before update on public.medicine_reminders
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.medical_reports enable row level security;
alter table public.chat_messages enable row level security;
alter table public.medicine_reminders enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "reports_select_own" on public.medical_reports;
create policy "reports_select_own"
on public.medical_reports
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "reports_insert_own" on public.medical_reports;
create policy "reports_insert_own"
on public.medical_reports
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "reports_update_own" on public.medical_reports;
create policy "reports_update_own"
on public.medical_reports
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "reports_delete_own" on public.medical_reports;
create policy "reports_delete_own"
on public.medical_reports
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "chat_select_own" on public.chat_messages;
create policy "chat_select_own"
on public.chat_messages
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "chat_insert_own" on public.chat_messages;
create policy "chat_insert_own"
on public.chat_messages
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "chat_delete_own" on public.chat_messages;
create policy "chat_delete_own"
on public.chat_messages
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "reminders_select_own" on public.medicine_reminders;
create policy "reminders_select_own"
on public.medicine_reminders
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "reminders_insert_own" on public.medicine_reminders;
create policy "reminders_insert_own"
on public.medicine_reminders
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "reminders_update_own" on public.medicine_reminders;
create policy "reminders_update_own"
on public.medicine_reminders
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "reminders_delete_own" on public.medicine_reminders;
create policy "reminders_delete_own"
on public.medicine_reminders
for delete
to authenticated
using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('medical-reports', 'medical-reports', false)
on conflict (id) do nothing;

drop policy if exists "storage_select_own_reports" on storage.objects;
create policy "storage_select_own_reports"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'medical-reports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "storage_insert_own_reports" on storage.objects;
create policy "storage_insert_own_reports"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'medical-reports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "storage_update_own_reports" on storage.objects;
create policy "storage_update_own_reports"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'medical-reports'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'medical-reports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "storage_delete_own_reports" on storage.objects;
create policy "storage_delete_own_reports"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'medical-reports'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Additional report-owned health data tables.
-- public.medicine_reminders already exists above and is intentionally left unchanged
-- here to preserve backward compatibility with the current production schema.

create table if not exists public.report_metrics (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.medical_reports (id) on delete cascade,
  metric_name text not null,
  metric_value numeric not null,
  unit text,
  created_at timestamptz not null default now()
);

create index if not exists report_metrics_report_created_idx
on public.report_metrics (report_id, created_at desc);

create index if not exists report_metrics_report_metric_idx
on public.report_metrics (report_id, metric_name);

create table if not exists public.health_alerts (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.medical_reports (id) on delete cascade,
  alert_type text not null check (alert_type in ('low', 'medium', 'high', 'critical')),
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists health_alerts_report_created_idx
on public.health_alerts (report_id, created_at desc);

create table if not exists public.ai_confidence (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.medical_reports (id) on delete cascade,
  ocr_confidence integer not null check (ocr_confidence between 0 and 100),
  ai_confidence integer not null check (ai_confidence between 0 and 100),
  created_at timestamptz not null default now()
);

create index if not exists ai_confidence_report_created_idx
on public.ai_confidence (report_id, created_at desc);

alter table public.report_metrics enable row level security;
alter table public.health_alerts enable row level security;
alter table public.ai_confidence enable row level security;

drop policy if exists "report_metrics_select_own" on public.report_metrics;
create policy "report_metrics_select_own"
on public.report_metrics
for select
to authenticated
using (
  exists (
    select 1
    from public.medical_reports reports
    where reports.id = report_id
      and reports.user_id = auth.uid()
  )
);

drop policy if exists "report_metrics_insert_own" on public.report_metrics;
create policy "report_metrics_insert_own"
on public.report_metrics
for insert
to authenticated
with check (
  exists (
    select 1
    from public.medical_reports reports
    where reports.id = report_id
      and reports.user_id = auth.uid()
  )
);

drop policy if exists "report_metrics_update_own" on public.report_metrics;
create policy "report_metrics_update_own"
on public.report_metrics
for update
to authenticated
using (
  exists (
    select 1
    from public.medical_reports reports
    where reports.id = report_id
      and reports.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.medical_reports reports
    where reports.id = report_id
      and reports.user_id = auth.uid()
  )
);

drop policy if exists "report_metrics_delete_own" on public.report_metrics;
create policy "report_metrics_delete_own"
on public.report_metrics
for delete
to authenticated
using (
  exists (
    select 1
    from public.medical_reports reports
    where reports.id = report_id
      and reports.user_id = auth.uid()
  )
);

drop policy if exists "health_alerts_select_own" on public.health_alerts;
create policy "health_alerts_select_own"
on public.health_alerts
for select
to authenticated
using (
  exists (
    select 1
    from public.medical_reports reports
    where reports.id = report_id
      and reports.user_id = auth.uid()
  )
);

drop policy if exists "health_alerts_insert_own" on public.health_alerts;
create policy "health_alerts_insert_own"
on public.health_alerts
for insert
to authenticated
with check (
  exists (
    select 1
    from public.medical_reports reports
    where reports.id = report_id
      and reports.user_id = auth.uid()
  )
);

drop policy if exists "health_alerts_update_own" on public.health_alerts;
create policy "health_alerts_update_own"
on public.health_alerts
for update
to authenticated
using (
  exists (
    select 1
    from public.medical_reports reports
    where reports.id = report_id
      and reports.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.medical_reports reports
    where reports.id = report_id
      and reports.user_id = auth.uid()
  )
);

drop policy if exists "health_alerts_delete_own" on public.health_alerts;
create policy "health_alerts_delete_own"
on public.health_alerts
for delete
to authenticated
using (
  exists (
    select 1
    from public.medical_reports reports
    where reports.id = report_id
      and reports.user_id = auth.uid()
  )
);

drop policy if exists "ai_confidence_select_own" on public.ai_confidence;
create policy "ai_confidence_select_own"
on public.ai_confidence
for select
to authenticated
using (
  exists (
    select 1
    from public.medical_reports reports
    where reports.id = report_id
      and reports.user_id = auth.uid()
  )
);

drop policy if exists "ai_confidence_insert_own" on public.ai_confidence;
create policy "ai_confidence_insert_own"
on public.ai_confidence
for insert
to authenticated
with check (
  exists (
    select 1
    from public.medical_reports reports
    where reports.id = report_id
      and reports.user_id = auth.uid()
  )
);

drop policy if exists "ai_confidence_update_own" on public.ai_confidence;
create policy "ai_confidence_update_own"
on public.ai_confidence
for update
to authenticated
using (
  exists (
    select 1
    from public.medical_reports reports
    where reports.id = report_id
      and reports.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.medical_reports reports
    where reports.id = report_id
      and reports.user_id = auth.uid()
  )
);

drop policy if exists "ai_confidence_delete_own" on public.ai_confidence;
create policy "ai_confidence_delete_own"
on public.ai_confidence
for delete
to authenticated
using (
  exists (
    select 1
    from public.medical_reports reports
    where reports.id = report_id
      and reports.user_id = auth.uid()
  )
);
