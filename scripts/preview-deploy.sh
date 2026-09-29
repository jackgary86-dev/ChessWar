#!/usr/bin/env bash
# Upload a built dist/ to the staging box as a PR preview.
# Usage: scripts/preview-deploy.sh <pr-number>
# Env:   PREVIEW_HOST, PREVIEW_USER, PREVIEW_ROOT (web root that holds one folder per PR),
#        PREVIEW_SSH_KEY_FILE (optional path to a private key), PREVIEW_DIST (default dist)
set -euo pipefail

pr="${1:?usage: preview-deploy.sh <pr-number>}"
[[ "$pr" =~ ^[0-9]+$ ]] || { echo "PR number must be digits" >&2; exit 2; }
: "${PREVIEW_HOST:?}" "${PREVIEW_USER:?}" "${PREVIEW_ROOT:?}"
dist="${PREVIEW_DIST:-dist}"
[[ -f "$dist/index.html" ]] || { echo "$dist/index.html not found; run npm run build" >&2; exit 2; }

ssh_opts=(-o BatchMode=yes -o StrictHostKeyChecking=accept-new)
[[ -n "${PREVIEW_SSH_KEY_FILE:-}" ]] && ssh_opts+=(-i "$PREVIEW_SSH_KEY_FILE")
target="$PREVIEW_ROOT/pr-$pr"

# --delete so a new push replaces the old preview exactly. The build uses relative asset paths (base './').
rsync -az --delete -e "ssh ${ssh_opts[*]}" "$dist"/ "$PREVIEW_USER@$PREVIEW_HOST:$target/"
echo "deployed pr-$pr to $target"
