-- A question against the record, raised by whoever saved it.
--
-- It is about the chart's details and not its reading: a birth time taken from
-- memory, a place that is one of two of that name, a date off a document nobody
-- has checked. The chart still draws, and nothing here changes what it draws;
-- the flag is the note that it may be drawn from the wrong moment, which is the
-- thing most easily forgotten between casting a chart and reading it again.

alter table astro_charts
  add column if not exists flagged boolean not null default false;

comment on column astro_charts.flagged is
  'The chart''s details are in doubt and want checking. Changes no calculation.';

create index if not exists astro_charts_flagged
  on astro_charts (owner_token, flagged) where flagged;
