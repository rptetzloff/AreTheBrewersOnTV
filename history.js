// Franchise history page: one point per season since 1969, rendered from the
// shared chart builder (history-chart.js) over the shared season computation
// (records-core.js). Multiple metrics can be plotted at once, playoffs can be
// folded in, manager-era strips carry each manager's record, hover shows a
// season's numbers, and clicking a season opens its page.
import { parseGameinfoCsv, computeSeasonHistory, historyCopy } from './records-core.js';
import { parseBiofile, parseTeamstatsMgr, parseManagersCsv, computeCoachesFromData } from './coaches-core.js';
import { buildChartSvg, METRICS } from './history-chart.js';
import { shareButtonsHtml, wireShareRow } from './share-core.js';

const chartEl = document.getElementById('history-chart');
const tooltip = document.getElementById('history-tooltip');

const pct = (p) => (p >= 1 ? '1.000' : p.toFixed(3).replace(/^0/, ''));

function seasonLabel(s) {
	const notes = [];
	if (s.worldseries) notes.push('World Series champions');
	else if (s.champion) notes.push('MLB champions');
	if (s.undefeated) notes.push('perfect season');
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

function render(history, coaches, metrics) {
	const eras = coaches.map((c) => ({
		label: bandLabel(c.name), from: c.firstSeason, to: c.lastSeason, key: c.slug,
	}));
	chartEl.innerHTML = buildChartSvg(history, {
		metrics, axes: true, eras, hitAreas: true, emoji: true,
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
}

async function init() {
	try {
		const [gamesRes, namesRes, teamstatsRes, biofileRes, managersRes] = await Promise.all([
			fetch('/data/gameinfo.csv'),
			fetch('/data/CurrentNames.csv'),
			fetch('/data/teamstats.csv'),
			fetch('/data/biofile0.csv'),
			fetch('/data/managers.csv'),
		]);
		if (!gamesRes.ok || !namesRes.ok || !teamstatsRes.ok || !biofileRes.ok || !managersRes.ok) throw new Error('CSV fetch failed');
		const teamstatsText = await teamstatsRes.text();
		const rows = parseGameinfoCsv(await gamesRes.text(), await namesRes.text(), teamstatsText);
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
			render(histories[playoffsBox.checked ? 'playoffs' : 'regular'], officialCoaches, metrics);
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
		share.innerHTML = shareButtonsHtml('share-btn record-share-btn');
		wireShareRow(share, historyCopy(histories.regular).desc, `${window.location.origin}/history`);
	} catch (e) {
		chartEl.innerHTML = '<p class="record-empty">Could not load the game data. Try again later.</p>';
		console.error(e);
	}
}

init();
