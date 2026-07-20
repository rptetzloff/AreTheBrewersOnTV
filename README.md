# Are the Brewers On TV?

A simple web app that answers the question every Milwaukee fan asks daily: are the Brewers on TV today?

Beyond today's answer, the site carries the full franchise record — every season from 1969 (including the inaugural Seattle Pilots year) to the present, with game-by-game schedules, results, and historical box scores.

**Live site:** [arethebrewersontv.com](https://arethebrewersontv.com)

Built with [Claude Code](https://claude.ai/code). Served by a small Node web service and hosted on [Render](https://render.com).

## The Answer

For the current season, the app pulls the schedule and today's game from the public ESPN MLB API. Each listed broadcast is classified using the channel metadata in `data/channel_lookup.csv` and `data/provider_lookup.csv`: a channel of type broadcast, cable, or regional counts as "on TV" even when ESPN labels it "Streaming" (e.g. Brewers.TV, which is carried on DirecTV, Spectrum, Xfinity, and others). Only when a channel has no metadata does the app fall back to ESPN's own type. When a game is in progress, the app polls ESPN every 30 seconds and shows the live score.

Channel information is based on publicly available channel listings — the site reminds visitors to check their local channel guide for the most accurate broadcast information.

## Linking to a Specific Season

Append the year to the URL to jump directly to any season:

```
example.com/1982
example.com/?season=1982
```

Both formats are supported. The web service (`server.js`) serves `index.html` for `/YYYY` routes directly — no separate rewrite rule is needed — and injects a season-specific link preview for that URL (see [Social Cards](#social-cards--link-previews)).

## Streak Box

Below the main answer, a collapsible streak box shows a short summary derived from the currently viewed season's game results:

- **Current season** — reports the opening win streak (games before the first loss) and the current active win streak.
- **Past seasons** — reports how long the opening undefeated run lasted (number of games and number of days until the first loss).

The box is hidden automatically when there are no completed games to analyze (e.g. a future season or an empty schedule).

## On This Day

Near the top of the page, below the streak box, the app surfaces a random Brewers game played on (or within a few days of) today's calendar date, pulled from the full historical record.

Both the streak box and the On This Day card are independently collapsible — click the small toggle label above each one to hide or show it.

### Testing with a specific date

Append `?otd=MM-DD` to the URL to override the calendar date used for the On This Day lookup:

```
example.com/?otd=09-23
```

When the override is active, a small reset link appears in the card header to clear it.

## Records & Superlatives

`/records` is a standalone page of franchise superlatives computed from the Retrosheet game data: best and worst seasons, best and worst season starts, longest win streaks, most lopsided wins, worst losses, no-hitters, perfect games, World Series and playoff appearances, and ties. Each superlative is its own shareable card with a deep link (`/records/best-seasons`, `/records/win-streaks`, `/records/no-hitters`, …) and its own server-rendered social card at `/og/records/<slug>.png`, following the same pattern as the per-season cards. Season years in the tables link to their season pages.

The computation lives in `records-core.js`, a dependency-free module shared verbatim by the browser page (`records.html` + `records.js`) and the web service (`lib/records.js`), so the page and the link previews can never disagree.

## Head-to-Head

`/vs` lists the Brewers' all-time record against every opponent they've ever faced, sorted by meetings played. The table can be filtered by name, venue (home/away), and game type (regular season/playoffs) — these recompute the records from the raw game rows, not just hide rows. Each opponent gets its own rivalry page at `/vs/<opponent-slug>` (e.g. `/vs/chicago-cubs`): overall and playoff record, first/last meeting, current streak, biggest win, share buttons, and a server-rendered social card at `/og/vs/<slug>.png`. Computation lives in `h2h-core.js`, shared by the browser page (`vs.html` + `vs.js`) and the web service (`lib/h2h.js`).

Franchise moves and renames are folded together using `data/CurrentNames.csv`, Retrosheet's franchise-name history, so relocated franchises (e.g. Montreal Expos → Washington Nationals) count as one opponent under their current name.

The current season's schedule on the main page annotates each game with the all-time head-to-head record against that opponent, linking to the rivalry page.

## Franchise History Chart

`/history` charts every season since 1969 as one line — win percentage by default. Any combination of metrics can be plotted at once (win %, wins, runs for, runs against): metrics sharing a scale get a real labeled axis, mixed scales normalize each series to its own range (tooltips carry exact numbers). An "include playoffs" toggle folds postseason games into every metric. Hovering a season shows its record, and clicking a season opens its page. Metric selection and playoff inclusion persist like the site's other settings. A compact sparkline of the same chart sits under the answer on the main page (the viewed season marked in white) and links to `/history`.

Manager-era bands cover the full timeline — every manager tenure, alternating shading — and hovering a band's top strip shows that manager's record; clicking it opens `/managers`.

The chart is built by `history-chart.js`, a pure SVG-string module shared by the page (`history.js`), the homepage sparkline (`main.js`), and the server-rendered social card at `/og/history.png` — all three render identical geometry from `computeSeasonHistory()` in `records-core.js`.

## Managers

`/managers` lists every Brewers manager in tenure order with regular-season record, win %, and playoff record. Tenures live in `data/managers.csv` as from/to **dates**, not seasons, so mid-season changes split correctly — every game is assigned to a manager by date. Computation lives in `coaches-core.js`, shared by the browser page (`managers.html` + `managers.js`) and the web service (`lib/coaches.js`); the social card is at `/og/managers.png`.

## Box Scores

Every historical game has a full box score page at `/game/<gid>`, where `<gid>` is the Retrosheet game id (e.g. `/game/LAN202510170`). The page shows the line score, winning/losing/save pitchers, and batting, pitching, and fielding tables for both teams. Game rows in the season schedule link to their box score; current-season games (not yet in the Retrosheet data) link to ESPN's box score instead.

The box score is assembled from the Retrosheet per-game CSVs (`gameinfo.csv`, `batting.csv`, `pitching.csv`, `fielding.csv`, plus `teamstats.csv` for line scores and `biofile0.csv` for player names) by `boxscore-core.js`, a pure shared module. The server builds the CSV indices once, serves structured JSON at `/api/boxscore/<gid>`, and renders the page shell with per-game link-preview tags; the browser page (`game.html` + `game.js`) fetches the JSON and renders the tables.

## Data Files

All historical game data comes from [Retrosheet](https://www.retrosheet.org) (see [Data Sources](#data-sources)):

- `data/gameinfo.csv` — one row per Brewers/Pilots game from 1969 to the present: teams, score, site, date, attendance, umpires, W/L/S pitchers, and more.
- `data/batting.csv`, `data/pitching.csv`, `data/fielding.csv` — per-player, per-game stat lines used for box scores.
- `data/teamstats.csv` — per-team, per-game totals and inning-by-inning line scores.
- `data/biofile0.csv`, `data/allplayers.csv` — player biographical data and id → name lookups.
- `data/CurrentNames.csv` — franchise/team name history for mapping historical teams to current names.
- `data/ballparks.csv` — ballpark id → name/location lookup.
- `data/plays.lfs.csv` — play-by-play event data (tracked with Git LFS; not currently used by the app).

Maintained by hand for this site:

- `data/managers.csv` — manager tenures as from/to dates.
- `data/channel_lookup.csv`, `data/provider_lookup.csv` — TV channel and provider metadata used to classify ESPN broadcast listings.

## Updating Data

The Retrosheet CSVs are refreshed manually from [retrosheet.org](https://www.retrosheet.org/downloads/alldata.html) downloads (Retrosheet publishes updates after each season). After replacing the files, run the validator to confirm they parse correctly:

```
npm run update-data
```

It reports total games, season range, and the latest season's record.

## Sharing

Below the schedule, a row of share buttons lets visitors spread the current season's status:

- **Share** — uses the native OS share sheet on mobile browsers that support `navigator.share`
- **Post on X / Post on Bluesky** — open the respective compose window pre-filled with the share message and URL
- **Share on Facebook** — opens the Facebook sharer with the URL and message
- **Post on Reddit** — opens Reddit's submit page with the URL and message pre-filled as the post title
- **Copy** — copies the message and URL to the clipboard; the button briefly turns green to confirm

On mobile browsers with native share support only the system Share button is shown. On desktop (or browsers without `navigator.share`) the individual platform buttons and Copy button are shown instead.

## Social Cards & Link Previews

When a link is shared, the preview card (Open Graph / Twitter Card) is generated by the web service, so a shared link shows real content instead of a generic image.

- **Meta tags** — for `/`, `/YYYY`, `/records/...`, `/vs/...`, `/history`, `/managers`, and `/game/<gid>`, the server injects page-specific `og:title`, `og:description`, `og:image`, and `twitter:card` tags into the returned HTML. This is server-rendered because social crawlers (X, Facebook, iMessage, Slack, Discord) do not run JavaScript and would otherwise only see generic tags.
- **Card images** — `GET /og/<season>.png` returns a 1200×630 card rendered on the fly. There are five states: **undefeated**, **record**, **World Series champions**, **offseason**, and a generic default. Records, head-to-head, history, and managers pages have their own cards (`/og/records/<slug>.png`, `/og/vs/<slug>.png`, `/og/history.png`, `/og/managers.png`). Images are cached — long-lived/immutable for past seasons, briefly for the current season.

Records for past seasons come from the Retrosheet data; the current season uses the live ESPN feed, matching the front-end logic. Cards are rendered with the bundled Liberation Sans fonts (`fonts/`) so output is identical regardless of the host's system fonts.

## Deployment

The site is served by `server.js`, a small Node web service that:

1. Serves the static site (`index.html`, `main.js`, `styles.css`, `data/…`).
2. Injects per-URL link-preview meta tags (see [Social Cards](#social-cards--link-previews)).
3. Renders card images at `/og/…`.
4. Serves the box score API (`/api/boxscore/<gid>`) and game pages (`/game/<gid>`).

### Relevant files

```
server.js            # web service (static serving + meta injection + card + box score routes)
lib/cards.js         # SVG -> PNG card generator
lib/seasons.js       # per-season record from CSV + live ESPN feed
lib/records.js       # records/superlatives data + meta for /records routes
lib/h2h.js           # head-to-head data + meta for /vs routes
lib/coaches.js       # manager data + meta for /managers
records-core.js      # shared superlative/season computation (browser + node)
h2h-core.js          # shared head-to-head computation (browser + node)
coaches-core.js      # shared manager computation (browser + node)
boxscore-core.js     # shared box score assembly (browser + node)
history-chart.js     # shared SVG chart geometry (browser + node)
fonts/               # Liberation Sans (SIL OFL 1.1), bundled for deterministic rendering
render.yaml          # Render Blueprint
```

Dependencies: `@resvg/resvg-js` (SVG→PNG) and `opentype.js` (text measurement).

### Run locally

```
npm install
npm start            # http://localhost:3000
```

Then open `http://localhost:3000/1982` and view source to see the injected per-season tags, `http://localhost:3000/og/1982.png` for the card, or `http://localhost:3000/game/LAN202510170` for a box score.

### Render

The service is a Render **Web Service** (not a Static Site). Render sets `PORT` automatically; no other environment variables are required (the ESPN endpoints are public and unauthenticated).

**Option A — Blueprint (recommended):** commit `render.yaml`, then on Render choose **New → Blueprint** and pick this repo. Render creates the web service from the file.

**Option B — Manual:** on Render choose **New → Web Service** → this repo, then set:

- **Build command:** `npm install`
- **Start command:** `node server.js`

> **Cold starts:** Render's free web-service tier spins down after inactivity and takes ~30–50s to wake. A social crawler that hits a cold link may time out before the preview renders. The Starter plan keeps the service always-on; on the free tier, previews warm up after the first request.

### Validate link previews

After deploying, confirm the cards render:

- **X:** [cards-dev.twitter.com/validator](https://cards-dev.twitter.com/validator)
- **Facebook:** [developers.facebook.com/tools/debug](https://developers.facebook.com/tools/debug/) — use **Scrape Again** to refresh a cached preview
- Or paste a season link (e.g. `arethebrewersontv.com/1982`) into iMessage, Slack, or Discord.

## Data Sources

**1969–present (historical)** — all historical game, player, and box score data was obtained free of charge from and is copyrighted by [Retrosheet](https://www.retrosheet.org). Interested parties may contact Retrosheet at 20 Sunset Rd., Newark, DE 19711. See [LICENSE-DATA](LICENSE-DATA).

**Current season (live)** — for the most recent MLB season, the app fetches live schedule, score, broadcast, and standings data directly from the ESPN public API at runtime. This covers spring training, the regular season, and the playoffs. When a game is in progress, the app polls ESPN every 30 seconds. No API key is required; the ESPN endpoints used are public and unauthenticated.

The app determines which data source to use automatically: seasons present in the Retrosheet CSVs use static data; the current season uses the live ESPN feed. If the ESPN fetch fails, the app falls back to the CSVs.

## Licenses

Application source code is released under the MIT License. See [LICENSE](LICENSE).

The historical game data in `data/` was obtained free of charge from and is copyrighted by [Retrosheet](https://www.retrosheet.org). See [LICENSE-DATA](LICENSE-DATA) for the required notice.

The bundled Liberation Sans fonts in `fonts/` are © Red Hat, Inc. and licensed under the [SIL Open Font License 1.1](https://github.com/liberationfonts/liberation-fonts).
