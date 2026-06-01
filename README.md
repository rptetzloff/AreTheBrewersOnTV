# Are the Packers Undefeated?

A simple web app that answers the only question that matters: are the Green Bay Packers undefeated this season?

Browse every season from 1921 to the present, with full game-by-game schedules and results.

**Live site:** [arethepackersundefeated.com](https://arethepackersundefeated.com)

Vibe coded with [Bolt](https://bolt.new) and [Claude Code](https://claude.ai/code). Hosted on [Render](https://render.com).

## Linking to a Specific Season

Append the year to the URL to jump directly to any season:

```
example.com/1924
example.com/?season=1924
```

Both formats are supported. The path form (`/1924`) requires your host to be configured with a rewrite rule that serves `index.html` for all routes.

## Data Files

`data/packers_games.csv` — game-by-game results for every Packers game from 1921 to the present, including opponent, score, location, and playoff/Super Bowl flags. Pre-1999 rows come from the FiveThirtyEight source; 1999–present rows are sourced from nflverse-data.

`data/packers_season_records.csv` — one row per season with regular season and postseason win/loss/tie totals. Generated automatically by `update-data.js`.

## Updating Data

During the live season, run the update script to pull the latest results from [nflverse-data](https://github.com/nflverse/nflverse-data) and rebuild both CSVs:

```
npm run update-data
```

This fetches `games.csv` from the nflverse-data releases, extracts all completed Packers games from 1999 onward, merges them with the pre-1999 FiveThirtyEight base data, and rewrites both CSV files in place.

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

**1999–present** — game data is sourced from [nflverse-data](https://github.com/nflverse/nflverse-data), maintained by the [nflverse](https://nflverse.com) project and licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credit: nflverse contributors.

## Licenses

Application source code is released under the MIT License. See [LICENSE](LICENSE).

The FiveThirtyEight NFL ELO game data in `data/packers_games.csv` (seasons 1921–1998) is redistributed under the MIT License granted by FiveThirtyEight. See [LICENSE-DATA](LICENSE-DATA).

The nflverse-data content in `data/packers_games.csv` (seasons 1999–present) is used under the [Creative Commons Attribution 4.0 International License](https://creativecommons.org/licenses/by/4.0/). Credit: [nflverse contributors](https://github.com/nflverse/nflverse-data).

Photos in `data/photos.csv` are sourced from [Wikimedia Commons](https://commons.wikimedia.org/) under their respective licenses (Public Domain or Creative Commons). See the `license` and `license_url` columns in the CSV for per-image attribution.
