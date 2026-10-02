#!/usr/bin/env bash
#
# Ships the site to AWS Amplify Hosting.
#
# This is a manual (zip) deployment rather than Amplify's GitHub integration, so
# it needs no OAuth app installed on the repo and no build minutes: the site has
# no build step, so there is nothing for Amplify to build. Run it after pushing,
# or on its own; what gets deployed is the working tree, not the remote.
#
#   ./scripts/deploy-aws.sh
#
# Requires: aws CLI with credentials for the account below, curl, zip.
set -euo pipefail

APP_ID="${AMPLIFY_APP_ID:-d28kkscnmmgnma}"
BRANCH="${AMPLIFY_BRANCH:-main}"
REGION="${AWS_REGION:-us-east-1}"

cd "$(dirname "$0")/.."

# Preserve every option and source choice before releasing this revision.
# A failed backup stops deployment; identical catalogues reuse their snapshot.
node scripts/archive-settings.mjs --save

# Only what the site actually serves. Tests, generator scripts and the git
# history stay out of the bundle.
STAGE="$(mktemp -d)/site"
mkdir -p "$STAGE"
cp -R index.html terms.html css js data "$STAGE/"

# Amplify serves these with cache-control: public, max-age=604800 - a week -
# and nothing here revalidates, so a returning browser does not even ask
# whether a file changed. That produced a half-updated app: js/yogas.js was
# refetched and data/frequencies.js was not, so new yogas appeared on the card
# with no frequency beside them, because the cached table predated them.
#
# The site has no build step and should not grow one, so the version is stamped
# into the copy being shipped rather than into the repo. Each asset gets the
# first ten characters of its own SHA-256, so a file that did not change keeps
# its URL and stays cached, and one that did gets a URL no browser has seen.
STAMP=$(cd "$STAGE" && python3 - <<'STAMPER'
import hashlib, io, os, re

stamped = 0

def version(path):
    with open(path, 'rb') as fh:
        return hashlib.sha256(fh.read()).hexdigest()[:10]

def rewrite(match):
    global stamped
    attr, path = match.group(1), match.group(2)
    if not os.path.exists(path):
        return match.group(0)
    stamped += 1
    return '%s="%s?v=%s"' % (attr, path, version(path))

for html in ('index.html', 'terms.html'):
    page = io.open(html, encoding='utf-8').read()
    page = re.sub(r'\b(src|href)="((?:js|css|data)/[^"?]+)"', rewrite, page)
    io.open(html, 'w', encoding='utf-8').write(page)
print(stamped)
STAMPER
)
echo "cache-busted: $STAMP asset references"

BUNDLE="$(mktemp -d)/site.zip"
(cd "$STAGE" && zip -q -r "$BUNDLE" index.html terms.html css js data -x '*.DS_Store')
echo "bundle: $(du -h "$BUNDLE" | cut -f1)"

read -r JOB_ID UPLOAD_URL < <(aws amplify create-deployment \
  --app-id "$APP_ID" --branch-name "$BRANCH" --region "$REGION" \
  --query '[jobId,zipUploadUrl]' --output text)

curl -sS -X PUT -H 'Content-Type: application/zip' --upload-file "$BUNDLE" "$UPLOAD_URL"

aws amplify start-deployment \
  --app-id "$APP_ID" --branch-name "$BRANCH" --region "$REGION" \
  --job-id "$JOB_ID" --output text --query 'jobSummary.status'

# Amplify reports failures only in the job record, so wait for a verdict rather
# than assuming the upload succeeding means the deploy did.
for _ in $(seq 1 40); do
  STATUS=$(aws amplify get-job --app-id "$APP_ID" --branch-name "$BRANCH" \
    --job-id "$JOB_ID" --region "$REGION" --query 'job.summary.status' --output text)
  case "$STATUS" in
    SUCCEED) echo "deployed: https://${BRANCH}.${APP_ID}.amplifyapp.com"; exit 0 ;;
    FAILED|CANCELLED) echo "deployment $STATUS (job $JOB_ID)" >&2; exit 1 ;;
  esac
  sleep 5
done
echo "still $STATUS after 200s (job $JOB_ID)" >&2
exit 1
