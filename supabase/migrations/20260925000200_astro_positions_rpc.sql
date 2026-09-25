-- One round trip for a whole chart's worth of longitudes.
--
-- The first cut of the edge function fetched the decade's packed rows and
-- interpolated in JavaScript, which moved ~167 KB per request to extract 18
-- numbers. This does the decoding and interpolation inside Postgres and returns
-- the numbers, turning the request into a few hundred bytes.
--
-- Two moments are taken at once because every chart needs a second sample half a
-- day later to report speed and retrogression.

create or replace function astro_positions(
  p_jd       double precision,
  p_jd_later double precision default null,
  p_true_node boolean default false
)
returns table (body text, longitude double precision, longitude_later double precision)
language sql stable parallel safe as $$
  select
    case when b.name = 'rahuTrue' then 'rahu' else b.name end as body,
    astro_longitude(b.name, p_jd) as longitude,
    astro_longitude(b.name, coalesce(p_jd_later, p_jd + 0.5)) as longitude_later
  from (
    select unnest(array['sun','moon','mercury','venus','mars','jupiter','saturn']) as name
    union all
    select case when p_true_node then 'rahuTrue' else 'rahu' end
  ) b;
$$;

comment on function astro_positions(double precision, double precision, boolean) is
  'Mean tropical longitudes for every graha at a moment, plus half a day later for speed. Sidereal = longitude minus the ayanamsa.';

grant execute on function astro_positions(double precision, double precision, boolean) to anon, authenticated;
