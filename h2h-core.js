// Shared (browser + node) all-time head-to-head records vs every opponent,
// computed from data/brewers_games.csv. Pure functions only — no fs/fetch/DOM.
//
// Opponents are grouped by franchise (the stable `franchiseName` code from
// CurrentNames.csv), so a franchise that relocates or rebrands — e.g. the
// Athletics (Philadelphia → Kansas City → Oakland → Sacramento) — is one
// continuous opponent, not split across cities. The display name is the
// opponent's most recent era name (so the A's show as "Sacramento Athletics"
// today), and the slug is derived from that current name.
import { rec, formatDate } from './records-core.js';

export const slugifyOpponent = (name) =>
	name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const RESULTS = new Set(['WIN', 'LOSS', 'TIE']);

// rows: parsed game rows (each carries a `franchise` code and an `Opponent`
// display name). Returns { opponents, bySlug, latestSeason } — opponents
// sorted by meetings played (rivals first), then name. All games count
// (playoffs included); the playoff split is broken out per opponent.
//
// A franchise is "current" if it appears in the latest season present in the
// data, so the "Current franchises only" filter stays accurate as franchises
// relocate or rebrand without needing a hardcoded list.
export function computeHeadToHead(rows) {
	const games = rows
		.filter((g) => RESULTS.has(g['Brewers Win']))
		.slice()
		.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

	let latestSeason = 0;
	for (const g of games) {
		const yr = parseInt(g.season, 10);
		if (yr > latestSeason) latestSeason = yr;
	}

	const byFran = new Map();
	for (const g of games) {
		const key = g.franchise || g.Opponent;
		if (!byFran.has(key)) byFran.set(key, []);
		byFran.get(key).push(g);
	}

	const info = (g) => ({
		date: g.date, season: parseInt(g.season, 10),
		result: g['Brewers Win'],
		pf: parseInt(g.brewers_score, 10) || 0,
		pa: parseInt(g.opponent_score, 10) || 0,
	});

	const opponents = [...byFran.entries()].map(([fran, list]) => {
		const count = { WIN: 0, LOSS: 0, TIE: 0 };
		const playoff = { WIN: 0, LOSS: 0, TIE: 0 };
		let biggestWin = null;
		for (const g of list) {
			const r = g['Brewers Win'];
			count[r]++;
			if (g.regular_season !== '1') playoff[r]++;
			if (r === 'WIN') {
				const w = info(g);
				if (!biggestWin || w.pf - w.pa > biggestWin.pf - biggestWin.pa) biggestWin = w;
			}
		}
		const last = list[list.length - 1];
		let streak = 1;
		for (let i = list.length - 2; i >= 0 && list[i]['Brewers Win'] === last['Brewers Win']; i--) streak++;
		const playoffGames = playoff.WIN + playoff.LOSS + playoff.TIE;
		// Display name = the opponent's most recent era name. Games are sorted
		// ascending by date, so the last row carries the current-era name
		// (e.g. "Sacramento Athletics" for the A's franchise today).
		const name = last.Opponent;
		return {
			name, slug: slugifyOpponent(name),
			franchise: fran,
			current: parseInt(last.season, 10) === latestSeason,
			games: list.length,
			wins: count.WIN, losses: count.LOSS, ties: count.TIE,
			record: rec(count.WIN, count.LOSS, count.TIE),
			winPct: (count.WIN + count.TIE / 2) / list.length,
			playoffGames,
			playoffRecord: playoffGames ? rec(playoff.WIN, playoff.LOSS, playoff.TIE) : null,
			first: info(list[0]), last: info(last),
			streak: { result: last['Brewers Win'], count: streak },
			biggestWin,
		};
	}).sort((a, b) => b.games - a.games || (a.name < b.name ? -1 : 1));

	return { opponents, bySlug: new Map(opponents.map((o) => [o.slug, o])) };
}

// "The Brewers have won the last 8 meetings." / single-game fallback.
export function streakSentence(o) {
	const { result, count } = o.streak;
	const verb = result === 'WIN' ? 'won' : result === 'LOSS' ? 'lost' : 'tied';
	if (count >= 2) return `The Brewers have ${verb} the last ${count} meetings.`;
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
			title: 'Brewers All-Time Head-to-Head',
			desc: `The Brewers' all-time record against all ${data.opponents.length} opponents they've ever faced. Most played: the ${top.name}, ${top.record} in ${top.games} meetings.`,
		};
	}
	return {
		title: `Brewers vs ${o.name} — ${o.record} all-time`,
		desc: `The Brewers are ${o.record} all-time against the ${o.name} in ${meetings(o.games)}. ${streakSentence(o)}`,
	};
}

export const meetings = (n) => `${n} meeting${n === 1 ? '' : 's'}`;
