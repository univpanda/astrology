-- Saved charts.
--
-- There are no accounts here, so ownership is a capability: the browser mints a
-- random token on first use, keeps it in localStorage, and rows are scoped to
-- it. Anyone holding a token can read and write its rows, and nobody can guess
-- another one. That is weaker than real auth and stronger than a public table,
-- and it costs the user no signup for what is a private notebook.
--
-- Access goes through the kundalis edge function using the service role, so the
-- token is checked in one place. RLS denies everything by default here: no
-- policy is granted to anon or authenticated, which means PostgREST cannot read
-- this table at all even with the public anon key.

create table if not exists astro_kundali (
  id            uuid primary key default gen_random_uuid(),
  owner_token   text        not null,
  name          text        not null,
  place_label   text        not null,
  latitude      double precision not null,
  longitude     double precision not null,
  zone          text        not null,
  birth_date    date        not null,
  birth_time    time        not null,
  time_standard text        not null default 'zone',
  ayanamsa      text        not null default 'lahiri',
  true_node     boolean     not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint astro_kundali_token_len check (length(owner_token) between 16 and 128),
  constraint astro_kundali_name_len check (length(name) between 1 and 120),
  constraint astro_kundali_lat_range check (latitude between -90 and 90),
  constraint astro_kundali_lon_range check (longitude between -180 and 180)
);

comment on table astro_kundali is
  'Charts saved from the Jyotisha page. Scoped by an unguessable browser token; no accounts.';

-- A chart is defined by name, place, date and time, so re-saving the same four
-- updates that row rather than adding a near-duplicate.
create unique index if not exists astro_kundali_identity
  on astro_kundali (owner_token, lower(name), lower(place_label), birth_date, birth_time);

create index if not exists astro_kundali_owner_recent
  on astro_kundali (owner_token, updated_at desc);

alter table astro_kundali enable row level security;
-- Deliberately no policy: only the service role, used by the edge function,
-- reaches this table.
