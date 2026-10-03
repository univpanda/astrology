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
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Commit the release before deploying; the working tree is not clean." >&2
  exit 1
fi
REVISION="$(git rev-parse HEAD)"
RELEASE_DIR="$(mktemp -d)"
trap 'rm -rf "$RELEASE_DIR"' EXIT
git archive "$REVISION" | tar -x -C "$RELEASE_DIR"
cd "$RELEASE_DIR"

PROJECT_REF="${SUPABASE_PROJECT_REF:-deiefjnwbfcywsaaqqbs}"
node scripts/build-edge-module.mjs

# These are deliberately reachable without a Supabase JWT. Chart and readings
# are public; kundalis and settings authorise operations with an unguessable owner
# token and reaches its RLS-closed table only through the service role inside the
# function. Requiring a JWT here would break that account-free capability model.
for function_name in chart readings kundalis settings; do
  supabase functions deploy "$function_name" --project-ref "$PROJECT_REF" --no-verify-jwt
done

echo "deployed chart, readings, kundalis and settings at revision $REVISION to https://${PROJECT_REF}.supabase.co/functions/v1/"
