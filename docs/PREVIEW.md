# PR preview deploys

Every pull request from this repository is built and copied to the staging box (NixonExpress) by
`.github/workflows/preview.yml`. The workflow comments the link on the PR and updates that comment
on each push. When the PR closes or merges, the preview folder is deleted.

Previews live at `<PREVIEW_BASE_URL>/pr-<number>/`. The build uses relative asset paths, so it works
from a subfolder. Forks never deploy (they get no secrets).

## One-time setup (needs a person with access to the staging box)

1. On the staging box, make a web root that its web server serves, for example `/var/www/chess-war-previews`, writable by a deploy user. Install `rsync` and enable SSH for that user.
2. Create a key pair used only for this: `ssh-keygen -t ed25519 -f preview_key -N ''`. Add `preview_key.pub` to the deploy user's `~/.ssh/authorized_keys`. Use a dedicated user that owns only the previews folder, because the remove step runs `rm -rf` over SSH.
3. If the staging box is only on the home network, GitHub's hosted runners cannot reach it. Either expose SSH through a tunnel or forward, or install a self-hosted runner on the home network and change `runs-on` to its label in `preview.yml`.
4. Add these repository secrets (Settings, Secrets and variables, Actions):

   | Secret | Example |
   |---|---|
   | `PREVIEW_HOST` | `nixonexpress.example` |
   | `PREVIEW_USER` | `deploy` |
   | `PREVIEW_ROOT` | `/var/www/chess-war-previews` |
   | `PREVIEW_BASE_URL` | `http://nixonexpress.example/chess-war-previews` |
   | `PREVIEW_SSH_KEY` | contents of `preview_key` |

5. Open or push to a test PR and check the comment appears, the link plays a match, and closing the PR removes the folder.

Until the secrets are set both jobs print a note and skip, so the workflow never fails a PR.

## By hand

```
npm run build
PREVIEW_HOST=... PREVIEW_USER=... PREVIEW_ROOT=... scripts/preview-deploy.sh 123
PREVIEW_HOST=... PREVIEW_USER=... PREVIEW_ROOT=... scripts/preview-remove.sh 123
```
