// Building game rows by hand, so a test says what it is about.
//
// Deliberately the same shape as the Packers repo's helper of the same name.
// The two differ only where the data genuinely differs — 'result' rather
// than 'Packers Win', championship rather than superbowl, plus the gametype
// codes Retrosheet uses. Keeping them parallel is what will make the two
// suites mergeable when the core is shared; where they diverge, the diff is
// the list of things a universal core has to abstract.

/** One normalized game, as parseGameinfoCsv would produce it. */
export function game({
	date = '2020-07-24',
	season = null,
	result = 'WIN',
	pf = 4,
	pa = 2,
	opponent = 'Chicago Cubs',
	franchise = 'CHN',
	regular = true,
	// Retrosheet gametype: R regular, F wildcard, D division, L championship,
	// W world series. ROUND_ORDER in records-core depends on these letters.
	gametype = null,
	championship = '',
	location = 'home',
	gid = '',
} = {}) {
	const gt = gametype ?? (regular ? 'R' : 'D')
	return {
		gid,
		date,
		// Almost every test wants the season to match the date, and saying so
		// twice is how they drift apart.
		season: String(season ?? date.slice(0, 4)),
		regular_season: gt === 'R' ? '1' : '0',
		playoff: gt === 'R' ? '0' : '1',
		championship,
		gametype: gt,
		Opponent: opponent,
		franchise,
		'result': result,
		scoreFor: String(pf),
		scoreAgainst: String(pa),
		location,
		wp: '',
		lp: '',
		save: '',
	}
}

/**
 * A run of games in one season, one per day from April.
 *
 * `results` is a compact string: 'WWLT' is win, win, loss, tie. Baseball plays
 * most days, so unlike the football helper this advances a day at a time.
 */
export function season(year, results, { regular = true, opponent, gametype } = {}) {
	return [...results].map((code, i) => {
		const day = 5 + i
		const month = 4 + Math.floor((day - 1) / 28)
		const dom = ((day - 1) % 28) + 1
		return game({
			date: `${year}-${String(month).padStart(2, '0')}-${String(dom).padStart(2, '0')}`,
			season: year,
			result: { W: 'WIN', L: 'LOSS', T: 'TIE' }[code],
			regular,
			...(gametype ? { gametype } : {}),
			...(opponent ? { opponent } : {}),
		})
	})
}

/** A raw gameinfo.csv, built from the handful of columns the parser reads.
 *  The real file has 40-odd columns; naming them all in a test would bury
 *  what the test is actually about. */
export function gameinfoCsv(games) {
	const header = ['gid', 'visteam', 'hometeam', 'date', 'gametype', 'vruns', 'hruns', 'wteam', 'lteam', 'season', 'wp', 'lp', 'save']
	const lines = games.map((g) => header.map((h) => g[h] ?? '').join(','))
	return [header.join(','), ...lines].join('\n')
}

/** A CurrentNames.csv row set. Columns are Retrosheet's own. */
export function currentNamesCsv(rows) {
	const header = ['franchiseName', 'teamName', 'league', 'division', 'city', 'team', 'alternate', 'startDate', 'endDate', 'locationCity', 'locationState']
	const lines = rows.map((r) => header.map((h) => r[h] ?? '').join(','))
	return [header.join(','), ...lines].join('\n')
}

/** A date far enough past every fixture season that it counts as settled. */
export const LONG_AFTER = new Date(2030, 5, 1)
