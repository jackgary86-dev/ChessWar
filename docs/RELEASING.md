# Releasing

Releases are tagged `vX.Y.Z` and published by `.github/workflows/release.yml`, which attaches `chess-war-vX.Y.Z.zip` (the static `dist/` build, ready to unzip into a web root) to the GitHub Release.

1. Move the `[Unreleased]` entries in `CHANGELOG.md` under a new `## [X.Y.Z] - YYYY-MM-DD` heading and leave an empty `[Unreleased]` above it.
2. Set `"version": "X.Y.Z"` in `package.json` and `package-lock.json` (`npm version X.Y.Z --no-git-tag-version`).
3. Open a PR with those two changes, get it merged.
4. Tag the merge commit and push the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`.
5. The workflow refuses the release if the tag and `package.json` disagree, or if lint, tests or the build fail. Its release text is the CHANGELOG section for that version, so a missing section also fails it.

Check a release locally before tagging:

```
npm run build
scripts/package-release.sh X.Y.Z
npx tsx scripts/release-notes.ts X.Y.Z
```
