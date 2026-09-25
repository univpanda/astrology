-- Sidereal ephemeris lookup table for the Jyotisha chart generator.
--
-- Lives in the shared PandaInUniv database under the astro_ prefix, alongside
-- the existing pt_ (placement) and gmat_ tables.
--
-- WHAT IS STORED
-- Mean tropical longitude: no nutation, no ayanamsa. Both are cheap closed-form
-- expressions, so baking either in would freeze a choice the caller should still
-- make. A sidereal longitude is `stored - ayanamsa(system)`, which keeps all five
-- ayanamsas working off one table.
--
-- One row per (decade, body). Samples are Int32 little-endian in units of 1e-5
-- degrees, base64 encoded. Base64 rather than bytea because PostgREST renders
-- bytea as hex, which doubles it on the wire; base64 costs 33%.
--
-- Each row carries two samples of padding at both ends so Catmull-Rom
-- interpolation always has its four points within one row, even for a birth on
-- 1 January of the decade.

create table if not exists astro_ephemeris (
  decade        smallint         not null,
  body          text             not null,
  step_days     double precision not null,
  first_jd      double precision not null,
  sample_count  integer          not null,
  longitudes    text             not null,
  constraint astro_ephemeris_pkey primary key (decade, body),
  constraint astro_ephemeris_step_positive check (step_days > 0),
  constraint astro_ephemeris_count_positive check (sample_count > 3)
);

comment on table astro_ephemeris is
  'Mean tropical longitudes per body, sampled on a per-body step. Int32 LE, 1e-4 degrees, base64. Sidereal = stored - ayanamsa.';
comment on column astro_ephemeris.first_jd is
  'Julian Day (UT) of sample 0, which sits two steps before the decade begins.';
comment on column astro_ephemeris.step_days is
  'Sample spacing, chosen per body so cubic interpolation costs under 0.5 arcsec.';

-- The ephemeris is public reference data, not user data: readable by anyone,
-- writable only by the service role that loads it.
alter table astro_ephemeris enable row level security;

drop policy if exists astro_ephemeris_public_read on astro_ephemeris;
create policy astro_ephemeris_public_read
  on astro_ephemeris for select
  to anon, authenticated
  using (true);
