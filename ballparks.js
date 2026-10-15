// Ballparks page: each home park, then the game-day records, from
// /api/ballparks (ballparks-core.js, built on the server from gameinfo.csv's
// game-day columns and the line scores).
import { esc, formatDate } from './records-core.js';
import { labeledShareButtonsHtml, wireShareRow, wireShareDropdown } from './share-core.js';

const commas = (n) => n.toLocaleString('en-US');
const pct = (p) => (p === null ? '—' : p.toFixed(3).replace(/^0/, ''));
const clock = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const span = (a, b) => (a === b ? `${a}` : `${a}–${b}`);

/** "vs Chicago White Sox" linked to the box score, and the result. */
const gameLine = (g) => ({
	subHtml: `<a href="/game/${esc(g.gid)}">${g.home ? 'vs' : 'at'} ${esc(g.opponent)}</a>`,
	detailHtml: `${esc(formatDate(g.date))} · ${esc(g.park)} · ${g.result} ${g.pf}–${g.pa}`,
});

function entryHtml(e, i) {
	return `<li class="record-entry${i === 0 ? ' record-entry-top' : ''}">
		<span class="record-entry-main">${esc(e.main)}</span>
		<span class="record-entry-sub">${e.subHtml}</span>
		${e.detailHtml ? `<span class="record-entry-detail">${e.detailHtml}</span>` : ''}
	</li>`;
}

function cardHtml(title, icon, note, entries, plain = false) {
	const body = entries.length
		? `<ol class="record-list${plain ? ' ballparks-facts' : ''}">${entries.map(entryHtml).join('')}</ol>`
		: '<p class="record-empty">Nothing recorded.</p>';
	return `<section class="record-card">
		<h2 class="record-card-title"><i class="mdi ${icon}"></i> ${esc(title)}</h2>
		${note ? `<p class="record-note">${note}</p>` : ''}
		${body}
	</section>`;
}

/** One home park as a card of facts rather than a ranked list. */
function parkCard(p) {
	const formerly = p.formerly.length
		? `Formerly ${p.formerly.map((f) => `${esc(f.name)} (${span(f.from, f.to)})`).join(', ')} · `
		: '';
	const fact = (main, subHtml, detailHtml = '') => ({ main, subHtml, detailHtml });
	const game = (g) => `<a href="/game/${esc(g.gid)}">${esc(formatDate(g.date))}</a> vs ${esc(g.opponent)}, <span class="ballparks-score">${g.result} ${g.pf}–${g.pa}</span>`;
	// The park's own game-day records, each with the game it happened in;
	// a record the park never produced (no extra-inning game, no recorded
	// temperature) is left off rather than shown empty.
	const extreme = (g, value, label) => (g ? [fact(value(g), label, game(g))] : []);
	const facts = [
		// The current park is still open: "2001–", with the games counted
		// through the last season Retrosheet has published.
		p.current
			? fact(`${p.first}–`, `${commas(p.games)} home games`, `through ${p.last}`)
			: fact(span(p.first, p.last), `${commas(p.games)} home games`),
		fact(p.record, `regular season · ${pct(p.winPct)}`, p.postseason ? `postseason ${esc(p.postseason)}` : ''),
		...(p.averageAttendance ? [fact(commas(p.averageAttendance), 'average crowd', p.attendanceCoverage < 0.98 ? `of the ${Math.round(p.attendanceCoverage * 100)}% of games with attendance recorded` : '')] : []),
		...extreme(p.biggestCrowd, (g) => commas(g.attendance), 'biggest crowd'),
		...extreme(p.smallestCrowd, (g) => commas(g.attendance), 'smallest crowd'),
		...extreme(p.hottest, (g) => `${g.temp}°`, 'hottest game'),
		...extreme(p.coldest, (g) => `${g.temp}°`, 'coldest game'),
		...extreme(p.longestTime, (g) => clock(g.minutes), 'longest game'),
		...extreme(p.shortestTime, (g) => clock(g.minutes), 'shortest game'),
		...extreme(p.mostInnings, (g) => `${g.innings} inn`, 'most innings'),
		fact('First', game(p.firstGame)),
		fact(p.current ? 'Latest' : 'Last', game(p.lastGame)),
	];
	return cardHtml(p.name, 'mdi-stadium', `${formerly}${esc(p.city)}`, facts, true);
}

async function init() {
	const parksEl = document.getElementById('ballparks-parks');
	try {
		const res = await fetch('/api/ballparks');
		if (!res.ok) throw new Error(`ballparks ${res.status}`);
		const d = await res.json();
		document.getElementById('ballparks-subtitle').textContent =
			`Milwaukee Brewers · ${d.range.first}–${d.range.last} · ${d.parks.length} home parks`;
		parksEl.innerHTML = d.parks.map(parkCard).join('');

		const board = (list, value) => list.map((g) => ({ main: value(g), ...gameLine(g) }));
		document.getElementById('ballparks-records').innerHTML = [
			cardHtml('Biggest Crowds', 'mdi-account-group', 'Home games', board(d.biggestCrowds, (g) => commas(g.attendance))),
			cardHtml('Smallest Crowds', 'mdi-account-outline', 'Home games', board(d.smallestCrowds, (g) => commas(g.attendance))),
			cardHtml('Longest Games', 'mdi-timer-sand', 'By time, rain delays not included', board(d.longestTime, (g) => clock(g.minutes))),
			cardHtml('Most Innings', 'mdi-infinity', 'Extra-inning games, longest first', board(d.mostInnings, (g) => `${g.innings} inn`)),
			cardHtml('Shortest Games', 'mdi-timer-outline', 'By time, nine innings or more', board(d.shortestTime, (g) => clock(g.minutes))),
			cardHtml('Hottest Games', 'mdi-white-balance-sunny', 'Game-time temperature, °F', board(d.hottest, (g) => `${g.temp}°`)),
			cardHtml('Coldest Games', 'mdi-snowflake', 'Game-time temperature, °F', board(d.coldest, (g) => `${g.temp}°`)),
		].join('');

		const share = document.getElementById('ballparks-share');
		share.innerHTML = labeledShareButtonsHtml('footer-share-item');
		wireShareRow(share, `Every Brewers home park, and the biggest crowds, longest games and hottest and coldest days.`, `${window.location.origin}/ballparks`);
		wireShareDropdown();
	} catch (e) {
		parksEl.innerHTML = '<p class="record-empty">Could not load the ballparks. Try again later.</p>';
		console.error(e);
	}
}

init();
