#!/usr/bin/env bash
#
# Deploys the site's Edge Functions to Supabase.
#
# js/astro.js is a classic script on purpose: index.html has
# to work when opened straight off the disk, and a module script cannot. Deno
# needs ESM, so this generates wrapper copies with an export appended rather than
# keeping two hand-maintained versions that could drift.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT_REF="${SUPABASE_PROJECT_REF:-deiefjnwbfcywsaaqqbs}"
node scripts/build-edge-module.mjs

# These are deliberately reachable without a Supabase JWT. Chart and readings
# are public; kundalis authorises every operation with its own unguessable owner
# token and reaches its RLS-closed table only through the service role inside the
# function. Requiring a JWT here would break that account-free capability model.
for function_name in chart readings kundalis; do
  supabase functions deploy "$function_name" --project-ref "$PROJECT_REF" --no-verify-jwt
done

echo "deployed chart, readings and kundalis to https://${PROJECT_REF}.supabase.co/functions/v1/"
