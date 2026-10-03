-- One current row per reference profile or private Custom Choice; no history.
create table if not exists public.astro_settings_profiles (
  profile_key text not null,
  owner_token text not null default '',
  label text not null check (length(label) between 1 and 120),
  choices jsonb not null check (jsonb_typeof(choices) = 'object'),
  provenance jsonb not null default '{}' check (jsonb_typeof(provenance) = 'object'),
  explanation text not null default '',
  evidence jsonb not null default '[]' check (jsonb_typeof(evidence) = 'array'),
  option_catalogue jsonb not null default '[]' check (jsonb_typeof(option_catalogue) = 'array'),
  selected_preset text not null default 'custom'
    check (selected_preset in ('star','raman','rao','parashara','page','custom')),
  updated_at timestamptz not null default now(),
  primary key (profile_key, owner_token),
  constraint astro_settings_profile_scope check (
    (owner_token = '' and profile_key in ('star','raman','rao','parashara','page','custom'))
    or (owner_token ~ '^[A-Za-z0-9_-]{16,128}$' and profile_key = 'custom')
  )
);
alter table public.astro_settings_profiles enable row level security;
revoke all on public.astro_settings_profiles from anon, authenticated;
grant select, insert, update on public.astro_settings_profiles to service_role;
revoke delete, truncate on public.astro_settings_profiles from service_role;
comment on table public.astro_settings_profiles is
  'Current named reference settings and one private Custom Choice per browser owner. Saves replace choices in place. No previous choices or revision history.';
