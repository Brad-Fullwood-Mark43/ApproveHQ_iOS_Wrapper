#!/usr/bin/env bash
set -euo pipefail

BASE_REF="${1:-origin/main}"
if ! git rev-parse "$BASE_REF" >/dev/null 2>&1; then
  echo "Help docs check: base ref $BASE_REF is unavailable; skipping."
  exit 0
fi

CHANGED="$(git diff --name-only "$BASE_REF"...HEAD)"
UI_CHANGED="$(printf '%s\n' "$CHANGED" | grep -E '^(branding/|www/(index\.html|app\.css|app\.js|.*workflow.*\.js|.*settings.*\.js|team-member-details\.js|new-job-customer\.js|onboarding\.js))$' || true)"
DOC_CHANGED="$(printf '%s\n' "$CHANGED" | grep -E '^(docs/ONBOARDING\.md|docs/help/|www/onboarding\.js)' || true)"

if [[ -n "$UI_CHANGED" && -z "$DOC_CHANGED" ]]; then
  echo 'ERROR: User-visible UI/branding changed without an onboarding/help documentation review.'
  echo 'Changed UI files:'
  printf '%s\n' "$UI_CHANGED"
  echo
  echo 'Review docs/ONBOARDING.md and docs/help/SCREENSHOTS.md.'
  echo 'Update affected screenshots/help, or update the screenshot manifest to record that the existing documentation remains accurate.'
  exit 1
fi

if [[ -n "$UI_CHANGED" ]]; then
  echo 'ApproveHQ help-doc review detected for UI/branding changes.'
else
  echo 'No help-documentation-triggering UI/branding changes detected.'
fi
