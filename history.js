// Franchise history page: one point per season since 1969, rendered from the
// shared chart builder (history-chart.js) over the shared season computation
// (records-core.js). Multiple metrics can be plotted at once, playoffs can be
// folded in, manager-era strips carry each manager's record, hover shows a
// season's numbers, and clicking a season opens its page.
import { parseGameinfoCsv, computeSeasonHistory, historyCopy, parseBallparksCsv, computeFranchiseMilestones } from './records-core.js';
import { parseBiofile, parseTeamstatsMgr, parseManagersCsv, computeCoachesFromData } from './coaches-core.js';
import { buildChartSvg, METRICS, POSTSEASON, postseasonTier } from './history-chart.js';
import { shareButtonsHtml, labeledShareButtonsHtml, wireShareRow, wireShareDropdown } from './share-core.js';

const chartEl = document.getElementById('history-chart');
const tooltip = document.getElementById('history-tooltip');
const tableWrap = document.getElementById('history-table-wrap');

const pct = (p) => (p >= 1 ? '1.000' : p.toFixed(3).replace(/^0/, ''));

function seasonLabel(s) {
	const notes = [];
	if (s.worldseries) notes.push('World Series champions');
	else if (s.champion) notes.push('MLB champions');
	const tier = postseasonTier(s);
	if (tier && tier !== 'wsWin') notes.push(POSTSEASON[tier].label);
	return `${s.season} · ${s.record} · RS ${s.pf} · RA ${s.pa}${notes.length ? ` · ${notes.join(', ')}` : ''}`;
}

function coachLabel(c) {
	const bits = [`${c.name}${c.interim ? ' (interim)' : ''} · ${c.tenure} · ${c.record} (${pct(c.winPct)})`];
	if (c.playoffRecord) bits.push(`playoffs ${c.playoffRecord}`);
	if (c.titles) bits.push(`${c.titles} title${c.titles === 1 ? '' : 's'}`);
	return bits.join(' · ');
}

// "Dave Bristol" -> "Bristol", "Phil Garner" -> "Garner"
const bandLabel = (name) => name.split('&').map((p) => p.trim().split(' ').pop()).join('/');

function showTooltip(text) {
	tooltip.textContent = text;
	tooltip.hidden = false;
}

function placeTooltip(e) {
	const box = chartEl.getBoundingClientRect();
	tooltip.style.left = `${Math.min(e.clientX - box.left + 12, box.width - tooltip.offsetWidth - 4)}px`;
	tooltip.style.top = `${e.clientY - box.top - 34}px`;
}

function render(history, coaches, metrics, milestones) {
	const eras = coaches.map((c) => ({
		label: bandLabel(c.name), from: c.fromDate, to: c.toDate, key: c.slug,
	}));
	chartEl.innerHTML = buildChartSvg(history, {
		metrics, axes: true, eras, hitAreas: true, emoji: true, milestones,
	});
	tooltip.hidden = true;
	chartEl.appendChild(tooltip);
	const bySeason = new Map(history.map((s) => [s.season, s]));
	const coachBySlug = new Map(coaches.map((c) => [c.slug, c]));

	chartEl.querySelectorAll('[data-season]').forEach((hit) => {
		const s = bySeason.get(parseInt(hit.dataset.season, 10));
		hit.addEventListener('mouseenter', () => showTooltip(seasonLabel(s)));
		hit.addEventListener('mousemove', placeTooltip);
		hit.addEventListener('mouseleave', () => { tooltip.hidden = true; });
		hit.addEventListener('click', () => { window.location.href = `/${s.season}`; });
	});
	chartEl.querySelectorAll('[data-era]').forEach((strip) => {
		const c = coachBySlug.get(strip.dataset.era);
		strip.addEventListener('mouseenter', () => showTooltip(coachLabel(c)));
		strip.addEventListener('mousemove', placeTooltip);
		strip.addEventListener('mouseleave', () => { tooltip.hidden = true; });
		strip.addEventListener('click', () => { window.location.href = '/managers.html'; });
	});
	chartEl.querySelectorAll('[data-milestone]').forEach((m) => {
		const type = m.dataset.milestoneType;
		const prefix = type === 'team' ? 'Team' : type === 'park' ? 'Ballpark' : '';
		m.addEventListener('mouseenter', () => showTooltip(prefix ? `${prefix}: ${m.dataset.milestone}` : m.dataset.milestone));
		m.addEventListener('mousemove', placeTooltip);
		m.addEventListener('mouseleave', () => { tooltip.hidden = true; });
	});
}

