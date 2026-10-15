// Player season stats: batting, pitching and fielding totals for every Brewer
// in a season, summed from the box score indices (one line per player per
// game). Pure functions — no fs/fetch/DOM — so the server builds them and the
// tests pin them with hand-made lines.
//
// Regular season only. Rate stats are computed from the totals, never
// averaged across games, and are null when their denominator is zero rather
// than 0 — a pitcher with no innings has no ERA, which is not an ERA of 0.

import { POS_NAMES } from './boxscore-core.js';

const ratio = (num, den) => (den > 0 ? num / den : null);

/** Sum one season's lines per player. `lines` yields [gid, rows] from an
 *  index; `gids` is the set of that season's regular-season games. */
function sumByPlayer(index, gids, teamIds, add) {
	const players = new Map();
	for (const gid of gids) {
		for (const row of index.get(gid) || []) {
			if (!teamIds.has(row.team)) continue;
			let p = players.get(row.id);
			if (!p) { p = { id: row.id, games: new Set() }; players.set(row.id, p); }
			p.games.add(gid);
			add(p, row, gid);
		}
	}
	return players;
}

const inc = (p, key, n) => { p[key] = (p[key] || 0) + n; };

// The counting stats each line carries. Everything else on a line is derived
// from these, so a career is these summed and the rates computed again —
// never an average of season rates.
const BAT_COUNTS = ['g', 'pa', 'ab', 'r', 'h', 'd', 't', 'hr', 'rbi', 'bb', 'k', 'sb', 'cs', 'hbp', 'sf', 'sh', 'gdp'];
const PIT_COUNTS = ['g', 'gs', 'gf', 'w', 'l', 'sv', 'ipouts', 'bf', 'h', 'r', 'er', 'hr', 'bb', 'k', 'hbp', 'wp', 'bk'];

/** A batting line from counting totals: OBP is (H+BB+HBP)/(AB+BB+HBP+SF)
 *  and SLG total bases over AB, as MLB defines them. */
function battingLine(id, name, c) {
	const tb = c.h + c.d + 2 * c.t + 3 * c.hr;
	const obp = ratio(c.h + c.bb + c.hbp, c.ab + c.bb + c.hbp + c.sf);
	const slg = ratio(tb, c.ab);
	const line = { id, name };
	for (const k of BAT_COUNTS) line[k] = c[k] || 0;
	return { ...line, tb, avg: ratio(c.h, c.ab), obp, slg, ops: obp === null || slg === null ? null : obp + slg };
}

/** A pitching line from counting totals. */
function pitchingLine(id, name, c) {
	const line = { id, name };
	for (const k of PIT_COUNTS) line[k] = c[k] || 0;
	return {
		...line,
		ip: `${Math.floor(line.ipouts / 3)}.${line.ipouts % 3}`,
		era: ratio(27 * line.er, line.ipouts),
		whip: ratio(3 * (line.bb + line.h), line.ipouts),
		k9: ratio(27 * line.k, line.ipouts),
	};
}

/** Batting lines for a season, one per player. */
export function seasonBatting(batting, gids, playerNames, teamIds) {
	const players = sumByPlayer(batting, gids, teamIds, (p, b) => {
		for (const k of BAT_COUNTS) if (k !== 'g') inc(p, k, b[k]);
	});
	// Only players who came to the plate. Retrosheet gives every pitcher a
	// batting line, so a DH-era season listed its whole staff at 0 PA beneath
	// the hitters.
	return [...players.values()].filter((p) => p.pa > 0)
		.map((p) => battingLine(p.id, playerNames.get(p.id) || p.id, { ...p, g: p.games.size }));
}

/** Pitching lines for a season, one per pitcher. Wins, losses and saves come
 *  from the decisions Retrosheet records on each line. */
