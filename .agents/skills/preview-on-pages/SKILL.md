---
name: preview-on-pages
description: Put a rig page preview on GitHub Pages for review, and later take its lane marker off over the same link (ADR 0003). Use for a plan's "Preview for review" and "Clean up" issues.
---

# preview-on-pages

A preview is one HTML file on a public HTTPS link (ADR 0003). GitHub Pages serves from git, so
the preview gets its own one-file repo: the clean-up can then replace its only commit, and the
marked page leaves the history too. Never put the preview in this repo.

Ask the human before each public step: creating the host repo, the first upload, and the
upload without the marker. Say what, where, who can see it and how to undo it (delete the repo).

## Save the page

```sh
PORT=8788 pnpm start &                              # marker from .env
curl -sf localhost:8788/<path> -o <dir>/index.html
```

`<dir>` is outside this repo. Check: the marker appears once, no `<script`, no external `src=`.

## First upload

```sh
cd <dir> && git init -b main && git add index.html && git commit -m "Preview: <path>"
gh repo create <owner>/<name> --public --source . --push
gh api -X POST repos/<owner>/<name>/pages -f 'source[branch]=main' -f 'source[path]=/'
```

The link is `https://<owner>.github.io/<name>/`. Before sending it, wait until
`gh api repos/<owner>/<name>/pages --jq .status` says `built`, then `curl` the link and `cmp` it
with the saved file. Keep the "Preview for review" issue open until the reviewer has looked.

## Clean up, once the review is in

```sh
LANE_MARKER= PORT=8788 pnpm start &                 # banner: "no marker set"
curl -sf localhost:8788/<path> -o <dir>/index.html
cd <dir> && git checkout --orphan clean && git add index.html \
  && git commit -m "Preview: <path>, no lane marker" \
  && git branch -D main && git branch -m main && git push --force origin main
```

An empty `LANE_MARKER` in the environment wins over `.env`. A harness in auto mode may refuse
the force-push; then hand the human these lines as a script. Done when the link, fetched again,
has no marker and reads "no marker set".
