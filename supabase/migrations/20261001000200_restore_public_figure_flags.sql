-- Shared URLs did not carry the public-figure checkbox. Restoring one therefore
-- saved the unchecked default over an existing row. These are the public people
-- observed with that exact damage; names are sufficient because the property is
-- true for every chart of the person, independent of owner or recorded time.
update astro_charts
set celebrity = true,
    updated_at = now()
where lower(name) in (
  'celine dion',
  'donald trump',
  'kareem abdul-jabbar',
  'pope benedict xvi'
)
and celebrity = false;
