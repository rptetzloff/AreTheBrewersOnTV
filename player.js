// Player page: one Brewer's seasons, batting, pitching and fielding, each
// with a career line, from /api/player/<id>. Brewers seasons only — a player
// who also played elsewhere shows his Milwaukee years, which is what this
// site is about and all the data here covers.
import { esc } from './records-core.js';
import { labeledShareButtonsHtml, wireShareRow, wireShareDropdown } from './share-core.js';
import { BATTING_COLUMNS, PITCHING_COLUMNS, FIELDING_COLUMNS, cellHtml, rate, era } from './stats-columns.js';
import { mountPlayerSearch } from './player-search.js';

mountPlayerSearch(document.getElementById('player-search'));

const tables = document.getElementById('player-tables');
const id = (window.location.pathname.match(/^\/player\/([^/]+)/) || [])[1] || '';

const SEASON_COLUMN = (tab) => ({ key: 'season', label: 'Year', html: (r) => `<a href="/stats/${r.season}#${tab}">${r.season}</a>` });
const CAREER_LABEL = { key: 'season', label: 'Year', html: () => 'Career' };

function tableHtml(title, columns, rows, careerRow) {
	const head = columns.map((c) => `<th${c.num ? ' class="h2h-num"' : ''}${c.title ? ` title="${esc(c.title)}"` : ''}>${esc(c.label)}</th>`).join('');
	const body = rows.map((r) => `<tr${r._class ? ` class="${r._class}"` : ''}>${columns.map((c) => cellHtml(c, r)).join('')}</tr>`).join('');
	const foot = careerRow
		? `<tfoot><tr class="player-career">${[CAREER_LABEL, ...columns.slice(1)].map((c) => cellHtml(c, careerRow)).join('')}</tr></tfoot>`
		: '';
	return `<section class="player-section">
		<h2 class="player-section-title">${esc(title)}</h2>
		<div class="h2h-table-wrap stats-table-wrap">
			<table class="h2h-table stats-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table>
		</div>
	</section>`;
}

// A season row's games link to that season's game log; the career row's
// do not, having no one season to show.
const gamesLinked = (columns, side) => columns.map((c) => (c.key === 'g'
	? { ...c, html: (r) => (typeof r.season === 'number' ? `<a href="#log-${r.season}-${side}" title="${r.season} game log">${r.g}</a>` : String(r.g)) }
	: c));

// --- Game log ---

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const num = (key, label, title, fmt = (v) => String(v)) => ({ label, title, num: true, cell: (r) => fmt(r.line ? r.line[key] ?? r[key] : r[key]) });
const LOG_GAME = [
	// The date links to the box score; a doubleheader's games are (1) and (2).
	{ label: 'Date', cell: (r) => {
		const [, m, d] = r.date.split('-').map(Number);
		return `<a href="/game/${esc(r.gid)}">${SHORT_MONTHS[m - 1]} ${d}${r.doubleheader ? ` (${r.doubleheader})` : ''}</a>`;
	}, html: true },
	{ label: 'Opp', title: 'Opponent', cell: (r) => opp(r), html: true, only: 'wide' },
	{ label: 'Result', cell: (r) => result(r), html: true, only: 'wide' },
	// On a phone the two share a cell, one over the other, so the stats
	// start on screen rather than past three columns of who and how.
	{ label: 'Game', cell: (r) => `${opp(r)}<br>${result(r)}`, html: true, only: 'narrow' },
];
function opp(r) { return `<span title="${esc(r.opponent)}">${r.home ? 'vs' : '@'} ${esc(r.nick)}</span>`; }
function result(r) { return `<span class="log-result log-result-${r.result}">${r.result} ${r.pf}–${r.pa}</span>`; }
const LOG_COLUMNS = {
	batting: [...LOG_GAME,
		{ label: 'Pos', title: 'Position(s) played', cell: (r) => esc(r.pos) },
		num('pa', 'PA', 'Plate appearances'), num('ab', 'AB', 'At-bats'), num('r', 'R', 'Runs'), num('h', 'H', 'Hits'),
		num('d', '2B', 'Doubles'), num('t', '3B', 'Triples'), num('hr', 'HR', 'Home runs'), num('rbi', 'RBI', 'Runs batted in'),
		num('bb', 'BB', 'Walks'), num('k', 'SO', 'Strikeouts'), num('sb', 'SB', 'Stolen bases'),
		num('avg', 'AVG', 'Batting average, season to date', rate), num('obp', 'OBP', 'On-base percentage, season to date', rate),
		num('slg', 'SLG', 'Slugging percentage, season to date', rate),
	],
	pitching: [...LOG_GAME,
		{ label: 'App', title: 'Started (GS) or relieved', cell: (r) => (r.gs ? 'GS' : 'Rel'), only: 'wide' },
		{ label: 'Dec', title: 'Decision: win, loss or save', cell: (r) => r.dec, only: 'wide' },
		{ label: 'Dec', title: 'Started (GS) or relieved, and the decision', cell: (r) => `${r.gs ? 'GS' : 'Rel'}<br>${r.dec}`, html: true, only: 'narrow' },
		num('ip', 'IP', 'Innings pitched'), num('h', 'H', 'Hits'), num('r', 'R', 'Runs'), num('er', 'ER', 'Earned runs'),
		num('bb', 'BB', 'Walks'), num('k', 'SO', 'Strikeouts'), num('hr', 'HR', 'Home runs allowed'),
		num('era', 'ERA', 'Earned run average, season to date', era),
	],
};

