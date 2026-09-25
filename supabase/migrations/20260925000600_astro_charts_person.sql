-- Who the chart is for, beyond the four keys that identify it.
--
-- None of these change a calculation. Gender is kept because some classical
-- readings turn on it, celebrity because a collection of charts is usually part
-- study material and part people one knows, and the note because the reason a
-- chart was cast is the thing most easily forgotten.
--
-- Gender is deliberately not required and defaults to unstated: a chart is
-- cast from a moment and a place, and refusing to draw one without it would be
-- inventing a dependency the subject does not have.

alter table astro_charts
  add column if not exists gender    text    not null default 'unstated',
  add column if not exists celebrity boolean not null default false,
  add column if not exists note      text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'astro_charts_gender_known') then
    alter table astro_charts add constraint astro_charts_gender_known
      check (gender in ('unstated', 'female', 'male', 'other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'astro_charts_note_len') then
    alter table astro_charts add constraint astro_charts_note_len
      check (note is null or length(note) <= 2000);
  end if;
end $$;

comment on column astro_charts.gender is
  'Unstated by default. Some classical readings turn on it; no calculation here does.';
comment on column astro_charts.celebrity is
  'Marks a chart kept for study rather than for someone known.';
comment on column astro_charts.note is
  'Free text about the person, up to 2000 characters.';

create index if not exists astro_charts_celebrity
  on astro_charts (owner_token, celebrity) where celebrity;
