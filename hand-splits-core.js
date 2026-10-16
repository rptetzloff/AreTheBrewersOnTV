// Brewers splits by the opponent's hand: each batter against right- and
// left-handed pitchers, each pitcher against right- and left-handed batters,
// by season. Built from Retrosheet's play-by-play (plays.lfs.csv), one plate
// appearance at a time, when the indices are built — the 400MB file never
// ships — and kept as the small handSplits index.
//
// The hands come from each play. pithand is the arm the pitcher threw with.
// bathand is the batter's listed hand, and a switch hitter's reads "B" —
// 68,451 plate appearances, which a first version dropped, leaving Corbin
// Burnes's 2021 short by 96 batters. A switch hitter bats left against a
// right-hander and right against a left-hander, so that is the side he is
// counted on. Regular season only, tiebreaker games included (Retrosheet's
// gametype "playoff"), as everywhere on the site. "walk" already counts
// intentional walks; "iw" says which of them were.
// Pure functions — no fs/fetch/DOM.

import { splitCsvLine, BREWERS_IDS } from './records-core.js';

const COUNTS = ['pa', 'ab', 'h', 'd', 't', 'hr', 'bb', 'ibb', 'k', 'hbp', 'sf', 'sh', 'rbi'];

/** The side a batter hit from: his listed hand, or for a switch hitter
 *  ("B") the side opposite the pitcher's arm. Null when it cannot be told. */
export function battingSide(bathand, pithand) {
	if (bathand === 'R' || bathand === 'L') return bathand;
	if (bathand === 'B' && (pithand === 'R' || pithand === 'L')) return pithand === 'R' ? 'L' : 'R';
	return null;
}
const REGULAR = new Set(['regular', 'playoff']);
const blank = () => Object.fromEntries(COUNTS.map((k) => [k, 0]));

/** A streaming collector over plays.lfs.csv: line(text) for each line,
 *  header first; result() -> { handSplits } where handSplits is a Map of
 *  "bat|<id>" / "pit|<id>" -> Map of season -> { R, L } count lines. */
export function createHandSplitsCollector(teamIds = BREWERS_IDS) {
	const splits = new Map();
	let I = null;
	const COLS = ['gid', 'batteam', 'pitteam', 'batter', 'pitcher', 'bathand', 'pithand', 'pa', 'ab',
		'single', 'double', 'triple', 'hr', 'walk', 'iw', 'k', 'hbp', 'sf', 'sh', 'rbi', 'gametype'];
	const add = (role, id, season, hand, v) => {
		const key = `${role}|${id}`;
		if (!splits.has(key)) splits.set(key, new Map());
		const bySeason = splits.get(key);
		if (!bySeason.has(season)) bySeason.set(season, { R: blank(), L: blank() });
		const c = bySeason.get(season)[hand];
		const one = (col) => (v[I[col]] === '1' ? 1 : 0);
		c.pa += 1;
		c.ab += one('ab');
		const d = one('double'), t = one('triple'), hr = one('hr');
		c.h += one('single') + d + t + hr;
		c.d += d; c.t += t; c.hr += hr;
		c.bb += one('walk'); c.ibb += one('iw');
		c.k += one('k'); c.hbp += one('hbp'); c.sf += one('sf'); c.sh += one('sh');
		c.rbi += Number(v[I.rbi]) || 0;
	};
	const line = (text) => {
		if (!text || !text.trim()) return;
		if (!I) {
			const h = splitCsvLine(text);
			I = Object.fromEntries(COLS.map((c) => [c, h.indexOf(c)]));
			return;
		}
		const v = splitCsvLine(text);
		if (v[I.pa] !== '1' || !REGULAR.has(v[I.gametype])) return;
		const season = Number(String(v[I.gid]).slice(3, 7));
		if (!season) return;
		if (teamIds.has(v[I.batteam])) {
			const hand = v[I.pithand];
			if (hand === 'R' || hand === 'L') add('bat', v[I.batter], season, hand, v);
		}
		if (teamIds.has(v[I.pitteam])) {
			const hand = battingSide(v[I.bathand], v[I.pithand]);
			if (hand) add('pit', v[I.pitcher], season, hand, v);
		}
	};
	return { line, result: () => ({ handSplits: splits }) };
}

const ratio = (n, d) => (d > 0 ? n / d : null);

/** A split's line with its rates: AVG, OBP, SLG and OPS, as MLB defines
 *  them, null with no denominator. For a pitcher it is the line against him. */
export function splitLine(c) {
	const tb = c.h + c.d + 2 * c.t + 3 * c.hr;
	const obp = ratio(c.h + c.bb + c.hbp, c.ab + c.bb + c.hbp + c.sf);
	const slg = ratio(tb, c.ab);
	return { ...c, tb, avg: ratio(c.h, c.ab), obp, slg, ops: obp === null || slg === null ? null : obp + slg };
}

const sum = (a, b) => Object.fromEntries(COUNTS.map((k) => [k, (a?.[k] || 0) + (b?.[k] || 0)]));

/** One player's splits, for his page: by season and for his Brewers career,
 *  as a batter against each pitching hand and as a pitcher against each
 *  batting side. Rows are { season, vs, ...splitLine }, vs "R" or "L";
 *  null where he has none. */
export function playerHandSplits(handSplits, id) {
	const side = (role) => {
		const bySeason = handSplits?.get(`${role}|${id}`);
		if (!bySeason || !bySeason.size) return null;
		const seasons = [...bySeason.keys()].sort((a, b) => a - b);
		const rows = seasons.flatMap((season) => ['R', 'L']
			.filter((vs) => bySeason.get(season)[vs].pa > 0)
			.map((vs) => ({ season, vs, ...splitLine(bySeason.get(season)[vs]) })));
		const career = Object.fromEntries(['R', 'L'].map((vs) => [vs,
			splitLine(seasons.reduce((acc, s) => sum(acc, bySeason.get(s)[vs]), null) || blank())]));
		return { rows, career };
	};
	const batting = side('bat');
	const pitching = side('pit');
	return batting || pitching ? { batting, pitching } : null;
}
