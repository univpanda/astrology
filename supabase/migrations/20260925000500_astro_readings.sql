-- Interpretive passages, keyed so a chart can look them up.
--
-- SHAPE
-- One row is one passage: a topic (what kind of thing it is about), a subject
-- (which one), and a condition (in what state). "A strong Sun" is
-- ('graha', 'Sun', 'strong'). That triple is unique, so re-seeding updates a
-- passage instead of accumulating near-copies of it.
--
-- The points are a text[] rather than one row each. A passage is read whole and
-- never queried point by point; splitting it would need a sort column and a join
-- to reassemble something that was always one thing.
--
-- WHAT IS DELIBERATELY NOT HERE
-- Any rule for when a passage applies. Whether a Sun counts as "strong" is a
-- judgement - dignity, house, combustion, aspects, or a full Shadbala - and
-- writing it as a string in a content table would hide it somewhere it cannot be
-- tested. The matching lives in code; this table holds only what is said.
--
-- Reference content, like the ephemeris: anyone may read it, only the service
-- role that seeds it may write.

create table if not exists astro_readings (
  id          uuid primary key default gen_random_uuid(),
  topic       text not null,
  subject     text not null,
  condition   text not null default 'general',
  heading     text not null,
  points      text[] not null default '{}',
  note        text,
  source      text,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint astro_readings_identity unique (topic, subject, condition),
  constraint astro_readings_topic_known check (
    topic in ('graha', 'house', 'sign', 'nakshatra', 'yoga', 'dasha', 'varga')),
  constraint astro_readings_heading_len check (length(heading) between 1 and 300),
  constraint astro_readings_has_points check (array_length(points, 1) > 0)
);

comment on table astro_readings is
  'Interpretive passages keyed by topic, subject and condition. Content only: when a passage applies is decided in code.';
comment on column astro_readings.condition is
  'The state the subject is in: strong, weak, exalted, debilitated, combust, retrograde, or general.';
comment on column astro_readings.points is
  'The passage as an ordered list. Read whole, so one row, not one row per point.';

create index if not exists astro_readings_topic_subject
  on astro_readings (topic, subject);

alter table astro_readings enable row level security;

drop policy if exists astro_readings_public_read on astro_readings;
create policy astro_readings_public_read
  on astro_readings for select
  to anon, authenticated
  using (true);
