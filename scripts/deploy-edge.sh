#!/usr/bin/env bash
#
# Deploys the chart Edge Function to Supabase.
#
# js/astro.js and js/ephemeris.js are classic scripts on purpose: index.html has
# to work when opened straight off the disk, and a module script cannot. Deno
# needs ESM, so this generates wrapper copies with an export appended rather than
# keeping two hand-maintained versions that could drift.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_REF="${SUPABASE_PROJECT_REF:-deiefjnwbfcywsaaqqbs}"
OUT=supabase/functions/chart

{ cat js/astro.js; echo; echo 'export default Astro;'; } > "$OUT/_astro.mjs"

# No JWT check: this is a public read-only calculator, and requiring a key would
# only hand every caller the same public anon key anyway.
supabase functions deploy chart --project-ref "$PROJECT_REF" --no-verify-jwt

echo "https://${PROJECT_REF}.supabase.co/functions/v1/chart"
