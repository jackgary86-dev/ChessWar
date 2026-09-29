# Rollback plan

If a release on the live Game Portal is broken, put the previous release back. Every release is a zip named `chess-war-vX.Y.Z.zip` (see the release process in the README). Keep the **previous release's zip on the live server** at all times, in a folder outside the web root.

## Who decides

Connor (owner) decides. Anyone on the team who sees a launch blocker (game does not load, matches cannot finish, saves corrupt, wrong rules) tells Connor with the symptom and the release version. Connor answers "roll back" or "fix forward". If Connor cannot be reached and the game is unplayable, any team member with server access may roll back and must report it straight away.

## One-command rollback

On the live server:

```sh
WEB_ROOT=/path/to/live/web/root \
RELEASES_DIR=/path/to/kept/release/zips \
scripts/rollback.sh 0.9.0
```

The script checks the version, checks the zip exists and is valid and has `index.html` at its top, unpacks it beside the web root, and only then swaps it in. The replaced site is kept at `<WEB_ROOT>.before-rollback-<UTC time>`, so a rollback can itself be undone by swapping the folders back. It changes nothing if any check fails.

The online server (`npm run server`) is separate from the static files. If the broken release changed the online protocol, roll back and restart the server from the same version too.

## Verify

1. Open the live URL in a private window (no cache). Hard refresh.
2. The title screen loads and the footer/version matches the version you rolled back to.
3. Start a vs-AI match and play one round to the fight result.
4. Resume a save made before the incident (saves are versioned in local storage; the older build must still read them, otherwise say so in the incident note).
5. If online play is live, create a room and join it from a second browser.

## After a rollback

- Tell the team what was rolled back, to which version, and why.
- Open a `sev:blocker` bug with the symptom and the seed if there is one.
- Do not delete the `before-rollback` folder until the fixed release is live.

## Rehearsal (before launch)

Rehearse once on **staging**: deploy the candidate, run the command above with the previous version, run the verify list, then deploy the candidate again. This needs a person on the staging box, so it is not done by the routine.
