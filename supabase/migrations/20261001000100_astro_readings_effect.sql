alter table astro_readings
  add column if not exists effect text;

alter table astro_readings
  drop constraint if exists astro_readings_effect_known;

alter table astro_readings
  add constraint astro_readings_effect_known check (
    effect is null or effect in ('good', 'bad', 'mixed')
  );

comment on column astro_readings.effect is
  'The sourced tendency of a yoga passage: good, bad, or mixed. Null for non-yoga passages.';
