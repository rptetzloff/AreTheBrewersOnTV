// The stat columns and their formatting, shared by the stats page (one
// season, a row per player) and the player page (one player, a row per
// season). Each page adds its own first column: who, or when.
import { esc, formatEra } from './records-core.js';

// .331, 1.031 — rate stats are written without the leading zero, as a box
// score writes them. Null means no denominator (no at-bats, no innings), and
// shows as a dash rather than .000.
export const rate = (v) => (v === null || v === undefined ? '—' : v.toFixed(3).replace(/^0/, ''));
export const era = (v) => (v === null || v === undefined ? '—' : formatEra(v));
export const two = (v) => (v === null || v === undefined ? '—' : v.toFixed(2));
// Where a null lands when sorting: at the bottom in the column's first-click
// direction (best first). `low` is for stats where higher is better (AVG),
// `high` for lower-is-better (ERA). Reversing the sort brings them to the top.
const low = (k) => (r) => r[k] ?? -1;
const high = (k) => (r) => r[k] ?? Infinity;

const n = (key, label, title, extra = {}) => ({ key, label, title, num: true, defaultDir: -1, ...extra });

export const BATTING_COLUMNS = [
	n('g', 'G', 'Games'), n('pa', 'PA', 'Plate appearances'), n('ab', 'AB', 'At-bats'),
	n('r', 'R', 'Runs'), n('h', 'H', 'Hits'), n('d', '2B', 'Doubles'), n('t', '3B', 'Triples'),
	n('hr', 'HR', 'Home runs'), n('rbi', 'RBI', 'Runs batted in'), n('bb', 'BB', 'Walks'),
	n('k', 'SO', 'Strikeouts'), n('sb', 'SB', 'Stolen bases'), n('cs', 'CS', 'Caught stealing'),
	n('avg', 'AVG', 'Batting average', { sortKey: low('avg'), fmt: rate }),
	n('obp', 'OBP', 'On-base percentage', { sortKey: low('obp'), fmt: rate }),
	n('slg', 'SLG', 'Slugging percentage', { sortKey: low('slg'), fmt: rate }),
	n('ops', 'OPS', 'On-base plus slugging', { sortKey: low('ops'), fmt: rate }),
];

export const PITCHING_COLUMNS = [
	n('w', 'W', 'Wins'), n('l', 'L', 'Losses'),
	n('era', 'ERA', 'Earned run average', { sortKey: high('era'), defaultDir: 1, fmt: era }),
	n('g', 'G', 'Games'), n('gs', 'GS', 'Games started'), n('sv', 'SV', 'Saves'),
	n('ip', 'IP', 'Innings pitched', { sortKey: 'ipouts' }),
	n('h', 'H', 'Hits allowed'), n('r', 'R', 'Runs allowed'), n('er', 'ER', 'Earned runs'),
	n('hr', 'HR', 'Home runs allowed'), n('bb', 'BB', 'Walks'), n('k', 'SO', 'Strikeouts'),
	n('whip', 'WHIP', 'Walks plus hits per inning', { sortKey: high('whip'), defaultDir: 1, fmt: two }),
	n('k9', 'K/9', 'Strikeouts per nine innings', { sortKey: low('k9'), fmt: two }),
];

const POS_ORDER = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
export const FIELDING_COLUMNS = [
	{ key: 'pos', label: 'Pos', title: 'Position', defaultDir: 1, sortKey: (r) => POS_ORDER.indexOf(r.pos) },
	n('g', 'G', 'Games at this position'), n('gs', 'GS', 'Games started'),
	n('po', 'PO', 'Putouts'), n('a', 'A', 'Assists'), n('e', 'E', 'Errors'),
	n('dp', 'DP', 'Double plays'),
	n('fpct', 'FPCT', 'Fielding percentage', { sortKey: low('fpct'), fmt: rate }),
];

/** The Player column: the name links to that player's page. */
export const PLAYER_COLUMN = {
	key: 'name', label: 'Player', title: 'Player', defaultDir: 1,
	html: (r) => `<a href="/player/${esc(r.id)}">${esc(r.name)}</a>`,
};

/** One table cell: a column's own html, else its formatter, escaped. */
export function cellHtml(c, r) {
	const inner = c.html ? c.html(r) : esc(c.fmt ? c.fmt(r[c.key]) : (r[c.key] ?? ''));
	return `<td${c.num ? ' class="h2h-num"' : ''}>${inner}</td>`;
}
