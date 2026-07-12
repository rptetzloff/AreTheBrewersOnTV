// Shared (browser + node) all-time head-to-head records vs every opponent,
// computed from data/packers_games.csv. Pure functions only — no fs/fetch/DOM.
import { rec, formatDate } from './records-core.js';

export const slugifyOpponent = (name) =>
	name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// The CSV's pre-1999 rows (FiveThirtyEight) map franchises to modern names,
// but the 1999+ rows (nflverse) use as-of-game names, splitting relocated
// franchises in two. Fold those eras together. (Baltimore Colts and Dallas
// Texans are NOT aliases — those are distinct defunct franchises.)
const FRANCHISE_ALIASES = {
	'St. Louis Rams': 'Los Angeles Rams',
	'San Diego Chargers': 'Los Angeles Chargers',
	'Oakland Raiders': 'Las Vegas Raiders',
};
export const canonicalOpponent = (name) => FRANCHISE_ALIASES[name] || name;

// The 31 other active NFL franchises, by the canonical names used in the CSV.
const CURRENT_FRANCHISES = new Set([
	'Arizona Cardinals', 'Atlanta Falcons', 'Baltimore Ravens', 'Buffalo Bills',
	'Carolina Panthers', 'Chicago Bears', 'Cincinnati Bengals', 'Cleveland Browns',
	'Dallas Cowboys', 'Denver Broncos', 'Detroit Lions', 'Houston Texans',
	'Indianapolis Colts', 'Jacksonville Jaguars', 'Kansas City Chiefs', 'Las Vegas Raiders',
	'Los Angeles Chargers', 'Los Angeles Rams', 'Miami Dolphins', 'Minnesota Vikings',
	'New England Patriots', 'New Orleans Saints', 'New York Giants', 'New York Jets',
	'Philadelphia Eagles', 'Pittsburgh Steelers', 'San Francisco 49ers', 'Seattle Seahawks',
	'Tampa Bay Buccaneers', 'Tennessee Titans', 'Washington Commanders',
]);

const RESULTS = new Set(['WIN', 'LOSS', 'TIE']);

// rows: parsed CSV rows. Returns { opponents, bySlug } — opponents sorted by
// meetings played (rivals first), then name. All games count (playoffs
// included); the playoff split is broken out per opponent.
export function computeHeadToHead(rows) {
	const games = rows
		.filter((g) => RESULTS.has(g['Packers Win']))
		.slice()
		.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

	const byOpp = new Map();
	for (const g of games) {
		const name = canonicalOpponent(g.Opponent);
		if (!byOpp.has(name)) byOpp.set(name, []);
		byOpp.get(name).push(g);
	}

	const info = (g) => ({
		date: g.date, season: parseInt(g.season, 10),
		result: g['Packers Win'],
		pf: parseInt(g.packers_score, 10) || 0,
		pa: parseInt(g.opponent_score, 10) || 0,
	});

	const opponents = [...byOpp.entries()].map(([name, list]) => {
		const count = { WIN: 0, LOSS: 0, TIE: 0 };
		const playoff = { WIN: 0, LOSS: 0, TIE: 0 };
		let biggestWin = null;
		for (const g of list) {
			const r = g['Packers Win'];
			count[r]++;
			if (g.regular_season !== '1') playoff[r]++;
			if (r === 'WIN') {
				const w = info(g);
				if (!biggestWin || w.pf - w.pa > biggestWin.pf - biggestWin.pa) biggestWin = w;
			}
		}
		const last = list[list.length - 1];
		let streak = 1;
		for (let i = list.length - 2; i >= 0 && list[i]['Packers Win'] === last['Packers Win']; i--) streak++;
		const playoffGames = playoff.WIN + playoff.LOSS + playoff.TIE;
		return {
			name, slug: slugifyOpponent(name),
			current: CURRENT_FRANCHISES.has(name),
			games: list.length,
			wins: count.WIN, losses: count.LOSS, ties: count.TIE,
			record: rec(count.WIN, count.LOSS, count.TIE),
			winPct: (count.WIN + count.TIE / 2) / list.length,
			playoffGames,
			playoffRecord: playoffGames ? rec(playoff.WIN, playoff.LOSS, playoff.TIE) : null,
			first: info(list[0]), last: info(last),
			streak: { result: last['Packers Win'], count: streak },
			biggestWin,
		};
	}).sort((a, b) => b.games - a.games || (a.name < b.name ? -1 : 1));

	return { opponents, bySlug: new Map(opponents.map((o) => [o.slug, o])) };
}

// "The Packers have won the last 8 meetings." / single-game fallback.
export function streakSentence(o) {
	const { result, count } = o.streak;
	const verb = result === 'WIN' ? 'won' : result === 'LOSS' ? 'lost' : 'tied';
	if (count >= 2) return `The Packers have ${verb} the last ${count} meetings.`;
	const noun = result === 'WIN' ? 'win' : result === 'LOSS' ? 'loss' : 'tie';
	return `Last meeting: a ${o.last.pf}–${o.last.pa} ${noun} on ${formatDate(o.last.date)}.`;
}

// Per-opponent copy shared by server OG meta and client share messages.
// slug 'overview'/unknown -> landing-page copy.
export function h2hCopy(slug, data) {
	const o = data.bySlug.get(slug);
	if (!o) {
		const top = data.opponents[0];
		return {
			title: 'Packers All-Time Head-to-Head',
			desc: `The Packers' all-time record against all ${data.opponents.length} opponents they've ever faced. Most played: the ${top.name}, ${top.record} in ${top.games} meetings.`,
		};
	}
	return {
		title: `Packers vs ${o.name} — ${o.record} all-time`,
		desc: `The Packers are ${o.record} all-time against the ${o.name} in ${meetings(o.games)}. ${streakSentence(o)}`,
	};
}

export const meetings = (n) => `${n} meeting${n === 1 ? '' : 's'}`;
