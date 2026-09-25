-- astro_kundali -> astro_charts.
--
-- Done as its own migration rather than by editing the previous one, since that
-- one has already been applied; anyone replaying the pair ends up in the same
-- place as a database that ran them in order.

alter table if exists astro_kundali rename to astro_charts;

alter index if exists astro_kundali_identity rename to astro_charts_identity;
alter index if exists astro_kundali_owner_recent rename to astro_charts_owner_recent;
alter index if exists astro_kundali_pkey rename to astro_charts_pkey;

comment on table astro_charts is
  'Charts saved from the Jyotisha page: the name, place, date and time a chart is cast from. Scoped by an unguessable browser token; no accounts.';
