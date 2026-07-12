// Head Coaches page: every Packers head coach in tenure order with their
// record, computed from the shared coaches-core.js (games assigned to
// tenures by exact dates, so mid-season changes split correctly).
import { parseGamesCsv, computeSeasonHistory, esc } from './records-core.js';
import { parseCoachesCsv, computeCoaches, coachesCopy } from './coaches-core.js';
import { shareButtonsHtml, wireShareRow } from './share-core.js';

const pct = (p) => (p >= 1 ? '1.000' : p.toFixed(3).replace(/^0/, ''));

function tableHtml(coaches) {
	const rows = coaches.map((c) => `
		<tr>
			<td>${esc(c.name)}</td>
			<td class="h2h-num"><a href="/${c.firstSeason}">${esc(c.tenure)}</a></td>
			<td class="h2h-num">${esc(c.record)}</td>
			<td class="h2h-num">${pct(c.winPct)}</td>
			<td class="h2h-num">${c.playoffRecord ? esc(c.playoffRecord) : '—'}</td>
			<td class="h2h-num">${c.titles || '—'}</td>
		</tr>`).join('');
	return `<table class="h2h-table">
		<thead><tr><th>Coach</th><th class="h2h-num">Tenure</th><th class="h2h-num">Record</th><th class="h2h-num">Win %</th><th class="h2h-num">Playoffs</th><th class="h2h-num">Titles</th></tr></thead>
		<tbody>${rows}</tbody>
	</table>`;
}

async function init() {
	const wrap = document.getElementById('coaches-table-wrap');
	try {
		const [gamesRes, coachesRes] = await Promise.all([
			fetch('/data/packers_games.csv'),
			fetch('/data/packers_coaches.csv'),
		]);
		if (!gamesRes.ok || !coachesRes.ok) throw new Error('CSV fetch failed');
		const rows = parseGamesCsv(await gamesRes.text());
		const champions = computeSeasonHistory(rows).filter((s) => s.champion).map((s) => s.season);
		const data = computeCoaches(rows, parseCoachesCsv(await coachesRes.text()), champions);

		document.getElementById('coaches-subtitle').textContent =
			`Green Bay Packers · ${data.coaches.length} head coaches since ${data.coaches[0].firstSeason}`;
		wrap.innerHTML = tableHtml(data.coaches);

		const share = document.getElementById('coaches-share');
		share.innerHTML = shareButtonsHtml('share-btn record-share-btn');
		wireShareRow(share, coachesCopy(data).desc, `${window.location.origin}/coaches`);
	} catch (e) {
		wrap.innerHTML = '<p class="record-empty">Could not load the game data. Try again later.</p>';
		console.error(e);
	}
}

init();
