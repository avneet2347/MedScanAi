create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null default '',
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  ocr_engine text,
  ocr_status text not null default 'pending',
  analysis_json jsonb,
  insights_json jsonb,
  report_status text not null default 'uploaded',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.medical_reports (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  message text not null,
  response_json jsonb,
  created_at timestamptz not null default now()
);

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

alter table public.profiles enable row level security;
alter table public.medical_reports enable row level security;
alter table public.chat_messages enable row level security;

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
