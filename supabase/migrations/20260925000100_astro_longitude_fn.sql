-- Read the packed ephemeris from SQL.
--
-- The samples are stored packed (thousands per row) because one row per sample
-- would cost ~35 MB of Postgres row overhead for 3.8 MB of numbers. The price of
-- packing is that the data is opaque to SQL, and this function buys it back:
--
--   select astro_longitude('mars', 2446146.7256944445);
--
-- What comes back is MEAN TROPICAL longitude. A sidereal longitude is that minus
-- the ayanamsa, which the application supplies; the ayanamsa is deliberately not
-- baked in here so all five systems keep working off one table.

create or replace function astro_sample(payload bytea, index_at integer)
returns double precision
language sql immutable strict parallel safe as $$
  -- Int32 little-endian, in units of 1e-5 degrees. Values are always positive
  -- (0 to 36,000,000), so no sign extension is needed.
  select ( get_byte(payload, index_at * 4)
         + (get_byte(payload, index_at * 4 + 1)::bigint << 8)
         + (get_byte(payload, index_at * 4 + 2)::bigint << 16)
         + (get_byte(payload, index_at * 4 + 3)::bigint << 24)
         )::double precision / 1e5;
$$;

comment on function astro_sample(bytea, integer) is
  'One packed sample as degrees. Internal helper for astro_longitude.';

create or replace function astro_longitude(p_body text, p_jd double precision)
returns double precision
language plpgsql stable parallel safe as $$
declare
  r          astro_ephemeris%rowtype;
  payload    bytea;
  x          double precision;
  i          integer;
  f          double precision;
  p0 double precision; p1 double precision;
  p2 double precision; p3 double precision;
  value      double precision;
begin
  -- Decades overlap by their padding samples, so more than one row can serve a
  -- given moment; either interpolates correctly, so take the earlier.
  select * into r
    from astro_ephemeris
   where body = p_body
     and p_jd >= first_jd + step_days
     and p_jd <= first_jd + (sample_count - 3) * step_days
   order by decade
   limit 1;
  if not found then
    return null;
  end if;

  payload := decode(r.longitudes, 'base64');
  x := (p_jd - r.first_jd) / r.step_days;
  i := floor(x)::integer;
  f := x - i;

  p1 := astro_sample(payload, i);
  -- Lift neighbours onto one branch around p1; the samples wrap through 360.
  p0 := astro_sample(payload, i - 1);
  p2 := astro_sample(payload, i + 1);
  p3 := astro_sample(payload, i + 2);
  p0 := p1 + (((p0 - p1 + 180)::numeric % 360 + 360)::numeric % 360 - 180)::double precision;
  p2 := p1 + (((p2 - p1 + 180)::numeric % 360 + 360)::numeric % 360 - 180)::double precision;
  p3 := p1 + (((p3 - p1 + 180)::numeric % 360 + 360)::numeric % 360 - 180)::double precision;

  -- Catmull-Rom, the same interpolation the application code uses.
  value := p1 + 0.5 * f * (p2 - p0
         + f * (2 * p0 - 5 * p1 + 4 * p2 - p3
         + f * (3 * (p1 - p2) + p3 - p0)));

  return ((value::numeric % 360 + 360)::numeric % 360)::double precision;
end $$;

comment on function astro_longitude(text, double precision) is
  'Mean tropical longitude in degrees for a body at a Julian Day (UT). Sidereal = this minus the ayanamsa.';

grant execute on function astro_longitude(text, double precision) to anon, authenticated;
