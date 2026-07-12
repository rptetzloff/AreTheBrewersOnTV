// Franchise history page: one point per season since 1921, rendered from the
// shared chart builder (history-chart.js) over the shared season computation
// (records-core.js). Hover shows the record; click opens that season's page.
import { parseGamesCsv, computeSeasonHistory, historyCopy } from './records-core.js';
import { buildChartSvg, ERAS } from './history-chart.js';
import { shareButtonsHtml, wireShareRow } from './share-core.js';

const chartEl = document.getElementById('history-chart');
const tooltip = document.getElementById('history-tooltip');

function seasonLabel(s) {
	const notes = [];
	if (s.superbowl) notes.push('Super Bowl champions');
	else if (s.champion) notes.push('NFL champions');
	if (s.undefeated) notes.push('perfect season');
	return `${s.season} · ${s.record}${notes.length ? ` · ${notes.join(', ')}` : ''}`;
}

function render(history, metric) {
	chartEl.innerHTML = buildChartSvg(history, {
		metric,
		axes: true,
		eras: ERAS,
		hitAreas: true,
		emoji: true,
	});
	const bySeason = new Map(history.map((s) => [s.season, s]));

	chartEl.querySelectorAll('[data-season]').forEach((hit) => {
		const s = bySeason.get(parseInt(hit.dataset.season, 10));
		hit.addEventListener('mouseenter', () => {
			tooltip.textContent = seasonLabel(s);
			tooltip.hidden = false;
		});
		hit.addEventListener('mousemove', (e) => {
			const box = chartEl.getBoundingClientRect();
			tooltip.style.left = `${Math.min(e.clientX - box.left + 12, box.width - tooltip.offsetWidth - 4)}px`;
			tooltip.style.top = `${e.clientY - box.top - 34}px`;
		});
		hit.addEventListener('mouseleave', () => { tooltip.hidden = true; });
		hit.addEventListener('click', () => { window.location.href = `/${s.season}`; });
	});
}

async function init() {
	try {
		const res = await fetch('/data/packers_games.csv');
		if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
		const history = computeSeasonHistory(parseGamesCsv(await res.text()));
		const titles = history.filter((s) => s.champion).length;
		document.getElementById('history-subtitle').textContent =
			`Green Bay Packers · ${history[0].season}–${history[history.length - 1].season} · ${titles} championships`;

		// Metric choice persists like the site's other settings.
		let metric = localStorage.getItem('historyMetric') === 'wins' ? 'wins' : 'winPct';
		const btns = {
			winPct: document.getElementById('metric-winpct'),
			wins: document.getElementById('metric-wins'),
		};
		const apply = () => {
			for (const [key, btn] of Object.entries(btns)) {
				btn.classList.toggle('history-toggle-active', key === metric);
				btn.setAttribute('aria-pressed', String(key === metric));
			}
			render(history, metric);
		};
		for (const [key, btn] of Object.entries(btns)) {
			btn.addEventListener('click', () => {
				metric = key;
				localStorage.setItem('historyMetric', metric);
				apply();
			});
		}
		apply();

		const share = document.getElementById('history-share');
		share.innerHTML = shareButtonsHtml('share-btn record-share-btn');
		wireShareRow(share, historyCopy(history).desc, `${window.location.origin}/history`);
	} catch (e) {
		chartEl.innerHTML = '<p class="record-empty">Could not load the game data. Try again later.</p>';
		console.error(e);
	}
}

init();
