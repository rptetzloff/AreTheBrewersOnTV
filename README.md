# Are the Packers Undefeated?

A simple web app that answers the only question that matters: are the Green Bay Packers undefeated this season?

Browse every season from 1921 to the present, with full game-by-game schedules and results.

**Live site:** [arethepackersundefeated.com](https://arethepackersundefeated.com)

Vibe coded with [Bolt](https://bolt.new) and [Claude Code](https://claude.ai/code). Served by a small Node web service and hosted on [Render](https://render.com).

## Linking to a Specific Season

Append the year to the URL to jump directly to any season:

```
example.com/1924
example.com/?season=1924
```

Both formats are supported. The web service (`server.js`) serves `index.html` for `/YYYY` routes directly — no separate rewrite rule is needed — and injects a season-specific link preview for that URL (see [Social Cards](#social-cards--link-previews)).

## Streak Box

Below the main answer, a collapsible streak box shows a short summary derived from the currently viewed season's game results:

- **Current season** — reports whether the Packers are still undefeated to open the season, and shows both the opening win streak (games before the first loss) and the current active win streak.
- **Past seasons** — reports how long the opening undefeated run lasted (number of games and number of days until the first loss), or notes a perfect regular season if they never lost.

The box is hidden automatically when there are no completed games to analyze (e.g. a future season or an empty schedule).

## On This Day

Near the top of the page, below the streak box, the app surfaces a random Packers game played on (or within a few days of) today's calendar date, pulled from the full historical record.

Both the streak box and the On This Day card are independently collapsible — click the small toggle label above each one to hide or show it.

### Testing with a specific date

Append `?otd=MM-DD` to the URL to override the calendar date used for the On This Day lookup:

```
example.com/?otd=11-28
```

When the override is active, a small reset link appears in the card header to clear it.

## Records & Superlatives

`/records` is a standalone page of franchise superlatives computed from `data/packers_games.csv`: best season starts, perfect seasons, longest regular-season win streaks (ties end a streak), worst season starts, most lopsided wins, worst losses (blowouts include playoffs, flagged), and a listing of every tie. Each superlative is its own shareable card with a deep link (`/records/best-starts`, `/records/perfect-seasons`, `/records/win-streaks`, `/records/worst-starts`, `/records/lopsided-wins`, `/records/worst-losses`, `/records/ties`) and its own server-rendered social card at `/og/records/<slug>.png`, following the same pattern as the per-season cards. Season years in the tables link to their season pages.

The computation lives in `records-core.js`, a dependency-free module shared verbatim by the browser page (`records.html` + `records.js`) and the web service (`lib/records.js`), so the page and the link previews can never disagree.

## Head-to-Head

`/vs` lists the Packers' all-time record against every opponent they've ever faced (defunct franchises included), sorted by meetings played. The table can be filtered by name, venue (home/away), game type (regular season/playoffs) — these recompute the records from the raw game rows, not just hide rows — and restricted to current franchises only. Each opponent gets its own rivalry page at `/vs/<opponent-slug>` (e.g. `/vs/chicago-bears`): overall and playoff record, first/last meeting, current streak, biggest win, share buttons, and a server-rendered social card at `/og/vs/<slug>.png`. Computation lives in `h2h-core.js`, shared by the browser page (`vs.html` + `vs.js`) and the web service (`lib/h2h.js`).

The CSV's pre-1999 rows map franchises to modern names but the 1999+ rows use as-of-game names, so `h2h-core.js` folds relocated-franchise aliases together (St. Louis Rams → Los Angeles Rams, San Diego → Los Angeles Chargers, Oakland → Las Vegas Raiders). The 1950 Baltimore Colts and the 1945–52 Dallas Texans lineage are distinct defunct franchises and stay separate.

The current season's schedule on the main page annotates each game with the all-time head-to-head record against that opponent, linking to the rivalry page.

## Franchise History Chart

`/history` charts every season since 1921 as one line — win percentage by default (ties count half; early seasons were ~10 games and modern ones 17, so win% reads honestly across eras). Any combination of metrics can be plotted at once (win %, wins, points for, points against): metrics sharing a scale get a real labeled axis, mixed scales normalize each series to its own range (tooltips carry exact numbers). An "include playoffs" toggle folds postseason games into every metric. Championship seasons get gold dots (the 1929–31 standings titles are hardcoded; every later title is "won the season's final playoff game"), perfect seasons get a white ring, hovering a season shows its record and points, and clicking a season opens its page. Metric selection and playoff inclusion persist like the site's other settings. A compact sparkline of the same chart sits under the answer on the main page (the viewed season marked in white) and links to `/history`.

Coaching-era bands cover the full timeline — every head-coach tenure, alternating shading — and hovering a band's top strip shows that coach's record; clicking it opens `/coaches`.

The chart is built by `history-chart.js`, a pure SVG-string module shared by the page (`history.js`), the homepage sparkline (`main.js`), and the server-rendered social card at `/og/history.png` — all three render identical geometry from `computeSeasonHistory()` in `records-core.js`.

## Head Coaches

`/coaches` lists every Packers head coach in tenure order with regular-season record, win %, playoff record, and championships. Tenures live in `data/packers_coaches.csv` as from/to **dates**, not seasons, so mid-season changes split correctly (Ronzani → Devore/McLean with two games left in 1953; McCarthy → Philbin after week 13 of 2018) — every game is assigned to a coach by date. Championships count for the coach who coached that champion season's final game. Computation lives in `coaches-core.js`, shared by the browser page (`coaches.html` + `coaches.js`) and the web service (`lib/coaches.js`); the social card is at `/og/coaches.png`.

## Data Files

`data/packers_games.csv` — game-by-game results for every Packers game from 1921 to the present, including opponent, score, location, and playoff/Super Bowl flags. Pre-1999 rows come from the FiveThirtyEight source; 1999–present rows are sourced from nflverse-data.

`data/packers_season_records.csv` — one row per season with regular season and postseason win/loss/tie totals. Generated automatically by `update-data.js`.

## Updating Data

During the live season, run the update script to pull the latest results from [nflverse-data](https://github.com/nflverse/nflverse-data) and rebuild both CSVs:

```
npm run update-data
```

This fetches `games.csv` from the nflverse-data releases, extracts all completed Packers games from 1999 onward, merges them with the pre-1999 FiveThirtyEight base data, and rewrites both CSV files in place.

### Automatic updates via GitHub Actions

A workflow at `.github/workflows/update-data.yml` runs `npm run update-data` automatically every Tuesday at 10:00 UTC (covers Monday night games). If either CSV changes, the workflow commits and pushes the updated files.

To trigger a manual run at any time, go to **Actions → Update Packers Data → Run workflow**.

The workflow uses the built-in `GITHUB_TOKEN`. Make sure your repository's Actions settings allow write access: **Settings → Actions → General → Workflow permissions → Read and write permissions**.

## Sharing

Below the schedule, a row of share buttons lets visitors spread the current season's status:

- **Share** — uses the native OS share sheet on mobile browsers that support `navigator.share`
- **Post on X / Post on Bluesky** — open the respective compose window pre-filled with the share message and URL
- **Share on Facebook** — opens the Facebook sharer with the URL and message
- **Post on Reddit** — opens Reddit's submit page with the URL and message pre-filled as the post title
- **Copy** — copies the message and URL to the clipboard; the button briefly turns green to confirm

On mobile browsers with native share support only the system Share button is shown. On desktop (or browsers without `navigator.share`) the individual platform buttons and Copy button are shown instead.

## Social Cards & Link Previews

When a season link is shared, the preview card (Open Graph / Twitter Card) is generated per season by the web service, so a shared link shows that season's actual answer instead of a generic image.

- **Meta tags** — for `/`, `/YYYY`, and `/?season=YYYY`, the server injects season-specific `og:title`, `og:description`, `og:image`, and `twitter:card` tags into the returned HTML. This is server-rendered because social crawlers (X, Facebook, iMessage, Slack, Discord) do not run JavaScript and would otherwise only see generic tags.
- **Card images** — `GET /og/<season>.png` returns a 1200×630 card rendered on the fly. There are five states: **undefeated** (YES), **record** (NO), **Super Bowl champions**, **offseason**, and a generic default. Images are cached — long-lived/immutable for past seasons, briefly for the current season.

Records for past seasons come from `data/packers_games.csv`; the current season uses the live ESPN feed, matching the front-end logic. Cards are rendered with the bundled Liberation Sans fonts (`fonts/`) so output is identical regardless of the host's system fonts.

> **Data note:** the 2010 row in `packers_games.csv` has `superbowl = SB` where every other Super Bowl row uses a roman numeral (e.g. `xxxi`). The card falls back to "SUPER BOWL CHAMPIONS" for that case, but `main.js` renders it literally as "Super Bowl SB" on the page. Changing that cell to `xlv` fixes both.

## Deployment

The site is served by `server.js`, a small Node web service that:

1. Serves the static site (`index.html`, `main.js`, `styles.css`, `data/…`).
2. Injects per-URL link-preview meta tags (see [Social Cards](#social-cards--link-previews)).
3. Renders per-season card images at `/og/<season>.png`.

### Relevant files

```
server.js            # web service (static serving + meta injection + card route)
lib/cards.js         # SVG -> PNG card generator (seasons + records)
lib/seasons.js       # per-season record from CSV + live ESPN feed
lib/records.js       # records/superlatives data + meta for /records routes
lib/h2h.js           # head-to-head data + meta for /vs routes
records-core.js      # shared superlative computation (browser + node)
h2h-core.js          # shared head-to-head computation (browser + node)
fonts/               # Liberation Sans (SIL OFL 1.1), bundled for deterministic rendering
render.yaml          # Render Blueprint
```

Dependencies: `@resvg/resvg-js` (SVG→PNG) and `opentype.js` (text measurement).

### Run locally

```
npm install
npm start            # http://localhost:3000
```

Then open `http://localhost:3000/1996` and view source to see the injected per-season tags, or `http://localhost:3000/og/1996.png` for the card.

### Render

The service is a Render **Web Service** (not a Static Site), so moving from an existing static-site deployment is a one-time service-type change. Render sets `PORT` automatically; no other environment variables are required (the ESPN endpoints are public and unauthenticated).

**Option A — Blueprint (recommended):** commit `render.yaml`, then on Render choose **New → Blueprint** and pick this repo. Render creates the web service from the file.

**Option B — Manual:** on Render choose **New → Web Service** → this repo, then set:

- **Build command:** `npm install`
- **Start command:** `node server.js`

If you're replacing an existing static site, move the custom domain `arethepackersundefeated.com` to the new web service (**Settings → Custom Domains**) and delete the old static site.

> **Cold starts:** Render's free web-service tier spins down after inactivity and takes ~30–50s to wake. A social crawler that hits a cold link may time out before the preview renders. The Starter plan keeps the service always-on; on the free tier, previews warm up after the first request.

### Validate link previews

After deploying, confirm the cards render:

- **X:** [cards-dev.twitter.com/validator](https://cards-dev.twitter.com/validator)
- **Facebook:** [developers.facebook.com/tools/debug](https://developers.facebook.com/tools/debug/) — use **Scrape Again** to refresh a cached preview
- Or paste a season link (e.g. `arethepackersundefeated.com/1996`) into iMessage, Slack, or Discord.

## Photos

`data/photos.csv` — historical photos displayed alongside certain seasons. Each row contains a season year, image URL, caption, license, and license URL. Images are sourced from Wikimedia Commons and must be freely licensed (Public Domain or Creative Commons).

To add a photo for a season, append a row to `photos.csv`:

```
season,url,caption,license,license_url
1967,https://upload.wikimedia.org/.../photo.jpg,Caption text,Public Domain,https://commons.wikimedia.org/wiki/File:photo.jpg
```

Multiple photos per season are supported — they will all be displayed.

## Data Sources

**1921–1998** — game data is derived from the [nfl-elo-game](https://github.com/fivethirtyeight/nfl-elo-game) dataset published by [FiveThirtyEight](https://fivethirtyeight.com), used under the MIT License. See [LICENSE-DATA](LICENSE-DATA) for details.

**1999–present (static)** — game data is sourced from [nflverse-data](https://github.com/nflverse/nflverse-data), maintained by the [nflverse](https://nflverse.com) project and licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credit: nflverse contributors. This data lives in `data/packers_games.csv` and is refreshed by `npm run update-data`.

**Current season (live)** — for the most recent NFL season, the app fetches live schedule and score data directly from the ESPN public API at runtime. This covers preseason, regular season, and playoffs. When a game is in progress, the app polls ESPN every 30 seconds and shows the live score, game clock, down-and-distance, and last play. No API key is required; the ESPN endpoints used are public and unauthenticated.

The app determines which data source to use automatically: seasons present in the CSV use static data; the current season (and any season ESPN returns that is newer than the CSV) uses the live ESPN feed. If the ESPN fetch fails, the app falls back to the CSV.

## Licenses

Application source code is released under the MIT License. See [LICENSE](LICENSE).

The FiveThirtyEight NFL ELO game data in `data/packers_games.csv` (seasons 1921–1998) is redistributed under the MIT License granted by FiveThirtyEight. See [LICENSE-DATA](LICENSE-DATA).

The nflverse-data content in `data/packers_games.csv` (seasons 1999–present) is used under the [Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/). Credit: [nflverse contributors](https://github.com/nflverse/nflverse-data).

The bundled Liberation Sans fonts in `fonts/` are © Red Hat, Inc. and licensed under the [SIL Open Font License 1.1](https://github.com/liberationfonts/liberation-fonts).

Photos in `data/photos.csv` are sourced from [Wikimedia Commons](https://commons.wikimedia.org/) under their respective licenses (Public Domain or Creative Commons). See the `license` and `license_url` columns in the CSV for per-image attribution.