export function seasonPitching(pitching, gids, playerNames, teamIds) {
	const players = sumByPlayer(pitching, gids, teamIds, (p, x) => {
		for (const k of ['ipouts', 'bf', 'h', 'hr', 'r', 'er', 'bb', 'k', 'hbp', 'wp', 'bk']) inc(p, k, x[k]);
		inc(p, 'gs', x.gs ? 1 : 0);
		inc(p, 'gf', x.gf ? 1 : 0);
		inc(p, 'w', x.isWp ? 1 : 0);
		inc(p, 'l', x.isLp ? 1 : 0);
		inc(p, 'sv', x.isSave ? 1 : 0);
	});
	return [...players.values()]
		.map((p) => pitchingLine(p.id, playerNames.get(p.id) || p.id, { ...p, g: p.games.size }));
}

/** Brewers careers: each player's season lines summed, rates recomputed.
 *  `seasons` is [{ season, batting, pitching }]. Each career carries its
 *  first and last Brewers season. */
export function careerLines(seasons) {
	const sum = (kind, counts, makeLine) => {
		const by = new Map();
		for (const s of seasons) {
			for (const line of s[kind]) {
				let c = by.get(line.id);
				if (!c) { c = { id: line.id, name: line.name, first: s.season, last: s.season, seasons: 0 }; by.set(line.id, c); }
				for (const k of counts) inc(c, k, line[k]);
				c.first = Math.min(c.first, s.season);
				c.last = Math.max(c.last, s.season);
				c.seasons += 1;
			}
		}
		return [...by.values()].map((c) => ({ ...makeLine(c.id, c.name, c), first: c.first, last: c.last, seasons: c.seasons }));
	};
	return {
		batting: sum('batting', BAT_COUNTS, battingLine),
		pitching: sum('pitching', PIT_COUNTS, pitchingLine),
	};
}

// What each leaderboard ranks. `rate` boards need a qualifier; `asc` boards
// rank low to high (ERA, WHIP).
export const BATTING_BOARDS = [
	{ key: 'h', label: 'Hits' }, { key: 'hr', label: 'Home Runs' }, { key: 'rbi', label: 'RBI' },
	{ key: 'r', label: 'Runs' }, { key: 'd', label: 'Doubles' }, { key: 't', label: 'Triples' },
	{ key: 'sb', label: 'Stolen Bases' }, { key: 'bb', label: 'Walks' }, { key: 'g', label: 'Games' },
	{ key: 'avg', label: 'Batting Average', rate: true }, { key: 'obp', label: 'On-Base Percentage', rate: true },
	{ key: 'slg', label: 'Slugging Percentage', rate: true }, { key: 'ops', label: 'OPS', rate: true },
];
export const PITCHING_BOARDS = [
	{ key: 'w', label: 'Wins' }, { key: 'sv', label: 'Saves' }, { key: 'k', label: 'Strikeouts' },
	{ key: 'ipouts', label: 'Innings Pitched' }, { key: 'g', label: 'Games Pitched' }, { key: 'gs', label: 'Games Started' },
	{ key: 'era', label: 'ERA', rate: true, asc: true }, { key: 'whip', label: 'WHIP', rate: true, asc: true },
	{ key: 'k9', label: 'Strikeouts per 9', rate: true },
];

// Qualifiers for rate boards. A single season uses MLB's title rules, which
// scale with the schedule (1981 and 2020 were short): 3.1 plate appearances
// or one inning per team game. Careers have no MLB rule; these are chosen,
// and named on the page.
export const CAREER_MIN_PA = 2000;
export const CAREER_MIN_IPOUTS = 3 * 500;

/** The top `n` lines on one board. Ties keep the earlier season (or the
 *  longer career) first, so the order never depends on input order. */
export function leaderboard(lines, board, { qualifies = () => true, n = 10 } = {}) {
	const pool = lines.filter((l) => l[board.key] !== null && l[board.key] !== undefined && (!board.rate || qualifies(l)));
	const dir = board.asc ? 1 : -1;
	return pool
		.sort((a, b) => dir * (a[board.key] - b[board.key]) || (a.season ?? a.first) - (b.season ?? b.first) || a.name.localeCompare(b.name))
		.slice(0, n);
}

