#!/usr/bin/env bash
#
# Apply the lesson library to the database.
#
# The repo is the source of truth and the table is a copy, so this is safe to run
# whenever the seed files change: every statement is an upsert keyed on
# (topic, subject, condition), and re-running updates in place rather than
# duplicating. Order does not matter either, but the files are applied in
# sort_order so a partial run still leaves the foundations in.
#
#   DATABASE_URL='postgresql://...' npm run seed
#
# The connection string is in the Supabase dashboard under Project Settings,
# Database, Connection string. Use the direct connection rather than the pooler:
# the pooler rejects some multi-statement scripts.
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set." >&2
  echo "Find it in the Supabase dashboard: Project Settings, Database, Connection string." >&2
  exit 1
fi

command -v psql >/dev/null || { echo "psql is not installed." >&2; exit 1; }

cd "$(dirname "$0")/.."

# Foundations first, so a run that fails part way leaves a library that still
# starts somewhere rather than one that begins at Vipareeta Raja Yoga.
FILES=(
  supabase/seed/astro_readings_basics.sql
  supabase/seed/astro_readings_houses.sql
  supabase/seed/astro_readings_dignity.sql
  supabase/seed/astro_readings_varga.sql
  supabase/seed/astro_readings.sql
  supabase/seed/astro_readings_strength.sql
  supabase/seed/astro_readings_yogas.sql
)

for f in "${FILES[@]}"; do
  [ -f "$f" ] || { echo "missing: $f" >&2; exit 1; }
  printf '%-44s' "$f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
  echo "ok"
done

echo
echo -n "passages now in the database: "
psql "$DATABASE_URL" -tA -c 'select count(*) from astro_readings;'
psql "$DATABASE_URL" -c 'select topic, count(*) from astro_readings group by topic order by min(sort_order);'
