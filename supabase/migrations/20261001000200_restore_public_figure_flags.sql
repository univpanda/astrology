-- Shared URLs did not carry the public-figure checkbox. Restoring one therefore
-- saved the unchecked default over an existing row. These are the public people
-- observed with that exact damage. Match the recorded birth as well as the name:
-- a private chart is not public merely because its subject has the same name.
update astro_charts
set celebrity = true,
    updated_at = now()
where (lower(name), birth_date, birth_time) in (values
  ('celine dion',         date '1968-03-30', time '12:15:00'),
  ('donald trump',        date '1946-06-14', time '10:54:00'),
  ('kareem abdul-jabbar', date '1947-04-16', time '18:30:00'),
  ('pope benedict xvi',   date '1927-04-16', time '04:15:00')
)
and celebrity = false;
