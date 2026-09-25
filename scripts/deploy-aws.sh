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

# Only what the site actually serves. Tests, generator scripts and the git
# history stay out of the bundle.
BUNDLE="$(mktemp -d)/site.zip"
zip -q -r "$BUNDLE" index.html css js data -x '*.DS_Store'
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