/** Every career and single-season board, from all season tables.
 *  `teamGames` maps season -> regular-season games (for the title rules). */
export function buildLeaders(seasons, teamGames, { n = 10 } = {}) {
	const careers = careerLines(seasons);
	const singles = {
		batting: seasons.flatMap((s) => s.batting.map((l) => ({ ...l, season: s.season }))),
		pitching: seasons.flatMap((s) => s.pitching.map((l) => ({ ...l, season: s.season }))),
	};
	// Each entry carries what a board shows — the value, who, when, and the
	// playing time behind a rate — not the whole line: 44 boards of full
	// lines was a quarter of a megabyte.
	const entry = (b) => (l) => ({
		id: l.id, name: l.name, value: l[b.key],
		season: l.season, first: l.first, last: l.last, pa: l.pa, ip: l.ip,
	});
	const boards = (lines, specs, qualifies) => specs.map((b) => ({ ...b, leaders: leaderboard(lines, b, { qualifies, n }).map(entry(b)) }));
	return {
		career: {
			batting: boards(careers.batting, BATTING_BOARDS, (l) => l.pa >= CAREER_MIN_PA),
			pitching: boards(careers.pitching, PITCHING_BOARDS, (l) => l.ipouts >= CAREER_MIN_IPOUTS),
		},
		single: {
			batting: boards(singles.batting, BATTING_BOARDS, (l) => l.pa >= 3.1 * (teamGames.get(l.season) || Infinity)),
			pitching: boards(singles.pitching, PITCHING_BOARDS, (l) => l.ipouts >= 3 * (teamGames.get(l.season) || Infinity)),
		},
		qualifiers: { careerPa: CAREER_MIN_PA, careerIp: CAREER_MIN_IPOUTS / 3 },
	};
}

/** Fielding lines for a season: one per player per position, because a
 *  fielding percentage across positions mixes a shortstop's chances with a
 *  first baseman's. Pinch hitters and runners (positions 11 and 12) have no
 *  fielding line of their own and are left out. */
export function seasonFielding(fielding, gids, playerNames, teamIds) {
	const byKey = new Map();
	for (const gid of gids) {
		for (const f of fielding.get(gid) || []) {
			if (!teamIds.has(f.team) || f.pos < 1 || f.pos > 10) continue;
			const key = `${f.id}|${f.pos}`;
			let p = byKey.get(key);
			if (!p) { p = { id: f.id, pos: f.pos, games: new Set(), gs: 0, po: 0, a: 0, e: 0, dp: 0 }; byKey.set(key, p); }
			p.games.add(gid);
			if (f.gs) p.gs += 1;
			p.po += f.po; p.a += f.a; p.e += f.e; p.dp += f.dp;
		}
	}
	return [...byKey.values()].map((p) => ({
		id: p.id, name: playerNames.get(p.id) || p.id, pos: POS_NAMES[p.pos] || String(p.pos),
		g: p.games.size, gs: p.gs, po: p.po, a: p.a, e: p.e, dp: p.dp,
		fpct: ratio(p.po + p.a, p.po + p.a + p.e),
	}));
}

/** Every regular-season game of each season, from parsed game rows: the gid
 *  lists the functions above take.
 *
 *  Tiebreakers count. MLB folds a tiebreaker game into regular-season stats
 *  (it was "Game 163"), and the parsed rows mark it T, not regular, so it was
 *  left out: Christian Yelich's 2018 came out .323 with 184 hits against his
 *  official .326 with 187, the three hits he had in Game 163 at Wrigley. */
export function regularGidsBySeason(rows) {
	const out = new Map();
	for (const r of rows) {
		if ((r.regular_season !== '1' && r.gametype !== 'T') || !r.gid) continue;
		const yr = parseInt(r.season, 10);
		if (!out.has(yr)) out.set(yr, []);
		out.get(yr).push(r.gid);
	}
	return out;
}
