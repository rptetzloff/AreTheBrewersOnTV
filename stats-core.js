// Player season stats: batting, pitching and fielding totals for every Brewer
// in a season, summed from the box score indices (one line per player per
// game). Pure functions — no fs/fetch/DOM — so the server builds them and the
// tests pin them with hand-made lines.
//
// Regular season only. Rate stats are computed from the totals, never
// averaged across games, and are null when their denominator is zero rather
// than 0 — a pitcher with no innings has no ERA, which is not an ERA of 0.

import { POS_NAMES } from './boxscore-core.js';
import { splitCsvLine } from './records-core.js';

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

/** Each player's fielding across all his positions in a season. Games and
 *  starts are distinct games, not the per-position counts added up: Yount
 *  playing left and center in one game is one game. DH lines are left out —
 *  a designated hitter does not field, so his games would only pad G. */
export function seasonFieldingTotals(fielding, gids, playerNames, teamIds) {
	const by = new Map();
	for (const gid of gids) {
		for (const f of fielding.get(gid) || []) {
			if (!teamIds.has(f.team) || f.pos < 1 || f.pos > 9) continue;
			let p = by.get(f.id);
			if (!p) { p = { id: f.id, games: new Set(), starts: new Set(), positions: new Set(), po: 0, a: 0, e: 0, dp: 0 }; by.set(f.id, p); }
			p.games.add(gid);
			if (f.gs) p.starts.add(gid);
			p.positions.add(f.pos);
			p.po += f.po; p.a += f.a; p.e += f.e; p.dp += f.dp;
		}
	}
	return [...by.values()].map((p) => ({
		id: p.id, name: playerNames.get(p.id) || p.id, pos: 'All', positions: p.positions.size,
		posList: [...p.positions].sort((a, b) => a - b).map((n) => POS_NAMES[n] || String(n)).join(', '),
		g: p.games.size, gs: p.starts.size, po: p.po, a: p.a, e: p.e, dp: p.dp,
		fpct: ratio(p.po + p.a, p.po + p.a + p.e),
	}));
}

/** Retrosheet player ids: five letters (or hyphens, for short surnames) and
 *  three digits — younr001, a-rod001. Checked rather than trusted, since it
 *  arrives in a URL. */
export const PLAYER_ID = /^[a-z][a-z-]{4}\d{3}$/;

/** Every Brewer, for the player search: id, name, first and last Brewers
 *  season, and whether he was mostly a pitcher — more innings than a quarter
 *  of his plate appearances, the same rule the player page uses to lead with
 *  pitching. Sorted by name. */
