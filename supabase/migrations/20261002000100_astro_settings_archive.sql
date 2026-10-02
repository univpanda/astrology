-- Reference catalogue snapshots, not visitors' personal browser settings.
-- A new catalogue gets a new content hash. Never overwrite an older revision.
create table if not exists public.astro_settings_archive (
  content_hash text primary key check (content_hash ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz not null default now(),
  git_commit text not null,
  working_tree_dirty boolean not null,
  catalogue jsonb not null check (
    jsonb_typeof(catalogue) = 'object'
    and catalogue->>'schemaVersion' = '1'
    and jsonb_typeof(catalogue->'settings') = 'array'
    and jsonb_typeof(catalogue->'readings') = 'array'
    and jsonb_typeof(catalogue->'observations') = 'array'
  )
);

comment on table public.astro_settings_archive is
  'Append-only reference snapshots: every option, page defaults, documented preset choices, fallback values, explanations and comparison evidence. Not personal settings.';

alter table public.astro_settings_archive enable row level security;
revoke all on public.astro_settings_archive from anon, authenticated;
grant select on public.astro_settings_archive to anon, authenticated;
grant select, insert on public.astro_settings_archive to service_role;
revoke update, delete, truncate on public.astro_settings_archive from service_role;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'astro_settings_archive' and policyname = 'settings_archive_read') then
    create policy settings_archive_read on public.astro_settings_archive
      for select to anon, authenticated using (true);
  end if;
end $$;

create or replace function public.astro_settings_archive_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Settings snapshots are immutable; insert a new revision instead.';
end;
$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.astro_settings_archive'::regclass
    and tgname = 'settings_archive_immutable') then
    create trigger settings_archive_immutable before update or delete or truncate
      on public.astro_settings_archive for each statement
      execute function public.astro_settings_archive_immutable();
  end if;
end $$;
