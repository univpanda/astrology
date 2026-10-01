-- Integrity rules found by reviewing the live database against the application.

-- A saved collection may hold only one public chart for a person. Private
-- charts keep the full birth identity because two people known to the owner can
-- share a name; public figures are deliberately selected by name in the UI.
create unique index if not exists astro_charts_one_public_figure
  on astro_charts (owner_token, lower(name))
  where celebrity;

-- array_length('{}', 1) is null, and SQL check constraints accept null. Use
-- cardinality so an empty passage is rejected rather than slipping through a
-- constraint whose name promises the opposite.
alter table astro_readings
  drop constraint if exists astro_readings_has_points;

alter table astro_readings
  add constraint astro_readings_has_points check (cardinality(points) > 0);

-- Correct the unit recorded by the first migration. The packed values and both
-- decoders have always used 1e-5 degrees; only the catalogue comment was stale.
comment on table astro_ephemeris is
  'Mean tropical longitudes per body, sampled on a per-body step. Int32 LE, 1e-5 degrees, base64. Sidereal = stored - ayanamsa.';