export function playerDirectory(seasons) {
	const by = new Map();
	const touch = (line, season) => {
		let p = by.get(line.id);
		if (!p) { p = { id: line.id, name: line.name, first: season, last: season, pa: 0, ipouts: 0 }; by.set(line.id, p); }
		p.first = Math.min(p.first, season);
		p.last = Math.max(p.last, season);
		return p;
	};
	for (const s of seasons) {
		for (const l of s.batting) touch(l, s.season).pa += l.pa;
		for (const l of s.pitching) touch(l, s.season).ipouts += l.ipouts;
		for (const l of s.fielding || []) touch(l, s.season);
	}
	return [...by.values()]
		.map(({ id, name, first, last, pa, ipouts }) => ({ id, name, first, last, pitcher: ipouts / 3 > pa / 4 }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** One player's Brewers seasons, from the season tables, plus career totals.
 *  `seasons` is [{ season, batting, pitching, fielding }]. */
export function playerSeasons(seasons, id) {
	const pick = (kind) => seasons.flatMap((s) => (s[kind] || []).filter((l) => l.id === id).map((l) => ({ season: s.season, ...l })));
	const batting = pick('batting');
	const pitching = pick('pitching');
	const fielding = pick('fielding');
	if (!batting.length && !pitching.length && !fielding.length) return null;
	const mine = seasons.map((s) => ({
		season: s.season,
		batting: s.batting.filter((l) => l.id === id),
		pitching: s.pitching.filter((l) => l.id === id),
	}));
	const career = careerLines(mine);
	const name = (batting[0] || pitching[0] || fielding[0]).name;
	const years = [...new Set([...batting, ...pitching, ...fielding].map((l) => l.season))].sort((a, b) => a - b);
	// All positions, by season and for the career. A season's games are
	// already distinct; seasons never share a game, so a career is their sum.
	const fieldingTotals = pick('fieldingTotals');
	let fieldingCareer = null;
	if (fieldingTotals.length) {
		const c = { pos: 'All', g: 0, gs: 0, po: 0, a: 0, e: 0, dp: 0 };
		for (const t of fieldingTotals) for (const k of ['g', 'gs', 'po', 'a', 'e', 'dp']) c[k] += t[k];
		c.positions = new Set(fielding.filter((l) => l.pos !== 'DH').map((l) => l.pos)).size;
		c.fpct = ratio(c.po + c.a, c.po + c.a + c.e);
		fieldingCareer = c;
	}
	return {
		id, name, first: years[0], last: years[years.length - 1], seasons: years.length,
		batting, pitching, fielding, fieldingTotals,
		career: { batting: career.batting[0] || null, pitching: career.pitching[0] || null, fielding: fieldingCareer },
	};
}

/** One player's season, game by game: a batting row for each game he came
 *  to the plate and a pitching row for each game he pitched, in date order.
 *  `idx` holds the box score indices (batting, pitching, fielding: gid ->
 *  lines for both teams), `gids` the season's regular-season games and
 *  `games` gid -> the parsed game row. Each row carries the season-to-date
 *  rates after that game (AVG/OBP/SLG, ERA), computed from the running
 *  totals, as a game log on a baseball card reads. Returns null when he
 *  did neither that season. */
export function playerGameLog(idx, gids, games, id, teamIds) {
	const mine = (index, gid) => (index.get(gid) || []).find((l) => l.id === id && teamIds.has(l.team));
	const ordered = gids
		.map((gid) => ({ gid, g: games.get(gid) }))
		.filter((x) => x.g)
		.sort((a, b) => (a.g.date < b.g.date ? -1 : a.g.date > b.g.date ? 1 : a.gid < b.gid ? -1 : 1));

	const batting = [];
	const pitching = [];
	const bat = {};
	const pit = {};
	for (const { gid, g } of ordered) {
		// gid's last digit: 0 a single game, 1 and 2 the games of a doubleheader.
		const game = {
			gid, date: g.date, opponent: g.Opponent, nick: g.OpponentNick || g.Opponent, home: g.location === 'home',
			result: g.result === 'WIN' ? 'W' : g.result === 'LOSS' ? 'L' : g.result === 'TIE' ? 'T' : '',
			pf: parseInt(g.scoreFor, 10) || 0, pa: parseInt(g.scoreAgainst, 10) || 0,
			doubleheader: Number(gid.slice(-1)) || 0,
		};
		const b = mine(idx.batting, gid);
		if (b && b.pa > 0) {
			for (const k of BAT_COUNTS) if (k !== 'g') bat[k] = (bat[k] || 0) + (b[k] || 0);
			const toDate = battingLine(id, '', bat);
			// Positions in the order he played them; a pinch-hitter or runner
			// with no position is PH or PR, as a box score writes it.
			const pos = (idx.fielding.get(gid) || [])
				.filter((l) => l.id === id && teamIds.has(l.team))
				.sort((x, y) => x.seq - y.seq)
				.map((l) => POS_NAMES[l.pos] || String(l.pos));
			if (b.isDh && !pos.includes('DH')) pos.unshift('DH');
			const position = [...new Set(pos)].join('-') || (b.isPh ? 'PH' : b.isPr ? 'PR' : '');
			batting.push({
				...game, pos: position,
				line: { pa: b.pa, ab: b.ab, r: b.r, h: b.h, d: b.d, t: b.t, hr: b.hr, rbi: b.rbi, bb: b.bb, k: b.k, sb: b.sb, cs: b.cs, hbp: b.hbp, sf: b.sf },
				avg: toDate.avg, obp: toDate.obp, slg: toDate.slg,
			});
		}
		const p = mine(idx.pitching, gid);
		if (p) {
			for (const k of ['ipouts', 'bf', 'h', 'r', 'er', 'hr', 'bb', 'k']) pit[k] = (pit[k] || 0) + (p[k] || 0);
			const toDate = pitchingLine(id, '', pit);
			pitching.push({
				...game, gs: p.gs,
				dec: p.isWp ? 'W' : p.isLp ? 'L' : p.isSave ? 'S' : '',
				line: { ipouts: p.ipouts, ip: `${Math.floor(p.ipouts / 3)}.${p.ipouts % 3}`, h: p.h, r: p.r, er: p.er, bb: p.bb, k: p.k, hr: p.hr, bf: p.bf },
				era: toDate.era,
			});
		}
	}
	return batting.length || pitching.length ? { batting, pitching } : null;
}

const ymd = (s) => (s && /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null);

/** Brewers born on a month and day ("09-16"), for the On This Day panel:
 *  longest Brewers career first, then the earliest born. `directory` is
 *  playerDirectory's list, `bios` parseBios's map. A February 29th birthday
 *  appears on February 29th only. */
export function bornOn(directory, bios, monthDay) {
	return directory
		.map((p) => ({ p, born: bios.get(p.id)?.born }))
		.filter(({ born }) => born && born.slice(5) === monthDay)
		.map(({ p, born }) => ({ id: p.id, name: p.name, year: Number(born.slice(0, 4)), first: p.first, last: p.last }))
		.sort((a, b) => (b.last - b.first) - (a.last - a.first) || a.year - b.year);
}

/** Biographical lines from biofile0.csv, for the ids asked for only — the
 *  file covers every major leaguer (about 27,000), and the site needs the
 *  1,074 who played for the Brewers through 2025. */
export function parseBios(csv, ids) {
	const lines = csv.split('\n');
	const h = splitCsvLine(lines[0]);
	const at = (name) => h.indexOf(name);
	const I = Object.fromEntries(['id', 'usename', 'lastname', 'fullname', 'birthdate', 'birthcity', 'birthstate', 'birthcountry',
		'deathdate', 'debut_p', 'bats', 'throws', 'height', 'weight', 'HOF'].map((k) => [k, at(k)]));
	const out = new Map();
	for (const line of lines.slice(1)) {
		const id = line.slice(0, line.indexOf(','));
		if (!ids.has(id)) continue;
		const v = splitCsvLine(line);
		const get = (k) => (v[I[k]] ?? '').trim();
		out.set(id, {
			fullName: get('fullname'),
			born: ymd(get('birthdate')),
			birthplace: [get('birthcity'), get('birthstate'), get('birthcountry') === 'USA' ? '' : get('birthcountry')].filter(Boolean).join(', '),
			died: ymd(get('deathdate')),
			debut: ymd(get('debut_p')),
			bats: get('bats'), throws: get('throws'),
			height: parseInt(get('height'), 10) || null,
			weight: parseInt(get('weight'), 10) || null,
			hof: get('HOF') === 'HOF',
		});
	}
	return out;
}

/** Every regular-season game of each season, from parsed game rows: the gid
 *  lists the functions above take.
 *
 *  Tiebreakers count. MLB folds a tiebreaker game into regular-season stats
 *  (it was "Game 163"). This function used to add T games itself, because
 *  the parsed rows marked them postseason and Christian Yelich's 2018 came
 *  out .323 with 184 hits, not his official .326 with 187; the parser now
 *  marks a tiebreaker regular season for the whole site, so it needs no
 *  special case here. */
export function regularGidsBySeason(rows) {
	const out = new Map();
	for (const r of rows) {
		if (r.regular_season !== '1' || !r.gid) continue;
		const yr = parseInt(r.season, 10);
		if (!out.has(yr)) out.set(yr, []);
		out.get(yr).push(r.gid);
	}
	return out;
}
