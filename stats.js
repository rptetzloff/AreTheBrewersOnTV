// Stats page: batting, pitching and fielding for every Brewer in one season,
// from /api/stats/<season> (built on the server from the box score indices —
// the per-player files are far too large to ship to the browser). The season
// is the path, /stats/1982; the tab is the hash, #pitching.
import { esc, formatEra } from './records-core.js';
import { labeledShareButtonsHtml, wireShareRow, wireShareDropdown } from './share-core.js';
import { sortableHeadHtml, sortRows, wireSortable } from './sortable.js';

const wrap = document.getElementById('stats-table-wrap');

// .331, 1.031 — rate stats are written without the leading zero, as a box
// score writes them. Null means no denominator (no at-bats, no innings), and
// shows as a dash rather than .000.
const rate = (v) => (v === null || v === undefined ? '—' : v.toFixed(3).replace(/^0/, ''));
const era = (v) => (v === null || v === undefined ? '—' : formatEra(v));
const two = (v) => (v === null || v === undefined ? '—' : v.toFixed(2));
// Where a null lands when sorting: at the bottom in the column's first-click
// direction (best first). `low` is for stats where higher is better (AVG),
// `high` for lower-is-better (ERA). Reversing the sort brings them to the top.
const low = (k) => (r) => r[k] ?? -1;
const high = (k) => (r) => r[k] ?? Infinity;

const n = (key, label, title, extra = {}) => ({ key, label, title, num: true, defaultDir: -1, ...extra });
const PLAYER = { key: 'name', label: 'Player', title: 'Player', defaultDir: 1 };

