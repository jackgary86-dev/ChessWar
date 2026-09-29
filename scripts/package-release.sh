#!/usr/bin/env bash
# Zip the static build as chess-war-vX.Y.Z.zip in release/.
# Usage: scripts/package-release.sh <version>      (for example 1.0.0; run npm run build first)
set -euo pipefail

version="${1:?usage: package-release.sh <X.Y.Z>}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "version must look like 1.2.3" >&2; exit 2; }
dist="${RELEASE_DIST:-dist}"
[[ -f "$dist/index.html" ]] || { echo "$dist/index.html not found; run npm run build" >&2; exit 2; }

out="release/chess-war-v$version.zip"
mkdir -p release
rm -f "$out"
# Zip the contents, not the folder, so unzipping into a web root just works.
(cd "$dist" && zip -qr "$OLDPWD/$out" .)
echo "$out"