const TABLE_COLUMNS = [
	{ key: 'season',   label: 'Year',   title: 'Season' },
	{ key: 'record',   label: 'Record', title: 'Win-Loss-Tie' },
	{ key: 'winPct',   label: 'Pct',    title: 'Winning percentage', fmt: (v) => pct(v) },
	{ key: 'wins',     label: 'W',      title: 'Wins', num: true },
	{ key: 'losses',   label: 'L',      title: 'Losses', num: true },
	{ key: 'ties',     label: 'T',      title: 'Ties', num: true },
	{ key: 'pf',       label: 'RF',     title: 'Runs scored', num: true },
	{ key: 'pa',       label: 'RA',     title: 'Runs allowed', num: true },
	{ key: 'diff',     label: 'Diff',   title: 'Run differential (RF - RA)', num: true, fmt: (v) => (v > 0 ? `+${v}` : String(v)) },
	{ key: 'finish',   label: 'Finish', title: 'Postseason result' },
];

let tableSort = { key: 'season', dir: -1 }; // most recent first by default
let tableHistory = [];

function finishLabel(s) {
	const tier = postseasonTier(s);
	if (!tier) return s.undefeated ? 'Undefeated' : '—';
	return POSTSEASON[tier].label;
}

function renderHistoryTable() {
	const rows = tableHistory.slice().map((s) => ({ ...s, diff: s.pf - s.pa, finish: finishLabel(s) }));
	const { key, dir } = tableSort;
	const cmp = (a, b) => {
		const av = a[key], bv = b[key];
		if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
		return String(av).localeCompare(String(bv)) * dir;
	};
	if (key === 'record') {
		rows.sort((a, b) => (b.winPct - a.winPct) * dir || (b.wins - a.wins) * dir || (a.season - b.season) * -dir);
	} else if (key === 'finish') {
		const tierOf = (s) => s.champion && s.worldseries ? 5 : ({ W: 4, L: 3, D: 2, F: 1 }[s.postseason] || 0);
		rows.sort((a, b) => (tierOf(a) - tierOf(b)) * dir || (a.winPct - b.winPct) * -dir);
	} else {
		rows.sort((a, b) => cmp(a, b) || (b.season - a.season));
	}
	const head = TABLE_COLUMNS.map((c) => {
		const active = c.key === key;
		const arrow = active ? (dir > 0 ? ' ▲' : ' ▼') : '';
		return `<th data-key="${c.key}" title="${c.title}"${c.num ? ' class="h2h-num"' : ''}${active ? ` aria-sort="${dir > 0 ? 'ascending' : 'descending'}"` : ''}>${c.label}${arrow}</th>`;
	}).join('');
	const body = rows.map((s) => {
		const finishTier = postseasonTier(s);
		const glyph = finishTier ? `<span class="legend-glyph" style="color:${POSTSEASON[finishTier].color}">${POSTSEASON[finishTier].glyph}</span> ` : '';
		return `<tr data-season="${s.season}">
			<td><a href="/${s.season}">${s.season}</a></td>
			<td>${s.record}</td>
			<td class="h2h-num">${pct(s.winPct)}</td>
			<td class="h2h-num">${s.wins}</td>
			<td class="h2h-num">${s.losses}</td>
			<td class="h2h-num">${s.ties || ''}</td>
			<td class="h2h-num">${s.pf}</td>
			<td class="h2h-num">${s.pa}</td>
			<td class="h2h-num${s.diff > 0 ? ' pos' : s.diff < 0 ? ' neg' : ''}">${s.diff > 0 ? '+' : ''}${s.diff}</td>
			<td>${glyph}${s.finish}</td>
		</tr>`;
	}).join('');
	tableWrap.innerHTML = `<table class="h2h-table season-table">
		<thead><tr>${head}</tr></thead>
		<tbody>${body}</tbody>
	</table>`;
	tableWrap.querySelectorAll('th[data-key]').forEach((th) => {
		th.addEventListener('click', () => {
			const k = th.dataset.key;
			if (tableSort.key === k) tableSort.dir = -tableSort.dir;
			else { tableSort.key = k; tableSort.dir = (k === 'season') ? -1 : 1; }
			renderHistoryTable();
		});
	});
	tableWrap.querySelectorAll('tbody tr').forEach((tr) => {
		tr.addEventListener('click', (e) => {
			if (e.target.closest('a')) return;
			window.location.href = `/${tr.dataset.season}`;
		});
	});
}