const TABS = {
	batting: {
		sort: { key: 'pa', dir: -1 },
		columns: [
			PLAYER,
			n('g', 'G', 'Games'), n('pa', 'PA', 'Plate appearances'), n('ab', 'AB', 'At-bats'),
			n('r', 'R', 'Runs'), n('h', 'H', 'Hits'), n('d', '2B', 'Doubles'), n('t', '3B', 'Triples'),
			n('hr', 'HR', 'Home runs'), n('rbi', 'RBI', 'Runs batted in'), n('bb', 'BB', 'Walks'),
			n('k', 'SO', 'Strikeouts'), n('sb', 'SB', 'Stolen bases'), n('cs', 'CS', 'Caught stealing'),
			n('avg', 'AVG', 'Batting average', { sortKey: low('avg'), fmt: rate }),
			n('obp', 'OBP', 'On-base percentage', { sortKey: low('obp'), fmt: rate }),
			n('slg', 'SLG', 'Slugging percentage', { sortKey: low('slg'), fmt: rate }),
			n('ops', 'OPS', 'On-base plus slugging', { sortKey: low('ops'), fmt: rate }),
		],
	},
	pitching: {
		sort: { key: 'ip', dir: -1 },
		columns: [
			PLAYER,
			n('w', 'W', 'Wins'), n('l', 'L', 'Losses'),
			n('era', 'ERA', 'Earned run average', { sortKey: high('era'), defaultDir: 1, fmt: era }),
			n('g', 'G', 'Games'), n('gs', 'GS', 'Games started'), n('sv', 'SV', 'Saves'),
			n('ip', 'IP', 'Innings pitched', { sortKey: 'ipouts' }),
			n('h', 'H', 'Hits allowed'), n('r', 'R', 'Runs allowed'), n('er', 'ER', 'Earned runs'),
			n('hr', 'HR', 'Home runs allowed'), n('bb', 'BB', 'Walks'), n('k', 'SO', 'Strikeouts'),
			n('whip', 'WHIP', 'Walks plus hits per inning', { sortKey: high('whip'), defaultDir: 1, fmt: two }),
			n('k9', 'K/9', 'Strikeouts per nine innings', { sortKey: low('k9'), fmt: two }),
		],
	},
	fielding: {
		sort: { key: 'g', dir: -1 },
		columns: [
			PLAYER,
			{ key: 'pos', label: 'Pos', title: 'Position', defaultDir: 1,
				sortKey: (r) => ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'].indexOf(r.pos) },
			n('g', 'G', 'Games at this position'), n('gs', 'GS', 'Games started'),
			n('po', 'PO', 'Putouts'), n('a', 'A', 'Assists'), n('e', 'E', 'Errors'),
			n('dp', 'DP', 'Double plays'),
			n('fpct', 'FPCT', 'Fielding percentage', { sortKey: low('fpct'), fmt: rate }),
		],
	},
};

const pathSeason = () => {
	const m = window.location.pathname.match(/^\/stats\/(\d{4})/);
	return m ? parseInt(m[1], 10) : null;
};
const hashTab = () => {
	const t = window.location.hash.slice(1);
	return TABS[t] ? t : 'batting';
};

let data = null;
let tab = hashTab();

function renderTable() {
	const spec = TABS[tab];
	const rows = sortRows(data[tab], spec.columns, spec.sort);
	const head = sortableHeadHtml(spec.columns, spec.sort);
	const body = rows.map((r) => `<tr>${spec.columns.map((c) => {
		const v = c.fmt ? c.fmt(r[c.key]) : r[c.key];
		return `<td${c.num ? ' class="h2h-num"' : ''}>${esc(v ?? '')}</td>`;
	}).join('')}</tr>`).join('');
	wrap.innerHTML = rows.length
		? `<table class="h2h-table stats-table sortable-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
		: '<p class="record-empty">Nothing recorded.</p>';
	const table = wrap.querySelector('table');
	if (table) wireSortable(table, spec.columns, spec.sort, renderTable);
	document.querySelectorAll('.stats-tabs .standings-tab').forEach((b) => {
		const on = b.dataset.tab === tab;
		b.classList.toggle('standings-tab-active', on);
		b.setAttribute('aria-selected', String(on));
	});
}

function renderSeasonNav() {
	const { season, seasons } = data;
	const select = document.getElementById('stats-season');
	select.innerHTML = [...seasons].reverse().map((y) => `<option value="${y}"${y === season ? ' selected' : ''}>${y}</option>`).join('');
	select.onchange = () => { window.location.href = `/stats/${select.value}${window.location.hash}`; };
	const i = seasons.indexOf(season);
	for (const [id, to] of [['stats-prev', seasons[i - 1]], ['stats-next', seasons[i + 1]]]) {
		const a = document.getElementById(id);
		if (to) { a.href = `/stats/${to}${window.location.hash}`; a.removeAttribute('aria-disabled'); }
		else { a.removeAttribute('href'); a.setAttribute('aria-disabled', 'true'); }
	}
}

async function init() {
	try {
		// The server redirects /stats to the newest season, so there is always one.
		const season = pathSeason();
		const res = await fetch(`/api/stats/${season}`);
		if (!res.ok) throw new Error(`stats ${res.status}`);
		data = await res.json();
		document.title = `${season} Milwaukee Brewers Stats`;
		document.getElementById('stats-subtitle').innerHTML =
			`<a href="/${season}">${season} Milwaukee Brewers</a> · ${data.batting.length} batters · ${data.pitching.length} pitchers`;
		renderSeasonNav();
		document.querySelectorAll('.stats-tabs .standings-tab').forEach((b) => {
			b.addEventListener('click', () => {
				tab = b.dataset.tab;
				window.history.replaceState(null, '', `#${tab}`);
				renderSeasonNav();
				renderTable();
			});
		});
		renderTable();

		const share = document.getElementById('stats-share');
		share.innerHTML = labeledShareButtonsHtml('footer-share-item');
		wireShareRow(share, `${season} Milwaukee Brewers stats: batting, pitching and fielding.`, `${window.location.origin}/stats/${season}`);
		wireShareDropdown();
	} catch (e) {
		wrap.innerHTML = '<p class="record-empty">Could not load the stats. Try again later.</p>';
		console.error(e);
	}
}

init();
