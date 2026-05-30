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

## Data Sources

**Current and recent seasons** — live and historical schedule data is fetched from the [ESPN API](https://www.espn.com).

**1921–2020 historical seasons** — game data is derived from the [nfl-elo-game](https://github.com/fivethirtyeight/nfl-elo-game) dataset published by [FiveThirtyEight](https://fivethirtyeight.com), used under the MIT License. See [LICENSE-DATA](LICENSE-DATA) for details.

## Licenses

Application source code is released under the MIT License. See [LICENSE](LICENSE).

The FiveThirtyEight NFL ELO game data bundled in `data/packers_games_1921-2020.csv` is redistributed under the MIT License granted by FiveThirtyEight. See [LICENSE-DATA](LICENSE-DATA).
