// Team splits: a season's regular-season record cut by where, when, how
// close and against whom. Pure functions over the parsed game rows,
// ballparks-core's game-day columns and the line scores; the server builds
// them per season for /api/stats/<season>.
//
// The splits are the ones the data can answer for every season. Day/night
// comes from gameinfo.csv; extra innings from the line scores (gameinfo's
// own innings column is empty before 2020); the opposing starter's hand
// from the box score pitching lines and biofile0.csv. Splits that need the
// standings (vs winning teams, vs division) are left out.

import { inningsPlayed } from './ballparks-core.js';

const RESULT = { WIN: 'W', LOSS: 'L', TIE: 'T' };
// As MLB groups them: the few March and October regular-season games join
// the month next to them. MONTHS is the order; an object's keys would put
// '10' first, since an integer-like key sorts ahead of '03'.
// Named as Baseball-Reference names them, short enough for a phone.
const MONTH = { '03': 'Mar/Apr', '04': 'Mar/Apr', '05': 'May', '06': 'June', '07': 'July', '08': 'Aug', '09': 'Sept/Oct', '10': 'Sept/Oct' };
const MONTHS = ['Mar/Apr', 'May', 'June', 'July', 'Aug', 'Sept/Oct'];

/** The splits for a set of games. `rows` are parsed game rows (regular
 *  season only is the caller's choice); `gameDay` parseGameDay's map,
 *  `lineScores` parseTeamstatsLineScores's, and `starterHand` gid -> the
 *  opposing starter's throwing hand, 'R' or 'L'. Each split is
 *  { group, label, g, w, l, t, rs, ra }; a split with no games is left out,
 *  so a season without day/night recorded has no Day or Night line rather
 *  than two empty ones. */
export function teamSplits(rows, { gameDay = new Map(), lineScores = new Map(), starterHand = new Map() } = {}) {
	const games = rows.filter((r) => RESULT[r.result]).map((r) => {
		const rs = parseInt(r.scoreFor, 10) || 0;
		const ra = parseInt(r.scoreAgainst, 10) || 0;
		return {
			result: RESULT[r.result], rs, ra,
			home: r.location === 'home',
			daynight: gameDay.get(r.gid)?.daynight || '',
			month: MONTH[r.date.slice(5, 7)] || null,
			innings: inningsPlayed(lineScores.get(r.gid)),
			scheduled: gameDay.get(r.gid)?.scheduled || 9,
			hand: starterHand.get(r.gid) || null,
			margin: Math.abs(rs - ra),
		};
	});

	const SPLITS = [
		['Overall', 'All games', () => true],
		['Where', 'Home', (g) => g.home],
		['Where', 'Away', (g) => !g.home],
		['When', 'Day', (g) => g.daynight === 'day'],
		['When', 'Night', (g) => g.daynight === 'night'],
		...MONTHS.map((m) => ['Month', m, (g) => g.month === m]),
		['Game', 'One-run games', (g) => g.margin === 1],
		['Game', 'Blowouts (5+ runs)', (g) => g.margin >= 5],
		// Past the scheduled length: a 2020-21 seven-inning doubleheader game
		// that went to the eighth is extra innings too.
		['Game', 'Extra innings', (g) => g.innings > g.scheduled],
		['Opposing starter', 'Right-handed', (g) => g.hand === 'R'],
		['Opposing starter', 'Left-handed', (g) => g.hand === 'L'],
	];

	return SPLITS.map(([group, label, keep]) => {
		const s = { group, label, g: 0, w: 0, l: 0, t: 0, rs: 0, ra: 0 };
		for (const g of games.filter(keep)) {
			s.g++;
			if (g.result === 'W') s.w++; else if (g.result === 'L') s.l++; else s.t++;
			s.rs += g.rs;
			s.ra += g.ra;
		}
		return s;
	}).filter((s) => s.g > 0);
}

/** gid -> the opposing starter's throwing hand, from the box score pitching
 *  index (gid -> pitching lines for both teams) and a map of pitcher id ->
 *  { throws }. A game whose starter or hand is unknown is left out. */
export function opposingStarterHands(gids, pitchingIndex, teamIds, bios) {
	const out = new Map();
	for (const gid of gids) {
		const starter = (pitchingIndex.get(gid) || []).find((p) => p.gs && !teamIds.has(p.team));
		const hand = starter && bios.get(starter.id)?.throws;
		if (hand === 'R' || hand === 'L') out.set(gid, hand);
	}
	return out;
}

/** Every opposing starter's id across these games, for parseBios. */
export function opposingStarterIds(gids, pitchingIndex, teamIds) {
	const ids = new Set();
	for (const gid of gids) {
		for (const p of pitchingIndex.get(gid) || []) if (p.gs && !teamIds.has(p.team)) ids.add(p.id);
	}
	return ids;
}
