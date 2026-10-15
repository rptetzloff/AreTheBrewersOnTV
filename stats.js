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
	markTabs('#season-view', tab);
}

function markTabs(view, active) {
	document.querySelectorAll(`${view} .standings-tab`).forEach((b) => {
		const on = b.dataset.tab === active;
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

function share(text, url) {
	const el = document.getElementById('stats-share');
	el.innerHTML = labeledShareButtonsHtml('footer-share-item');
	wireShareRow(el, text, url);
	wireShareDropdown();
}

function setView(id, legend) {
	for (const v of ['season-view', 'leaders-view']) document.getElementById(v).hidden = v !== id;
	document.getElementById('stats-legend').innerHTML = `<span class="history-legend-item">${legend}</span>`;
}

async function initSeason(season) {
	setView('season-view', 'Regular season, including tiebreaker games, which MLB counts as regular season · click a column to sort');
	document.getElementById('view-season').setAttribute('aria-current', 'page');
	const res = await fetch(`/api/stats/${season}`);
	if (!res.ok) throw new Error(`stats ${res.status}`);
	data = await res.json();
	document.title = `${season} Milwaukee Brewers Stats`;
	document.getElementById('stats-subtitle').innerHTML =
		`<a href="/${season}">${season} Milwaukee Brewers</a> · ${data.batting.length} batters · ${data.pitching.length} pitchers`;
	document.getElementById('view-season').href = `/stats/${season}`;
	renderSeasonNav();
	document.querySelectorAll('#season-view .standings-tab').forEach((b) => {
		b.addEventListener('click', () => {
			tab = b.dataset.tab;
			window.history.replaceState(null, '', `#${tab}`);
			renderSeasonNav();
			renderTable();
		});
	});
	renderTable();
	share(`${season} Milwaukee Brewers stats: batting, pitching and fielding.`, `${window.location.origin}/stats/${season}`);
}

// --- Leaders ---

const commas = (v) => v.toLocaleString('en-US');
// How a board's value reads: rates as a box score writes them, innings in
// thirds, counts with commas.
function leaderValue(board, l) {
	if (board.key === 'era') return formatEra(l.value);
	if (board.key === 'whip' || board.key === 'k9') return l.value.toFixed(2);
	if (board.rate) return rate(l.value);
	if (board.key === 'ipouts') return l.ip;
	return commas(l.value);
}

function boardHtml(board, view, side) {
	const when = (l) => (view === 'single' ? String(l.season) : l.first === l.last ? String(l.first) : `${l.first}–${l.last}`);
	const time = (l) => (board.rate ? (side === 'batting' ? ` · ${commas(l.pa)} PA` : ` · ${l.ip} IP`) : '');
	const items = board.leaders.map((l, i) => `<li class="record-entry${i === 0 ? ' record-entry-top' : ''}">
		<span class="record-entry-main">${esc(leaderValue(board, l))}</span>
		<span class="record-entry-sub">${esc(l.name)}</span>
		<span class="record-entry-detail">${esc(when(l) + time(l))}</span>
	</li>`).join('');
	return `<section class="record-card">
		<h2 class="record-card-title">${esc(board.label)}</h2>
		${board.leaders.length ? `<ol class="record-list">${items}</ol>` : '<p class="record-empty">Nobody qualifies.</p>'}
	</section>`;
}

async function initLeaders(view) {
	const single = view === 'single';
	document.getElementById(single ? 'view-single' : 'view-career').setAttribute('aria-current', 'page');
	const res = await fetch('/api/stats/leaders');
	if (!res.ok) throw new Error(`leaders ${res.status}`);
	const L = await res.json();
	const { first, last } = L.range;
	document.getElementById('view-season').href = `/stats/${last}`;
	const title = single ? 'Single-Season Leaders' : 'Career Leaders';
	document.title = `Milwaukee Brewers ${title}`;
	document.querySelector('.records-title').textContent = title;
	document.getElementById('stats-subtitle').textContent = `Milwaukee Brewers · ${first}–${last} · regular season`;
	setView('leaders-view', single
		? 'Rate stats qualify by MLB’s title rules: 3.1 plate appearances or one inning per team game'
		: `Rate stats need ${commas(L.qualifiers.careerPa)} plate appearances or ${commas(L.qualifiers.careerIp)} innings as a Brewer · totals count only Brewers seasons`);
	const boards = L[single ? 'single' : 'career'];
	const render = (side) => {
		markTabs('#leaders-view', side);
		document.getElementById('leaders-grid').innerHTML = boards[side].map((b) => boardHtml(b, single ? 'single' : 'career', side)).join('');
	};
	let side = window.location.hash.slice(1) === 'pitching' ? 'pitching' : 'batting';
	document.querySelectorAll('#leaders-view .standings-tab').forEach((b) => {
		b.addEventListener('click', () => {
			side = b.dataset.tab;
			window.history.replaceState(null, '', `#${side}`);
			render(side);
		});
	});
	render(side);
	share(`Milwaukee Brewers ${title.toLowerCase()}, ${first}–${last}.`, `${window.location.origin}/stats/${single ? 'single-season' : 'career'}`);
}

async function init() {
	try {
		const path = window.location.pathname;
		if (path.startsWith('/stats/career')) return await initLeaders('career');
		if (path.startsWith('/stats/single-season')) return await initLeaders('single');
		// The server redirects /stats to the newest season, so there is always one.
		return await initSeason(pathSeason());
	} catch (e) {
		for (const id of ['stats-table-wrap', 'leaders-grid']) {
			document.getElementById(id).innerHTML = '<p class="record-empty">Could not load the stats. Try again later.</p>';
		}
		document.getElementById('season-view').hidden = false;
		console.error(e);
	}
}

init();