function logTableHtml(side, rows) {
	const cols = LOG_COLUMNS[side];
	const cls = (c) => {
		const names = [c.num ? 'h2h-num' : '', c.only ? `log-${c.only}` : ''].filter(Boolean).join(' ');
		return names ? ` class="${names}"` : '';
	};
	const head = cols.map((c) => `<th${cls(c)}${c.title ? ` title="${esc(c.title)}"` : ''}>${esc(c.label)}</th>`).join('');
	const body = rows.map((r) => `<tr>${cols.map((c) => `<td${cls(c)}>${c.html ? c.cell(r) : esc(c.cell(r))}</td>`).join('')}</tr>`).join('');
	return `<table class="h2h-table stats-table log-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

const logs = new Map();
async function fetchLog(season) {
	if (!logs.has(season)) {
		logs.set(season, fetch(`/api/player/${encodeURIComponent(id)}/log/${season}`)
			.then((r) => (r.ok ? r.json() : null))
			.catch(() => null));
	}
	return logs.get(season);
}

/** "#log-2018-batting" -> { season: 2018, side: 'batting' }. */
function logHash() {
	const m = window.location.hash.match(/^#log-(\d{4})(?:-(batting|pitching))?$/);
	return m ? { season: Number(m[1]), side: m[2] || null } : null;
}

/** Wire the game log: `seasons` the player's Brewers seasons, `lead` the
 *  side his page leads with. Opens on the hash's season, else his last. */
function mountGameLog(seasons, lead) {
	const section = document.getElementById('player-log');
	const select = document.getElementById('log-season');
	const tabs = document.getElementById('log-tabs');
	const wrap = document.getElementById('log-table');
	let current = { season: seasons[seasons.length - 1], side: lead };

	select.innerHTML = [...seasons].reverse().map((y) => `<option value="${y}">${y}</option>`).join('');

	async function show({ season, side }, { scroll = false, record = false } = {}) {
		if (!seasons.includes(season)) return;
		select.value = String(season);
		wrap.innerHTML = '<div class="loading">Loading games...</div>';
		const log = await fetchLog(season);
		if (!log) {
			wrap.innerHTML = '<p class="record-empty">Could not load the game log. Try again later.</p>';
			return;
		}
		// A side he did not play that season falls back to the one he did.
		const has = (s) => log[s]?.length > 0;
		const pick = has(side) ? side : has(lead) ? lead : has('batting') ? 'batting' : 'pitching';
		current = { season, side: pick };
		tabs.hidden = !(has('batting') && has('pitching'));
		tabs.querySelectorAll('.standings-tab').forEach((b) => {
			const on = b.dataset.side === pick;
			b.classList.toggle('standings-tab-active', on);
			b.setAttribute('aria-selected', String(on));
		});
		wrap.innerHTML = logTableHtml(pick, log[pick]);
		if (record) window.history.replaceState(null, '', `#log-${season}-${pick}`);
		if (scroll) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	select.addEventListener('change', () => show({ season: Number(select.value), side: current.side }, { record: true }));
	tabs.querySelectorAll('.standings-tab').forEach((b) => b.addEventListener('click', () => show({ ...current, side: b.dataset.side }, { record: true })));
	// The games links in the season tables set the hash.
	window.addEventListener('hashchange', () => {
		const h = logHash();
		if (h) show({ season: h.season, side: h.side || current.side }, { scroll: true });
	});

	section.hidden = false;
	const start = logHash();
	show(start ? { season: start.season, side: start.side || lead } : current, { scroll: Boolean(start) });
}

const POS_ORDER = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

/** Career fielding is per position too: summed across seasons, FPCT again. */
function fieldingCareer(lines) {
	const by = new Map();
	for (const l of lines) {
		const c = by.get(l.pos) || { season: 'Career', pos: l.pos, g: 0, gs: 0, po: 0, a: 0, e: 0, dp: 0 };
		for (const k of ['g', 'gs', 'po', 'a', 'e', 'dp']) c[k] += l[k];
		by.set(l.pos, c);
	}
	return [...by.values()]
		.map((c) => ({ ...c, fpct: c.po + c.a + c.e > 0 ? (c.po + c.a) / (c.po + c.a + c.e) : null }))
		.sort((a, b) => POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos));
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (iso) => {
	const [y, m, d] = iso.split('-').map(Number);
	return `${MONTHS[m - 1]} ${d}, ${y}`;
};

