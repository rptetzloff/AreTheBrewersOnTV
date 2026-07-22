// Managers page: every Brewers manager in tenure order with their
// record, derived from gameinfo.csv + teamstats.csv + biofile0.csv.
import { parseGameinfoCsv, computeSeasonHistory, esc } from './records-core.js';
import { parseBiofile, parseTeamstatsMgr, parseManagersCsv, computeCoachesFromData, coachesCopy } from './coaches-core.js';
import { shareButtonsHtml, labeledShareButtonsHtml, wireShareRow, wireShareDropdown } from './share-core.js';
import { sortableHeadHtml, sortRows, wireSortable } from './sortable.js';

const pct = (p) => (p >= 1 ? '1.000' : p.toFixed(3).replace(/^0/, ''));

const MANAGER_COLUMNS = [
	{ key: '_photo',  label: '',        nosort: true },
	{ key: 'name',    label: 'Manager' },
	{ key: 'firstSeason', label: 'Tenure', title: 'Tenure', num: true, sortKey: (c) => c.firstSeason, defaultDir: -1 },
	{ key: 'record',  label: 'Record',  title: 'Win-Loss-Tie', num: true, sortKey: (c) => c.winPct, defaultDir: -1 },
	{ key: 'winPct',  label: 'Win %',   title: 'Winning percentage', num: true, defaultDir: -1 },
	{ key: 'playoffRecord', label: 'Playoffs', title: 'Playoff record', num: true, sortKey: (c) => c.playoffGames, defaultDir: -1 },
	{ key: 'titles',  label: 'Titles',  title: 'Championships', num: true, defaultDir: -1 },
];
let managerSort = { key: 'firstSeason', dir: -1 };
let managerData = []; // currently displayed coaches

function photoHtml(c) {
	if (!c.image) return '<span class="coach-photo coach-photo-none"><i class="mdi mdi-account"></i></span>';
	return `<a href="${esc(c.imagePage || c.image)}" target="_blank" rel="noopener noreferrer" title="Photo: Wikimedia Commons (click for source & license)">
		<img class="coach-photo" src="${esc(c.image)}" alt="${esc(c.name)}">
	</a>`;
}

function rowHtml(c) {
	return `<tr>
		<td class="coach-photo-cell">${photoHtml(c)}</td>
		<td>${esc(c.name)}${c.interim ? '<span class="coach-interim" title="Interim">*</span>' : ''}</td>
		<td class="h2h-num"><a href="/${c.firstSeason}">${esc(c.tenure)}</a></td>
		<td class="h2h-num">${esc(c.record)}</td>
		<td class="h2h-num">${pct(c.winPct)}</td>
		<td class="h2h-num">${c.playoffRecord ? esc(c.playoffRecord) : '—'}</td>
		<td class="h2h-num">${c.titles || '—'}</td>
	</tr>`;
}

function tableHtml(coaches) {
	const rows = sortRows(coaches, MANAGER_COLUMNS, managerSort).map(rowHtml).join('');
	return `<table class="h2h-table coaches-table sortable-table">
		<thead><tr>${sortableHeadHtml(MANAGER_COLUMNS, managerSort)}</tr></thead>
		<tbody>${rows}</tbody>
	</table>`;
}

async function init() {
	const wrap = document.getElementById('coaches-table-wrap');
	try {
		const [gamesRes, namesRes, teamstatsRes, biofileRes, managersRes, curGamesRes, curTsRes] = await Promise.all([
			fetch('/data/gameinfo.csv'),
			fetch('/data/CurrentNames.csv'),
			fetch('/data/teamstats.csv'),
			fetch('/data/biofile0.csv'),
			fetch('/data/managers.csv'),
			fetch('/api/current/gameinfo.csv').catch(() => null),
			fetch('/api/current/teamstats.csv').catch(() => null),
		]);
		if (!gamesRes.ok || !namesRes.ok || !teamstatsRes.ok || !biofileRes.ok || !managersRes.ok) throw new Error('CSV fetch failed');
		// Current-season games synthesized from ESPN (empty once Retrosheet
		// covers the season); appended so tenures include this year.
		const curGames = curGamesRes?.ok ? (await curGamesRes.text()).trim() : '';
		const curTs = curTsRes?.ok ? (await curTsRes.text()).trim() : '';
		const teamstatsText = (await teamstatsRes.text()).trimEnd() + (curTs ? '\n' + curTs : '');
		const gamesText = (await gamesRes.text()).trimEnd() + (curGames ? '\n' + curGames : '');
		const rows = parseGameinfoCsv(gamesText, await namesRes.text(), teamstatsText);
		const gidToMgr = parseTeamstatsMgr(teamstatsText);
		const mgrNames = parseBiofile(await biofileRes.text());
		const officialTenures = parseManagersCsv(await managersRes.text());
		const champions = computeSeasonHistory(rows).filter((s) => s.champion).map((s) => s.season);
		const data = computeCoachesFromData(rows, gidToMgr, mgrNames, champions, officialTenures);

		const interimBox = document.getElementById('coaches-interim');
		interimBox.checked = localStorage.getItem('coachesShowInterim') !== 'false';
		const subtitle = document.getElementById('coaches-subtitle');
		const renderTable = () => {
			managerData = interimBox.checked ? data.coaches : data.coaches.filter((c) => !c.interim);
			wrap.innerHTML = tableHtml(managerData);
			const table = wrap.querySelector('table');
			if (table) wireSortable(table, MANAGER_COLUMNS, managerSort, renderTable);
			const interimCount = data.coaches.length - managerData.length;
			subtitle.textContent = `Milwaukee Brewers · ${managerData.length} managers since ${data.coaches[0].firstSeason}` +
				(interimCount ? ` · ${interimCount} interim` : '');
		};
		interimBox.addEventListener('change', () => {
			localStorage.setItem('coachesShowInterim', String(interimBox.checked));
			renderTable();
		});
		renderTable();

		const share = document.getElementById('managers-share');
		share.innerHTML = labeledShareButtonsHtml('footer-share-item');
		wireShareRow(share, coachesCopy(data).desc, `${window.location.origin}/managers`);
		wireShareDropdown();
	} catch (e) {
		wrap.innerHTML = '<p class="record-empty">Could not load the game data. Try again later.</p>';
		console.error(e);
	}
}

init();
