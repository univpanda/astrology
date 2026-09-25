/**
 * Loads the generated ephemeris into astro_ephemeris.
 *
 *   node scripts/build-ephemeris.mjs /tmp/eph
 *   DATABASE_URL=... node scripts/load-ephemeris.mjs /tmp/eph
 *
 * Emits SQL on stdout rather than connecting itself, so the load can be reviewed
 * before it runs and replayed with psql:
 *
 *   node scripts/load-ephemeris.mjs /tmp/eph | psql "$DATABASE_URL" -v ON_ERROR_STOP=1
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] || 'ephemeris-out';
const files = readdirSync(dir).filter((f) => /^\d+\.json$/.test(f)).sort();

const esc = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const rows = [];

for (const file of files) {
  const item = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  for (const [body, b] of Object.entries(item.bodies)) {
    rows.push(`(${item.bucket}, ${esc(body)}, ${b.step}, ${b.firstJd}, ${b.count}, ${esc(b.data)})`);
  }
}

// One transaction, and an upsert so a reload after regenerating the data is safe
// to run twice.
console.log('begin;');
console.log('insert into astro_ephemeris (decade, body, step_days, first_jd, sample_count, longitudes) values');
console.log(rows.join(',\n'));
console.log(`on conflict (decade, body) do update set
  step_days = excluded.step_days,
  first_jd = excluded.first_jd,
  sample_count = excluded.sample_count,
  longitudes = excluded.longitudes;`);
console.log('commit;');
console.error(`${rows.length} rows from ${files.length} decades`);