function bioText(bio) {
	if (!bio) return '';
	const bits = [];
	if (bio.born) bits.push(`Born ${longDate(bio.born)}${bio.birthplace ? `, ${bio.birthplace}` : ''}`);
	if (bio.died) bits.push(`Died ${longDate(bio.died)}`);
	if (bio.bats || bio.throws) bits.push(`Bats ${bio.bats || '?'}, throws ${bio.throws || '?'}`);
	if (bio.height) bits.push(`${Math.floor(bio.height / 12)}-${bio.height % 12}${bio.weight ? `, ${bio.weight} lb` : ''}`);
	if (bio.debut) bits.push(`MLB debut ${longDate(bio.debut)}`);
	return bits.join(' · ');
}

async function init() {
	try {
		const res = await fetch(`/api/player/${encodeURIComponent(id)}`);
		if (res.status === 404) {
			tables.innerHTML = '<p class="record-empty">No Brewers stats for this player.</p>';
			return;
		}
		if (!res.ok) throw new Error(`player ${res.status}`);
		const p = await res.json();
		const span = p.first === p.last ? `${p.first}` : `${p.first}–${p.last}`;
		document.title = `${p.name} — Milwaukee Brewers Stats`;
		document.getElementById('player-name').textContent = p.name;
		document.getElementById('player-subtitle').innerHTML =
			`Milwaukee Brewers · ${span} · ${p.seasons} season${p.seasons === 1 ? '' : 's'}${p.bio?.hof ? ' · <span class="player-hof">Hall of Fame</span>' : ''}`;
		document.getElementById('player-bio').textContent = bioText(p.bio);
		// Opens the compare page with him in the first column, as his career.
		const compare = document.getElementById('player-compare');
		compare.href = `/compare?p=${encodeURIComponent(p.id)}`;
		compare.hidden = false;

		const sections = [];
		const batted = p.batting.length > 0;
		const pitched = p.pitching.length > 0;
		const bat = batted ? tableHtml('Batting', [SEASON_COLUMN('batting'), ...gamesLinked(BATTING_COLUMNS, 'batting')], p.batting, p.career.batting) : '';
		const pit = pitched ? tableHtml('Pitching', [SEASON_COLUMN('pitching'), ...gamesLinked(PITCHING_COLUMNS, 'pitching')], p.pitching, p.career.pitching) : '';
		// A pitcher's page leads with pitching: more innings than a quarter of
		// his plate appearances is a pitcher who batted, not the reverse.
		const pitcherFirst = pitched && (!batted || p.career.pitching.ipouts / 3 > p.career.batting.pa / 4);
		sections.push(...(pitcherFirst ? [pit, bat] : [bat, pit]));
		if (p.fielding.length) {
			// Each season's positions, then — when there was more than one — a
			// Total row across them; the career foot does the same with an
			// All positions row. Totals count a game once however many
			// positions he played in it, and leave DH out (the server's
			// seasonFieldingTotals).
			const totals = new Map((p.fieldingTotals || []).map((t) => [t.season, t]));
			const rows = [];
			for (const season of [...new Set(p.fielding.map((l) => l.season))].sort((a, b) => a - b)) {
				rows.push(...p.fielding.filter((l) => l.season === season).sort((a, b) => POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos)));
				const t = totals.get(season);
				if (t && t.positions > 1) rows.push({ ...t, pos: 'Total', _class: 'player-subtotal' });
			}
			const career = fieldingCareer(p.fielding);
			const all = p.career.fielding;
			if (all && all.positions > 1) career.push({ ...all, pos: 'All positions' });
			const cols = [SEASON_COLUMN('fielding'), ...FIELDING_COLUMNS];
			sections.push(tableHtml('Fielding', cols, rows, null)
				.replace('</tbody>', `</tbody><tfoot>${career.map((c) => `<tr class="player-career">${[CAREER_LABEL, ...cols.slice(1)].map((col) => cellHtml(col, c)).join('')}</tr>`).join('')}</tfoot>`));
		}
		tables.innerHTML = sections.filter(Boolean).join('');
		// Seasons he batted or pitched in: a season with fielding lines only
		// (a pinch-runner who never came to the plate) has no log to show.
		const logSeasons = [...new Set([...p.batting, ...p.pitching].map((l) => l.season))].sort((a, b) => a - b);
		if (logSeasons.length) mountGameLog(logSeasons, pitcherFirst ? 'pitching' : 'batting');

		const share = document.getElementById('player-share');
		share.innerHTML = labeledShareButtonsHtml('footer-share-item');
		wireShareRow(share, `${p.name} with the Milwaukee Brewers, ${span}, season by season.`, `${window.location.origin}/player/${p.id}`);
		wireShareDropdown();
	} catch (e) {
		tables.innerHTML = '<p class="record-empty">Could not load this player. Try again later.</p>';
		console.error(e);
	}
}

init();
