# Deploying

**Coolify is where this is going.** `dev.arethebrewersontv.com` already runs there. Production
follows; see the cutover list below.

**`render.yaml` stays, and stays working.** Not as a leftover — as the fallback,
and as the only written record of what the service actually needs. Deleting it
would take the heap cap, the health path and the branch mapping with it.

- **Coolify, or any Docker host** — `Dockerfile` and `.dockerignore`.
- **Render** — `render.yaml`, deploying `arethebrewersontv.com` from `main` and `dev.arethebrewersontv.com` from
  `dev`.

The same commit works either way. The Dockerfile is not read by Render and
`render.yaml` is not read by Coolify, so they cannot contradict each other at
runtime — but they can drift, and the list at the bottom says where. Keeping the
fallback is only worth anything if it still works, so the drift list is the part
of this file to actually maintain.

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

## PUBLIC_ORIGIN — set this, or the social cards are wrong

`PUBLIC_ORIGIN` fixes the canonical and `og:` URLs for a deployment. **Set it on
Coolify.** Without it the page advertises itself over `http://` on an HTTPS site.

    PUBLIC_ORIGIN=https://dev.arethebrewersontv.com

This is not theoretical. It was live on `dev.arethebrewersontv.com` and looked fine in a browser,
which is why it needs writing down:

    <link rel="canonical" href="https://dev.arethebrewersontv.com/records">
    <meta property="og:url"   content="http://dev.arethebrewersontv.com/records">
    <meta property="og:image" content="http://dev.arethebrewersontv.com/og/records/overview.png">

Both tags are built from one variable in `server.js`, so the server cannot have
emitted two schemes. The proxy rewrote the `href` and left the `meta content`
alone — so the visible tag was correct and the two that matter to a social
scraper were not. A browser shows nothing wrong; the card is what breaks.

The cause is that the app saw no `x-forwarded-proto` and fell back to `http`.
Render sends it and has always been correct; Coolify did not.

`PUBLIC_ORIGIN` also settles a second thing the header path gets wrong: without
it, *any* Host header becomes the canonical URL, so reaching the app by its
container name or a stray domain pointed at the same proxy makes every page
advertise that instead.

`render.yaml` deliberately does not set it. Render's headers work, and pinning
an origin there would change the canonical tags on a production site that is
currently correct — worth doing on purpose, as its own change, not as a side
effect of this one.

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

## Moving production to Coolify

In order, because two of these are only correct once the one before is done.

1. **Set `PUBLIC_ORIGIN=https://arethebrewersontv.com`** on the production service — the apex,
   not `www`. Without it the `og:` tags come out `http://` behind the proxy; see
   the section above. Set it *before* DNS moves, so the first request served is
   already right.

2. **Give the container at least 512MB.** `NODE_OPTIONS=--max-old-space-size=400`
   is baked into the image and assumes it.

3. **Point DNS at Coolify** and let it issue a certificate. Both `arethebrewersontv.com` and
   `www.arethebrewersontv.com` if you want the second to keep resolving.

4. **Check the things a 200 will not tell you**, because a page can answer 200
   and be wrong — that is how this repo shipped every past season as 0-0:

       curl -s https://arethebrewersontv.com/records | grep -E 'og:url|canonical'
       curl -sI https://arethebrewersontv.com/og/records/overview.png   # image/png, not an error page

   Then `npm run render:capture` against a local checkout of `main` and compare.
   `/records`, `/vs` and `/history` came out byte-identical to the container on
   the dev site; the season pages differ only in the client-side share link,
   which embeds `window.location.href`.

5. **Then deal with Render.** `render.yaml` has `autoDeploy: true`, so Render
   keeps building on every push to a service nobody visits. Suspending the
   services in the dashboard stops that without touching the blueprint — the
   config survives, the builds do not.

`www` canonicalisation comes free with step 1: with the origin pinned to the
apex, a visitor arriving at `www` gets a canonical tag pointing at the apex.
Render never did that, because it derives the origin from whatever `Host` header
turned up, so each hostname self-canonicalised.

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

`PUBLIC_ORIGIN` is deliberately absent from that table. Coolify needs it and
`render.yaml` does not set it, which is not drift — Render derives the origin
from headers and gets it right. If `render.yaml` ever gains it, the two values
have to agree, and nothing will check that either.
