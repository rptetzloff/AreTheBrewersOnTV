# Deploying

Two ways, both live at once. Neither is a migration away from the other.

- **Render** — `render.yaml`, deploying `arethebrewersontv.com` from `main` and
  `dev.arethebrewersontv.com` from `dev`. Unchanged.
- **Coolify, or any Docker host** — `Dockerfile` and `.dockerignore`.

The same commit works either way. The Dockerfile is not used by Render, and
`render.yaml` is not read by Coolify, so they cannot contradict each other at
runtime — but they can drift, and the list at the bottom says where.

## What the image is

`node:24-slim`, production dependencies only, `node server.js`.

Debian slim rather than Alpine deliberately: `@resvg/resvg-js` ships prebuilt
native binaries per libc, and the musl ones are where the trouble is. The social
cards are the only thing that would break, and they would break at request time
on one route rather than at build time.

Verified without building an image, because the Docker daemon was not running
when this was written. Everything below was checked by reproducing the image's
conditions on the host — `npm ci --omit=dev`, `NODE_ENV=production`,
`plays.lfs.csv` moved aside:

- `/`, `/1982`, `/records`, `/history`, `/vs`, `/managers` and a box score all
  answer 200
- `/og/1982.png` renders a real 77KB PNG, so the native dependency works with
  dev dependencies absent
- the indices load in about four seconds
- the health-check command exits 0 against a live server and 1 against a dead one

**The image itself has not been built or run.** That is the gap; build it once
before pointing a domain at it.

## The play-by-play file

`data/plays.lfs.csv` is 388MB, tracked in Git LFS, and **not needed at runtime**.
It is input to `scripts/build-indices.mjs`, which produces the committed
`data/indices/`; the server prefers those artifacts and only falls back to the
CSVs if one is missing or stale.

`.dockerignore` keeps it out of the image, taking `data/` from 464MB to 76MB.

**A `.dockerignore` does not stop the clone.** If the build host has Git LFS
installed, it downloads the file before Docker sees the working tree — costing
time and disk on every build for something the image then discards. Set

    GIT_LFS_SKIP_SMUDGE=1

in the build environment, or leave LFS uninstalled on the builder. The pointer
file is checked out instead of the content, which is all the build needs.

The other 76MB stays. gameinfo, batting, pitching, fielding, biofile and
teamstats are the fallback the server reads when an artifact is missing, and
dropping them would turn a slow boot into a broken one.

## Coolify

- **Port** — the container listens on `PORT`, defaulting to 3000. `EXPOSE 3000`
  is declared.
- **Memory** — `NODE_OPTIONS=--max-old-space-size=400` is baked in, matching
  `render.yaml`. The indices need more than Node's default cap on a 512MB
  instance. Give the container at least 512MB; it will not start reliably on
  256MB.
- **Health check** — `HEALTHCHECK` in the Dockerfile hits `/` with Node's own
  fetch. `node:slim` carries no curl or wget, which is why it is not a shell
  one-liner.
- **Branch** — point one service at `main` and, if you want a staging copy, one
  at `dev`. That is the split `render.yaml` already describes.
- **Build cache** — the Dockerfile copies `package.json` and `package-lock.json`
  before the rest, so a data refresh does not reinstall dependencies.

## What can drift

These are written in two places and nothing checks that they agree:

| | `render.yaml` | `Dockerfile` |
|---|---|---|
| heap cap | `NODE_OPTIONS` env var | `ENV NODE_OPTIONS` |
| start command | `startCommand` | `CMD` |
| health path | `healthCheckPath: /` | `HEALTHCHECK` |
| Node version | whatever Render picks for `runtime: node` | pinned `node:24-slim` |

The last row is the one to watch: the Dockerfile pins a major version and Render
does not, so the two can be running different Node releases without anything
saying so.
