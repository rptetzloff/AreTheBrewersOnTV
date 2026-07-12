// Managers page: every Brewers manager in tenure order with their
// record, computed from the shared coaches-core.js (games assigned to
// tenures by exact dates, so mid-season changes split correctly).
import { parseGamesCsv, computeSeasonHistory, esc } from './records-core.js';
import { parseCoachesCsv, computeCoaches, coachesCopy } from './coaches-core.js';
import { shareButtonsHtml, wireShareRow } from './share-core.js';

const pct = (p) => (p >= 1 ? '1.000' : p.toFixed(3).replace(/^0/, ''));

function photoHtml(c) {
	if (!c.image) return '<span class="coach-photo coach-photo-none"><i class="mdi mdi-account"></i></span>';
	return `<a href="${esc(c.imagePage || c.image)}" target="_blank" rel="noopener noreferrer" title="Photo: Wikimedia Commons (click for source & license)">
		<img class="coach-photo" src="${esc(c.image)}" alt="${esc(c.name)}">
	</a>`;
}

function tableHtml(coaches) {
	const rows = coaches.map((c) => `
		<tr>
			<td class="coach-photo-cell">${photoHtml(c)}</td>
			<td>${esc(c.name)}${c.interim ? '<span class="coach-interim" title="Interim">*</span>' : ''}</td>
			<td class="h2h-num"><a href="/${c.firstSeason}">${esc(c.tenure)}</a></td>
			<td class="h2h-num">${esc(c.record)}</td>
			<td class="h2h-num">${pct(c.winPct)}</td>
			<td class="h2h-num">${c.playoffRecord ? esc(c.playoffRecord) : '—'}</td>
			<td class="h2h-num">${c.titles || '—'}</td>
		</tr>`).join('');
	return `<table class="h2h-table coaches-table">
		<thead><tr><th></th><th>Manager</th><th class="h2h-num">Tenure</th><th class="h2h-num">Record</th><th class="h2h-num">Win %</th><th class="h2h-num">Playoffs</th><th class="h2h-num">Titles</th></tr></thead>
		<tbody>${rows}</tbody>
	</table>`;
}

async function init() {
	const wrap = document.getElementById('coaches-table-wrap');
	try {
		const [gamesRes, coachesRes] = await Promise.all([
			fetch('/data/brewers_games.csv'),
			fetch('/data/brewers_coaches.csv'),
		]);
		if (!gamesRes.ok || !coachesRes.ok) throw new Error('CSV fetch failed');
		const rows = parseGamesCsv(await gamesRes.text());
		const champions = computeSeasonHistory(rows).filter((s) => s.champion).map((s) => s.season);
		const data = computeCoaches(rows, parseCoachesCsv(await coachesRes.text()), champions);

		document.getElementById('coaches-subtitle').textContent =
			`Milwaukee Brewers · ${data.coaches.length} managers since ${data.coaches[0].firstSeason}`;

		const interimBox = document.getElementById('coaches-interim');
		interimBox.checked = localStorage.getItem('coachesShowInterim') !== 'false';
		const renderTable = () => {
			wrap.innerHTML = tableHtml(interimBox.checked ? data.coaches : data.coaches.filter((c) => !c.interim));
		};
		interimBox.addEventListener('change', () => {
			localStorage.setItem('coachesShowInterim', String(interimBox.checked));
			renderTable();
		});
		renderTable();

		const share = document.getElementById('coaches-share');
		share.innerHTML = shareButtonsHtml('share-btn record-share-btn');
		wireShareRow(share, coachesCopy(data).desc, `${window.location.origin}/coaches`);
	} catch (e) {
		wrap.innerHTML = '<p class="record-empty">Could not load the game data. Try again later.</p>';
		console.error(e);
	}
}

init();
