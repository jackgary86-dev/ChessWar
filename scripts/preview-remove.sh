#!/usr/bin/env bash
# Remove a PR preview from the staging box.
# Usage: scripts/preview-remove.sh <pr-number>
# Env:   PREVIEW_HOST, PREVIEW_USER, PREVIEW_ROOT, PREVIEW_SSH_KEY_FILE (optional)
set -euo pipefail

pr="${1:?usage: preview-remove.sh <pr-number>}"
[[ "$pr" =~ ^[0-9]+$ ]] || { echo "PR number must be digits" >&2; exit 2; }
: "${PREVIEW_HOST:?}" "${PREVIEW_USER:?}" "${PREVIEW_ROOT:?}"

ssh_opts=(-o BatchMode=yes -o StrictHostKeyChecking=accept-new)
[[ -n "${PREVIEW_SSH_KEY_FILE:-}" ]] && ssh_opts+=(-i "$PREVIEW_SSH_KEY_FILE")

# The folder name is built from digits only, so this can never leave PREVIEW_ROOT.
ssh "${ssh_opts[@]}" "$PREVIEW_USER@$PREVIEW_HOST" rm -rf -- "'$PREVIEW_ROOT/pr-$pr'"
echo "removed pr-$pr"
