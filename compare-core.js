// Compare page: up to four Brewers side by side, each as his Brewers career
// or one season. Pure functions — the URL's player list, which line each
// column shows, and which number in a row is the better one — so the tests
// pin them and the page (compare.js) only renders.
//
// The URL is the state: /compare?p=younr001-1982,yelic001-2018,molip001,
// where a bare id is that player's Brewers career.

import { rate, era, two } from './stats-columns.js';

export const MAX_PLAYERS = 4;

// stats-core's PLAYER_ID, repeated so the browser need not load stats-core
// and the box score module behind it for one pattern; a test holds the two
// equal. Eight characters, hyphens allowed — so a slot is matched whole,
// never split on its "-".
export const PLAYER_ID = /^[a-z][a-z-]{4}\d{3}$/;
const SLOT = /^([a-z][a-z-]{4}\d{3})(?:-(\d{4}))?$/;

/** "younr001-1982,yelic001" -> [{ id, season }], season null for a career.
 *  Ids are checked before they reach a fetch; a repeat of the same player
 *  and season is dropped, and anything past four is ignored. */
export function parseSlots(param) {
	const out = [];
	for (const part of String(param || '').split(',')) {
		const m = part.trim().match(SLOT);
		if (!m) continue;
		const slot = { id: m[1], season: m[2] ? Number(m[2]) : null };
		if (out.some((s) => s.id === slot.id && s.season === slot.season)) continue;
		out.push(slot);
		if (out.length === MAX_PLAYERS) break;
	}
	return out;
}

/** The reverse of parseSlots. */
export function slotsParam(slots) {
	return slots.map((s) => (s.season ? `${s.id}-${s.season}` : s.id)).join(',');
}

/** A player's line for one side ('batting' or 'pitching'): the season's
 *  when a season is chosen, else the Brewers career. `player` is
 *  /api/player/<id>'s body. Null when he has none (a hitter's pitching). */
export function slotLine(player, season, side) {
	if (!player) return null;
	if (season) return (player[side] || []).find((l) => l.season === season) || null;
	return player.career?.[side] || null;
}

// The rows of each table. `better` is which way is good: 1 higher, -1
// lower, 0 neither — more games or plate appearances is playing time, not
// a better line, so those rows mark nothing.
const count = (key, label, title, better = 1) => ({ key, label, title, better });
export const COMPARE_ROWS = {
	batting: [
		count('g', 'G', 'Games', 0), count('pa', 'PA', 'Plate appearances', 0), count('ab', 'AB', 'At-bats', 0),
		count('r', 'R', 'Runs'), count('h', 'H', 'Hits'), count('d', '2B', 'Doubles'), count('t', '3B', 'Triples'),
		count('hr', 'HR', 'Home runs'), count('rbi', 'RBI', 'Runs batted in'), count('bb', 'BB', 'Walks'),
		count('k', 'SO', 'Strikeouts', -1), count('sb', 'SB', 'Stolen bases'), count('cs', 'CS', 'Caught stealing', -1),
		{ ...count('avg', 'AVG', 'Batting average'), fmt: rate }, { ...count('obp', 'OBP', 'On-base percentage'), fmt: rate },
		{ ...count('slg', 'SLG', 'Slugging percentage'), fmt: rate }, { ...count('ops', 'OPS', 'On-base plus slugging'), fmt: rate },
	],
	pitching: [
		count('w', 'W', 'Wins'), count('l', 'L', 'Losses', -1),
		{ ...count('era', 'ERA', 'Earned run average', -1), fmt: era },
		count('g', 'G', 'Games', 0), count('gs', 'GS', 'Games started', 0), count('sv', 'SV', 'Saves'),
		{ ...count('ipouts', 'IP', 'Innings pitched'), fmt: (v, l) => l.ip },
		count('h', 'H', 'Hits allowed', -1), count('r', 'R', 'Runs allowed', -1), count('er', 'ER', 'Earned runs', -1),
		count('hr', 'HR', 'Home runs allowed', -1), count('bb', 'BB', 'Walks', -1), count('k', 'SO', 'Strikeouts'),
		{ ...count('whip', 'WHIP', 'Walks plus hits per inning', -1), fmt: two }, { ...count('k9', 'K/9', 'Strikeouts per nine innings'), fmt: two },
	],
};

/** Which columns hold the better value in a row: every one tied for best,
 *  as a Set of indexes. Nothing is marked when fewer than two columns have
 *  a value, when all of them are equal, or for a row with no better way. */
export function bestIndexes(values, better) {
	if (!better) return new Set();
	const present = values.map((v, i) => [v, i]).filter(([v]) => v !== null && v !== undefined);
	if (present.length < 2) return new Set();
	const best = better > 0 ? Math.max(...present.map(([v]) => v)) : Math.min(...present.map(([v]) => v));
	if (present.every(([v]) => v === best)) return new Set();
	return new Set(present.filter(([v]) => v === best).map(([, i]) => i));
}
