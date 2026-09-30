-- When the chart was last looked at.
--
-- Distinct from updated_at, which says when the record was last written. The
-- list is read far more often than it is edited, and what a reader wants at the
-- top is the chart they were working on, not the one they last corrected a
-- spelling in. Reopening deliberately does not save, so updated_at cannot carry
-- this without conflating the two.
--
-- Null until a chart has been opened once. Rows saved before this existed sort
-- after everything opened since, which is the honest answer: nothing is known
-- about when they were last read.

alter table astro_charts
  add column if not exists opened_at timestamptz;

comment on column astro_charts.opened_at is
  'When the chart was last opened for reading. Null if never opened since the column existed.';

create index if not exists astro_charts_opened
  on astro_charts (owner_token, opened_at desc nulls last);
