// Head-to-Head page: all-time record vs every opponent (h2h-core.js, shared
// with the server), with a filterable table and a shareable focus card per
// opponent at /vs/<slug>.
import { parseGamesCsv, formatDate, esc } from './records-core.js';
import { computeHeadToHead, h2hCopy, streakSentence } from './h2h-core.js';
import { shareButtonsHtml, wireShareRow } from './share-core.js';

// Standard sports-page winning percentage: ties count half. ".622" / "1.000".
const pct = (p) => (p >= 1 ? '1.000' : p.toFixed(3).replace(/^0/, ''));

const resultLetter = { WIN: 'W', LOSS: 'L', TIE: 'T' };
const meeting = (m) =>
	`${resultLetter[m.result]} ${m.pf}–${m.pa} · <a href="/${m.season}">${esc(formatDate(m.date))}</a>`;

function focusCardHtml(o) {
	const stats = [
		`<span class="h2h-stat-label">Meetings</span><span>${o.games}${o.playoffGames ? ` (${o.playoffGames} playoff)` : ''}</span>`,
		`<span class="h2h-stat-label">First meeting</span><span>${meeting(o.first)}</span>`,
		`<span class="h2h-stat-label">Last meeting</span><span>${meeting(o.last)}</span>`,
		o.playoffRecord ? `<span class="h2h-stat-label">Playoffs</span><span>${esc(o.playoffRecord)}</span>` : null,
		o.biggestWin ? `<span class="h2h-stat-label">Biggest win</span><span>${o.biggestWin.pf}–${o.biggestWin.pa} · <a href="/${o.biggestWin.season}">${o.biggestWin.season}</a></span>` : null,
	].filter(Boolean);
	return `<section class="record-card record-card-focus h2h-focus-card">
		<h2 class="record-card-title"><i class="mdi mdi-sword-cross"></i> vs ${esc(o.name)}</h2>
		<div class="h2h-record">${esc(o.record)}</div>
		<p class="record-note">${esc(streakSentence(o))}</p>
		<div class="h2h-stats">${stats.map((s) => `<div class="h2h-stat">${s}</div>`).join('')}</div>
		<div class="record-share">${shareButtonsHtml('share-btn record-share-btn')}</div>
	</section>`;
}

function tableHtml(opponents) {
	const rows = opponents.map((o) => `
		<tr data-name="${esc(o.name.toLowerCase())}">
			<td><a href="/vs/${o.slug}">${esc(o.name)}</a></td>
			<td class="h2h-num">${esc(o.record)}</td>
			<td class="h2h-num">${o.games}</td>
			<td class="h2h-num">${pct(o.winPct)}</td>
		</tr>`).join('');
	return `<table class="h2h-table">
		<thead><tr><th>Opponent</th><th class="h2h-num">Record</th><th class="h2h-num">Games</th><th class="h2h-num">Win %</th></tr></thead>
		<tbody>${rows}</tbody>
	</table>`;
}

// /vs/<slug> deep link (or ?vs=<slug> when served statically in dev).
function requestedSlug(data) {
	const m = window.location.pathname.match(/\/vs\/([a-z0-9-]+)\/?$/);
	const slug = m ? m[1] : new URLSearchParams(window.location.search).get('vs');
	return data.bySlug.has(slug) ? slug : null;
}

async function init() {
	const wrap = document.getElementById('h2h-table-wrap');
	try {
		const res = await fetch('/data/packers_games.csv');
		if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
		const data = computeHeadToHead(parseGamesCsv(await res.text()));
		document.getElementById('h2h-subtitle').textContent =
			`Green Bay Packers · all-time vs ${data.opponents.length} opponents`;
		wrap.innerHTML = tableHtml(data.opponents);

		const filter = document.getElementById('h2h-filter');
		filter.addEventListener('input', () => {
			const q = filter.value.trim().toLowerCase();
			wrap.querySelectorAll('tbody tr').forEach((tr) => {
				tr.hidden = q !== '' && !tr.dataset.name.includes(q);
			});
		});

		const slug = requestedSlug(data);
		if (slug) {
			const o = data.bySlug.get(slug);
			document.title = h2hCopy(slug, data).title;
			const focus = document.getElementById('h2h-focus');
			focus.innerHTML = focusCardHtml(o);
			wireShareRow(
				focus.querySelector('.record-share'),
				h2hCopy(slug, data).desc,
				`${window.location.origin}/vs/${slug}`,
			);
		}
	} catch (e) {
		wrap.innerHTML = '<p class="record-empty">Could not load the game data. Try again later.</p>';
		console.error(e);
	}
}

init();
