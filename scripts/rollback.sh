#!/usr/bin/env bash
# Roll the live web root back to a previous release zip.
# Usage: WEB_ROOT=/var/www/chess-war RELEASES_DIR=/var/www/chess-war-releases scripts/rollback.sh 1.0.0
set -euo pipefail

version="${1:-}"
version="${version#v}"
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "usage: rollback.sh <version, e.g. 1.0.0>" >&2
  exit 2
fi

web_root="${WEB_ROOT:?set WEB_ROOT to the live web root}"
releases_dir="${RELEASES_DIR:?set RELEASES_DIR to the folder holding the release zips}"
zip="$releases_dir/chess-war-v$version.zip"

if [[ ! -f "$zip" ]]; then
  echo "no such release zip: $zip" >&2
  exit 1
fi
unzip -tq "$zip" >/dev/null
unzip -Z1 "$zip" | grep -qx 'index.html' || { echo "zip has no index.html at its top level" >&2; exit 1; }

# Unpack next to the web root first so a bad zip never touches the live site.
staging="$(mktemp -d "${web_root%/}.rollback.XXXXXX")"
trap 'rm -rf "$staging"' EXIT
unzip -q "$zip" -d "$staging"

# Keep what is being replaced so the rollback itself can be undone.
backup="${web_root%/}.before-rollback-$(date -u +%Y%m%dT%H%M%SZ)"
mv "$web_root" "$backup"
mv "$staging" "$web_root"
trap - EXIT
chmod 755 "$web_root"

echo "Rolled back $web_root to v$version"
echo "Previous contents kept at $backup"
