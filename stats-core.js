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

/** Batting lines for a season, one per player.
 *  OBP is (H+BB+HBP)/(AB+BB+HBP+SF) and SLG total bases over AB, as MLB
 *  defines them. */
export function seasonBatting(batting, gids, playerNames, teamIds) {
	const players = sumByPlayer(batting, gids, teamIds, (p, b) => {
		for (const k of ['pa', 'ab', 'r', 'h', 'd', 't', 'hr', 'rbi', 'bb', 'k', 'sb', 'cs', 'hbp', 'sf', 'sh', 'gdp']) inc(p, k, b[k]);
	});
	// Only players who came to the plate. Retrosheet gives every pitcher a
	// batting line, so a DH-era season listed its whole staff at 0 PA beneath
	// the hitters.
	return [...players.values()].filter((p) => p.pa > 0).map((p) => {
		const tb = p.h + p.d + 2 * p.t + 3 * p.hr;
		const obp = ratio(p.h + p.bb + p.hbp, p.ab + p.bb + p.hbp + p.sf);
		const slg = ratio(tb, p.ab);
		return {
			id: p.id, name: playerNames.get(p.id) || p.id, g: p.games.size,
			pa: p.pa, ab: p.ab, r: p.r, h: p.h, d: p.d, t: p.t, hr: p.hr, rbi: p.rbi,
			bb: p.bb, k: p.k, sb: p.sb, cs: p.cs, hbp: p.hbp, sf: p.sf, sh: p.sh, gdp: p.gdp, tb,
			avg: ratio(p.h, p.ab), obp, slg, ops: obp === null || slg === null ? null : obp + slg,
		};
	});
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
	return [...players.values()].map((p) => ({
		id: p.id, name: playerNames.get(p.id) || p.id, g: p.games.size,
		gs: p.gs, gf: p.gf, w: p.w, l: p.l, sv: p.sv,
		ipouts: p.ipouts, ip: `${Math.floor(p.ipouts / 3)}.${p.ipouts % 3}`,
		bf: p.bf, h: p.h, r: p.r, er: p.er, hr: p.hr, bb: p.bb, k: p.k, hbp: p.hbp, wp: p.wp, bk: p.bk,
		era: ratio(27 * p.er, p.ipouts),
		whip: ratio(3 * (p.bb + p.h), p.ipouts),
		k9: ratio(27 * p.k, p.ipouts),
	}));
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