async function init() {
	try {
		const [gamesRes, namesRes, teamstatsRes, biofileRes, managersRes, parksRes] = await Promise.all([
			fetch('/data/gameinfo.csv'),
			fetch('/data/CurrentNames.csv'),
			fetch('/data/teamstats.csv'),
			fetch('/data/biofile0.csv'),
			fetch('/data/managers.csv'),
			fetch('/data/ballparks.csv'),
		]);
		if (!gamesRes.ok || !namesRes.ok || !teamstatsRes.ok || !biofileRes.ok || !managersRes.ok || !parksRes.ok) throw new Error('CSV fetch failed');
		const teamstatsText = await teamstatsRes.text();
		const gameinfoText = await gamesRes.text();
		const rows = parseGameinfoCsv(gameinfoText, await namesRes.text(), teamstatsText);
		const gidToMgr = parseTeamstatsMgr(teamstatsText);
		const mgrNames = parseBiofile(await biofileRes.text());
		const histories = {
			regular: computeSeasonHistory(rows),
			playoffs: computeSeasonHistory(rows, { playoffs: true }),
		};
		const champions = histories.regular.filter((s) => s.champion).map((s) => s.season);
		const officialTenures = parseManagersCsv(await managersRes.text());
		const { coaches } = computeCoachesFromData(rows, gidToMgr, mgrNames, champions, officialTenures);
		// History timeline: official managers only — interim stints are hidden.
		const officialCoaches = coaches.filter((c) => !c.interim);
		// Franchise milestones (team identity + ballpark transitions) from
		// ballparks.csv. Filter to the Brewers' own parks so we don't draw a
		// line for every MLB stadium in the dataset.
		const allParks = parseBallparksCsv(await parksRes.text());
		const brewersParkIds = new Set(['MIL05', 'MIL06', 'SEA01']);
		const brewersParks = allParks.filter((p) => brewersParkIds.has(p.id));
		const milestones = computeFranchiseMilestones(gameinfoText, brewersParks);

		const titles = histories.regular.filter((s) => s.champion).length;
		const range = `${histories.regular[0].season}–${histories.regular[histories.regular.length - 1].season}`;
		document.getElementById('history-subtitle').textContent =
			`Milwaukee Brewers · ${range} · ${titles} championships · ${officialCoaches.length} managers`;

		let metrics;
		try { metrics = JSON.parse(localStorage.getItem('historyMetrics') || '[]'); } catch { metrics = []; }
		metrics = metrics.filter((m) => METRICS[m]);
		if (!metrics.length) metrics = ['winPct'];
		const playoffsBox = document.getElementById('history-playoffs');
		playoffsBox.checked = localStorage.getItem('historyPlayoffs') === 'true';

		const chips = [...document.querySelectorAll('#history-metrics [data-metric]')];
		const apply = () => {
			for (const chip of chips) {
				const key = chip.dataset.metric;
				const on = metrics.includes(key);
				chip.classList.toggle('history-toggle-active', on);
				chip.setAttribute('aria-pressed', String(on));
				chip.style.color = on ? METRICS[key].color : '';
			}
			render(histories[playoffsBox.checked ? 'playoffs' : 'regular'], officialCoaches, metrics, milestones);
			tableHistory = histories[playoffsBox.checked ? 'playoffs' : 'regular'];
			renderHistoryTable();
		};
		for (const chip of chips) {
			chip.addEventListener('click', () => {
				const key = chip.dataset.metric;
				metrics = metrics.includes(key) ? metrics.filter((m) => m !== key) : [...metrics, key];
				if (!metrics.length) metrics = [key];
				metrics.sort((a, b) => Object.keys(METRICS).indexOf(a) - Object.keys(METRICS).indexOf(b));
				localStorage.setItem('historyMetrics', JSON.stringify(metrics));
				apply();
			});
		}
		playoffsBox.addEventListener('change', () => {
			localStorage.setItem('historyPlayoffs', String(playoffsBox.checked));
			apply();
		});
		apply();

		const share = document.getElementById('history-share');
		share.innerHTML = labeledShareButtonsHtml('footer-share-item');
		wireShareRow(share, historyCopy(histories.regular).desc, `${window.location.origin}/history`);
		wireShareDropdown();
	} catch (e) {
		chartEl.innerHTML = '<p class="record-empty">Could not load the game data. Try again later.</p>';
		console.error(e);
	}
}

init();
