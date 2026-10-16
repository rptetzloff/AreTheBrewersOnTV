# Are the Brewers On TV?

A simple web app that answers the question every Milwaukee fan asks daily: are the Brewers on TV today?

Beyond today's answer, the site carries the full franchise record — every season from 1969 (including the inaugural Seattle Pilots year) to the present, with game-by-game schedules, results, and historical box scores.

**Live site:** [arethebrewersontv.com](https://arethebrewersontv.com)

Built with [Claude Code](https://claude.ai/code). Served by a small Node web service and hosted on [Render](https://render.com).

## The Answer

For the current season, the app pulls the schedule and today's game from the public ESPN MLB API. Each listed broadcast is classified using the channel metadata in `data/channel_lookup.csv` and `data/provider_lookup.csv`: a channel of type broadcast, cable, or regional counts as "on TV" even when ESPN labels it "Streaming" (e.g. Brewers.TV, which is carried on DirecTV, Spectrum, Xfinity, and others). Only when a channel has no metadata does the app fall back to ESPN's own type. When a game is in progress, the live card refreshes every 15 seconds and shows the score, the base-out state, the pitcher on the mound and the other team's pitcher (IP, H, ER, K, pitch count), the batter with his position and spot in the order ("1B · batting 4th"), his day and ESPN's note on his record against this pitcher, the current at-bat pitch by pitch (a strike zone from the pitcher's side, as the TV camera shows it, with the batter's box shaded on the side he is hitting from this time up — a right-handed hitter on the right — and numbered dots, and a list of pitch type, speed and result), the game's last ball in play on a small field from behind home plate (a straight line for a grounder, an arc for a liner, fly ball or pop-up, gold for a hit and red for an out, with the result, how it was hit and ESPN's distance when it gives one), and the last two plays. ESPN's `hitCoordinate` is MLB Gameday's grid: home plate at (125.42, 198.27), about 2.5 feet a unit, checked against six home runs whose distance ESPN states; a fair ball that plots a degree or two foul is drawn just inside the line. It reads `/api/live/<event>`, which the server boils down from ESPN's game summary — half a megabyte to a megabyte — to a few KB (`live-core.js`); the server holds a live game's summary for 15 seconds and shares one ESPN request among everyone watching. The strike zone's place on ESPN's pitch grid was measured from 448 called pitches. The next game's card names the probable starters once ESPN announces them, usually a day or two out. Clicking the score of any current-season game, live or final, opens its line score with every scoring play under it — inning, team, what happened and the score after (`scoringPlays`); ESPN flags a wild-pitch run twice, so a repeat of the same play is dropped. While a game is live the schedule list grows from 400px to 720px tall, so the live card shows whole.

That classification, the provider channel numbers and the local simulcasts (`data/simulcasts.csv`) live in `tv-core.js`, one module used by the page, the server's link previews and the calendar feed below.

Channel information is based on publicly available channel listings — the site reminds visitors to check their local channel guide for the most accurate broadcast information.

## Calendar Feed

The season is a subscribable calendar: one event per game, titled with the channel — `Brewers @ Dodgers · FS1`. With a provider it adds that provider's channel number, picking the right one for a provider with several service areas: `/calendar/<provider>.ics`, with `?area=<n>` for the service area (`/calendar/amherst.ics?area=1`). Without one, `/calendar.ics`. Finished games turn into results (`W 7–4 @ Dodgers`), postponements are marked cancelled, and a game with no announced start is an all-day event. Spring training is left out.

The schedule bar under the season shows the links for the chosen provider: Subscribe (`webcal://`, for Apple Calendar and Outlook), Google, and Copy link. Calendar apps poll the feed — it asks for every three hours — so channels ESPN adds late, final scores and postponements arrive on their own. The server fetches the schedule at most every ten minutes, and keeps serving the last good copy if ESPN is down rather than an empty calendar. Built by `lib/calendar.js`.

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

Under it, the Brewers born that day — the three longest Brewers careers, linked to their player pages, and a count of the rest — from `/api/born/<MM-DD>` (birth dates from `biofile0.csv`). On a date with no Brewers game, most of the winter, the birthdays are the card; it used to hide.

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

## Stats

`/stats/<season>` lists batting, pitching and fielding for every Brewer in a season, in sortable tables (`/stats` redirects to the newest season Retrosheet covers). The tab is the URL hash: `/stats/1982#pitching`. Totals are summed from the same per-game box score indices that the box score pages use, by `stats-core.js`; the server builds each season's tables once, on first request, and serves them as JSON at `/api/stats/<season>` (`stats.html` + `stats.js` render them).

The **Team** tab (`/stats/2018#team`) is the season's record split by where (home, away), when (day, night, month — March joins April and October joins September, as MLB groups them), how close (one-run games, blowouts of 5+ runs, extra innings) and the opposing starter's throwing hand, each with games, W–L, percentage, runs scored and allowed, and differential (`splits-core.js`). Extra innings means past the scheduled length, so a 2020–21 seven-inning doubleheader game that went to the eighth counts; scheduled innings come from gameinfo's `innings` column (filled from 2020, else nine), innings played from the line scores. The opposing starter is the other team's pitcher with a start in the box score pitching lines, his hand from `biofile0.csv`. A split the data cannot answer for a season (no day/night recorded) is left out. Splits that need the standings — vs winning teams, vs the division — are not attempted.

`/stats/career` and `/stats/single-season` are franchise leaderboards, top ten in each of 22 categories (`/api/stats/leaders`). Careers count only Brewers seasons and recompute rates from summed totals. Single-season rate boards qualify by MLB's title rules — 3.1 plate appearances or one inning per team game, which scales for short seasons like 1981 and 2020; career rate boards need 2,000 plate appearances or 500 innings, a threshold chosen here (`CAREER_MIN_PA` / `CAREER_MIN_IPOUTS` in `stats-core.js`), since MLB has none.

`/player/<id>` is one Brewer's seasons — batting, pitching and fielding, each with a career line — where `<id>` is the Retrosheet player id (`/player/younr001`). Every name on the stats tables and leaderboards links there, and the stats and player pages carry a search box ("Find a Brewer…") over all 1,074 Brewers from `/api/players`, loaded on first use. It ignores accents and punctuation ("nunez", "bj"), ranks a whole-word match above a partial one — so "robin" is Robin Yount before Ron Robinson — and longer Brewers careers first; arrow keys and Enter work (`player-search.js`). The biographical line comes from `biofile0.csv`. Brewers seasons only: a player's years elsewhere are not in this data. JSON at `/api/player/<id>`.

Below the season tables is the **game log**: one season game by game, picked from a season list, with Batting and Pitching tabs when he did both. Each row has the date (linked to the box score; a doubleheader's games are (1) and (2)), opponent, result, and his line — position(s), PA through SB and the season-to-date AVG/OBP/SLG for a batter; started or relieved, decision, IP through HR and the season-to-date ERA for a pitcher. The games count (G) in each season row links to that season's log (`/player/yelic001#log-2018-batting`). Built on request by `playerGameLog` in `stats-core.js` from the same box score indices; JSON at `/api/player/<id>/log/<season>`. Regular season, as the tables are.

`/compare` puts up to four Brewers side by side, each as his Brewers career or one season: `/compare?p=younr001-1982,yelic001-2018,molip001`, where a bare id is the career (ids may contain hyphens, `lee-c001`, so a slot is matched whole). Players are added with the same search box, each column has a Career/season picker and a remove button, and the URL follows every change so a comparison can be shared; a shared link's title names the players. The better number in each row is in gold — higher or lower by the stat, ties all marked — except games, plate appearances, at-bats and starts, which are playing time. All pitchers compare pitching, all hitters batting, a mix both. It reads `/api/player/<id>` for each player; the URL logic and row rules are `compare-core.js`. Linked from the stats views and from a Compare button on each player page.

The stats cover the seasons Retrosheet has published; the season being played is added when Retrosheet publishes it, usually over the winter, and the page says so in its legend until then.

Regular season only. A tiebreaker game ("Game 163") is regular season everywhere on the site, as MLB counts it: 2018 is 96–67 with a 6–4 postseason, and Christian Yelich's 2018 reads .326 with 187 hits, as it does officially. (Until October 2026 the rest of the site filed it under the postseason and showed 2018 at 95–67; Retrosheet tags it `playoff`.) Fielding is one line per player per position, with an "All positions" view (`#fieldingTotals`) giving each player one line across them; the player page adds a Total row to each multi-position season and an All positions career line. Those totals count a game once however many positions he played in it, and leave DH out. Rate stats with no denominator (an AVG with no at-bats, an ERA with no innings) show a dash rather than zero.

## Ballparks

`/ballparks` has a card for each home park — Sick's Stadium, County Stadium, American Family Field — with its years, regular-season and postseason record there, average crowd, its own game-day records (biggest and smallest crowd, hottest and coldest game, longest and shortest game, most innings — each linked to the game), and first and last game. The current park's years are open-ended ("2001–", home games "through 2025") and its last game is "Latest", so the end of Retrosheet's data does not read as the park's last season; then the franchise-wide game-day records: biggest and smallest home crowds, longest games by time and by innings, shortest nine-inning games, and hottest and coldest game-time temperatures. The park records and the franchise boards share one function (`gameDayBoards`), so they follow the same rules. In the footer nav after Records ("Parks" on phones), and linked from the Records page; JSON at `/api/ballparks`, share card at `/og/ballparks.png`. Built by `ballparks-core.js` from gameinfo.csv's game-day columns and the line scores (innings — gameinfo's own innings column is empty before 2020).

A game is named for its park as it was called that day: Retrosheet's `ballparks.csv` has one name per park ("Miller Park" for MIL06 to this day), so renamed home parks carry a curated history in `site.js` (`parkNames`). Road parks keep Retrosheet's one name. Coverage: attendance and time of game for 90–100% of games in every decade, temperature for nearly every game since 1990 but about half before (a 0 is "not recorded"). Games played under a closed roof (Retrosheet's sky "dome") are left out of the temperature boards, because the recorded temperature is outdoors.

## Box Scores

Every historical game has a full box score page at `/game/<gid>`, where `<gid>` is the Retrosheet game id (e.g. `/game/LAN202510170`). The page shows the line score, winning/losing/save pitchers, and batting, pitching, and fielding tables for both teams. Game rows in the season schedule link to their box score; current-season games (not yet in the Retrosheet data) link to ESPN's box score instead.

The box score is assembled from the Retrosheet per-game CSVs (`gameinfo.csv`, `batting.csv`, `pitching.csv`, `fielding.csv`, plus `teamstats.csv` for line scores and `biofile0.csv` for player names) by `boxscore-core.js`, a pure shared module. The server builds the CSV indices once, serves structured JSON at `/api/boxscore/<gid>`, and renders the page shell with per-game link-preview tags; the browser page (`game.html` + `game.js`) fetches the JSON and renders the tables.

The season being played has box scores too, at `/game/<ESPN event id>` (`/game/401908032`), live or final: the same page, built from ESPN's game summary by `espn-box-core.js` — lineups in batting order with positions and substitutes indented under the player they replaced, batting and pitching lines with pitches-strikes and decisions, the scoring summary, umpires and attendance. ESPN's per-player lines have no doubles or steals, so the notes under each table are ESPN's own (2B, HR with inning and pitcher, RBI, LOB, RISP, SB, HBP, first-pitch strikes...), with its terser labels reworded to match. Batters faced, which ESPN's pitching line leaves out, are counted from the plays. The line score pop-up links there. Box score tables scroll sideways in their own box on a phone.

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

Every script and stylesheet URL carries a content version (`?v=…`) and is cached for good. Page shells version their `<script>` and `<link>` tags when the server starts, and each browser module goes out with its local imports versioned too (`lib/browser-modules.js`). A module's version hashes its rewritten body, so a change anywhere in its import tree changes its URL. This matters because Cloudflare turns the `no-cache` the server sends for an unversioned `.js` into a four-hour browser cache: with unversioned imports, a browser could run a new page against an old shared module for hours after a deploy. Every version also mixes in the release — a hash of the site's code files (`releaseId`) — so each release gives every script and stylesheet a new URL and every browser fetches them all again, which keeps a stale copy from outliving one release; a data-only update under `data/` keeps the URLs. `/api/release` says which release a server is running, which is how to tell when a rolling deploy has finished. A versioned file is cached for good only when the `?v=` asked for is the one the server has; anything else goes out `no-store`, because during a deploy the old server still answers the new release's URLs, and it once left an old `game.js` cached at Cloudflare under one. The JSON APIs revalidate with an ETag instead.

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

**Current season (live)** — for the most recent MLB season, the app fetches live schedule, score, broadcast, and standings data directly from the ESPN public API at runtime. This covers spring training, the regular season, and the playoffs. When a game is in progress, the live card refreshes every 15 seconds (see above); the schedules reload once a minute. No API key is required; the ESPN endpoints used are public and unauthenticated.

The app determines which data source to use automatically: seasons present in the Retrosheet CSVs use static data; the current season uses the live ESPN feed. If the ESPN fetch fails, the app falls back to the CSVs.

## Licenses

Application source code is released under the MIT License. See [LICENSE](LICENSE).

The historical game data in `data/` was obtained free of charge from and is copyrighted by [Retrosheet](https://www.retrosheet.org). See [LICENSE-DATA](LICENSE-DATA) for the required notice.

The bundled Liberation Sans fonts in `fonts/` are © Red Hat, Inc. and licensed under the [SIL Open Font License 1.1](https://github.com/liberationfonts/liberation-fonts).
