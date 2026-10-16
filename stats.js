// Stats page: batting, pitching and fielding for every Brewer in one season,
// from /api/stats/<season> (built on the server from the box score indices —
// the per-player files are far too large to ship to the browser). The season
// is the path, /stats/1982; the tab is the hash, #pitching.
import { esc, formatEra } from './records-core.js';
import { labeledShareButtonsHtml, wireShareRow, wireShareDropdown } from './share-core.js';
import { sortableHeadHtml, sortRows, wireSortable } from './sortable.js';
import { rate, BATTING_COLUMNS, PITCHING_COLUMNS, FIELDING_COLUMNS, FIELDING_TOTAL_COLUMNS, PLAYER_COLUMN, cellHtml } from './stats-columns.js';
import { mountPlayerSearch } from './player-search.js';

mountPlayerSearch(document.getElementById('player-search'));

const wrap = document.getElementById('stats-table-wrap');

const TABS = {
	batting: { sort: { key: 'pa', dir: -1 }, columns: [PLAYER_COLUMN, ...BATTING_COLUMNS] },
	pitching: { sort: { key: 'ip', dir: -1 }, columns: [PLAYER_COLUMN, ...PITCHING_COLUMNS] },
	fielding: { sort: { key: 'g', dir: -1 }, columns: [PLAYER_COLUMN, ...FIELDING_COLUMNS] },
	// The Fielding tab's other view: one line per player across positions.
	fieldingTotals: { sort: { key: 'g', dir: -1 }, columns: [PLAYER_COLUMN, ...FIELDING_TOTAL_COLUMNS] },
	// The team's record split by where, when, how close and the opposing
	// starter's hand: grouped rows in a fixed order, not a sortable table.
	team: { splits: true },
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

// "95–67", a tie added only when there was one; a winning percentage as a
// box score writes it; a run differential with its sign.
const winLoss = (s) => (s.t ? `${s.w}–${s.l}–${s.t}` : `${s.w}–${s.l}`);
const winPct = (s) => ((s.w + s.t / 2) / s.g).toFixed(3).replace(/^0/, '');
const diff = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

// `span` is for many seasons at once (/stats/splits): run totals there reach
// five digits, and on a phone the RS and RA columns step aside so the
// differential still fits.
function splitsHtml(splits, { span = false } = {}) {
	let group = null;
	const body = splits.map((s) => {
		// Each group gets a heading row; Overall is its own heading.
		const head = s.group !== group && s.group !== 'Overall'
			? `<tr class="splits-group"><th colspan="7" scope="colgroup">${esc(s.group)}</th></tr>` : '';
		group = s.group;
		const num = (v, cls = '') => `<td class="h2h-num${cls}">${v}</td>`;
		return `${head}<tr${s.group === 'Overall' ? ' class="splits-overall"' : ''}>
			<td>${esc(s.label)}</td>
			${num(s.g)}${num(winLoss(s))}${num(winPct(s))}${num(s.rs, ' splits-runs')}${num(s.ra, ' splits-runs')}${num(diff(s.rs - s.ra))}
		</tr>`;
	}).join('');
	return `<table class="h2h-table stats-table splits-table${span ? ' splits-span-table' : ''}"><thead><tr>
		<th scope="col">Split</th><th scope="col" class="h2h-num" title="Games">G</th><th scope="col" class="h2h-num">W–L</th>
		<th scope="col" class="h2h-num" title="Winning percentage">Pct</th><th scope="col" class="h2h-num splits-runs" title="Runs scored">RS</th>
		<th scope="col" class="h2h-num splits-runs" title="Runs allowed">RA</th><th scope="col" class="h2h-num" title="Run differential">Diff</th>
	</tr></thead><tbody>${body}</tbody></table>`;
}

function renderTable() {
	const spec = TABS[tab];
	document.querySelector('#stats-legend .history-legend-item').textContent = spec.splits
		? 'Regular season, including tiebreaker games · extra innings are games past their scheduled length (seven for the 2020–21 doubleheaders) · opposing starter by throwing hand'
		: 'Regular season, including tiebreaker games, which MLB counts as regular season · click a column to sort';
	if (spec.splits) {
		wrap.innerHTML = data.splits?.length ? splitsHtml(data.splits) : '<p class="record-empty">Nothing recorded.</p>';
	} else {
		const rows = sortRows(data[tab], spec.columns, spec.sort);
		const head = sortableHeadHtml(spec.columns, spec.sort);
		const body = rows.map((r) => `<tr>${spec.columns.map((c) => cellHtml(c, r)).join('')}</tr>`).join('');
		wrap.innerHTML = rows.length
			? `<table class="h2h-table stats-table sortable-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
			: '<p class="record-empty">Nothing recorded.</p>';
		const table = wrap.querySelector('table');
		if (table) wireSortable(table, spec.columns, spec.sort, renderTable);
	}
	const fielding = tab.startsWith('fielding');
	markTabs('#season-view', fielding ? 'fielding' : tab);
	const toggle = document.getElementById('fielding-view');
	toggle.hidden = !fielding;
	toggle.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === tab)));
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
	// Navigate from known values only: a season from the server's list and
	// the tab, which hashTab() has already checked against TABS. These read
	// select.value and location.hash directly, which CodeQL flagged as page
	// text reused in a URL — harmless behind the /stats/ prefix, but there
	// is no reason to pass either through unchecked.
	select.onchange = () => {
		const to = seasons.find((y) => String(y) === select.value);
		if (to) window.location.href = `/stats/${to}#${tab}`;
	};
	const i = seasons.indexOf(season);
	for (const [id, to] of [['stats-prev', seasons[i - 1]], ['stats-next', seasons[i + 1]]]) {
		const a = document.getElementById(id);
		if (to) { a.href = `/stats/${to}#${tab}`; a.removeAttribute('aria-disabled'); }
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
	for (const v of ['season-view', 'leaders-view', 'splits-view']) document.getElementById(v).hidden = v !== id;
	document.getElementById('stats-legend').innerHTML = `<span class="history-legend-item">${legend}</span>`;
}

// The stats stop at the last season Retrosheet has published, and the page
// used to just stop there, with no word on why this year was missing. Player
// stats wait for Retrosheet by decision, not for lack of a source.
function noteWaitingSeason(lastSeason) {
	const year = new Date().getFullYear();
	if (year <= lastSeason) return;
	const note = document.createElement('span');
	note.className = 'history-legend-item stats-waiting';
	note.textContent = `${year} stats arrive when Retrosheet publishes the season, usually over the winter`;
	document.getElementById('stats-legend').appendChild(note);
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
	noteWaitingSeason(data.seasons[data.seasons.length - 1]);
	renderSeasonNav();
	const pick = (next) => {
		tab = next;
		window.history.replaceState(null, '', `#${tab}`);
		renderSeasonNav();
		renderTable();
	};
	document.querySelectorAll('#season-view .standings-tab').forEach((b) => b.addEventListener('click', () => pick(b.dataset.tab)));
	document.querySelectorAll('#fielding-view button').forEach((b) => b.addEventListener('click', () => pick(b.dataset.view)));
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
		<span class="record-entry-sub"><a href="/player/${esc(l.id)}">${esc(l.name)}</a></span>
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
	noteWaitingSeason(last);
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

// --- Team splits across seasons ---

// /stats/splits: the Team tab's splits over every season, or a decade
// (#1980s). The span list comes with the data, from the server.
async function initSplits() {
	document.getElementById('view-splits').setAttribute('aria-current', 'page');
	document.querySelector('.records-title').textContent = 'Team Splits';
	setView('splits-view', 'Regular season, including tiebreaker games · extra innings are games past their scheduled length (seven for the 2020–21 doubleheaders) · opposing starter by throwing hand');
	const wrapEl = document.getElementById('splits-table-wrap');
	const select = document.getElementById('splits-span');
	const spanFromHash = () => window.location.hash.slice(1) || 'all';
	let shown = null;

	async function load(spanId) {
		wrapEl.innerHTML = '<div class="loading">Loading splits...</div>';
		const res = await fetch(`/api/stats/splits/${encodeURIComponent(spanId)}`);
		// An unknown span in the hash falls back to every season.
		const d = res.ok ? await res.json() : spanId !== 'all' ? await (await fetch('/api/stats/splits/all')).json() : null;
		if (!d || !d.splits) throw new Error('splits');
		shown = d.span.id;
		const all = d.spans[0];
		select.innerHTML = d.spans.map((s) => `<option value="${esc(s.id)}"${s.id === shown ? ' selected' : ''}>${esc(s.label)}</option>`).join('');
		document.getElementById('view-season').href = `/stats/${all.last}`;
		document.title = `Milwaukee Brewers Team Splits, ${d.span.first}–${d.span.last}`;
		document.getElementById('stats-subtitle').textContent =
			`Milwaukee Brewers · ${d.span.first}–${d.span.last} · ${d.seasons} season${d.seasons === 1 ? '' : 's'} · regular season`;
		wrapEl.innerHTML = splitsHtml(d.splits, { span: true });
		share(`Milwaukee Brewers team splits, ${d.span.first}–${d.span.last}: home and away, day and night, by month, one-run games and more.`,
			`${window.location.origin}/stats/splits${shown === 'all' ? '' : `#${shown}`}`);
		noteWaitingSeason(all.last);
	}

	// Navigate from the server's own span list only.
	select.addEventListener('change', () => {
		const to = [...select.options].find((o) => o.value === select.value)?.value;
		if (!to || to === shown) return;
		window.history.replaceState(null, '', to === 'all' ? '/stats/splits' : `#${to}`);
		load(to).catch((e) => { wrapEl.innerHTML = '<p class="record-empty">Could not load the splits. Try again later.</p>'; console.error(e); });
	});
	await load(spanFromHash());
}

async function init() {
	try {
		const path = window.location.pathname;
		if (path.startsWith('/stats/career')) return await initLeaders('career');
		if (path.startsWith('/stats/single-season')) return await initLeaders('single');
		if (path.startsWith('/stats/splits')) return await initSplits();
		// The server redirects /stats to the newest season, so there is always one.
		return await initSeason(pathSeason());
	} catch (e) {
		for (const id of ['stats-table-wrap', 'leaders-grid', 'splits-table-wrap']) {
			document.getElementById(id).innerHTML = '<p class="record-empty">Could not load the stats. Try again later.</p>';
		}
		document.getElementById('season-view').hidden = false;
		console.error(e);
	}
}

init();
