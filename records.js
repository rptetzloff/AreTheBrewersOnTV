// Records & Superlatives page: computes superlatives from the games CSV
// (records-core.js, shared with the server) and renders one shareable card each.
import { parseGamesCsv, computeSuperlatives, recordsCopy, formatDate, RECORD_SLUGS, esc } from './records-core.js';
import { shareButtonsHtml, wireShareRow } from './share-core.js';

const yearLink = (yr) => `<a href="/${yr}">${yr}</a>`;
const gameFlag = (g) => (g.superbowl ? ' · Super Bowl' : g.playoff ? ' · Playoffs' : '');
// Blowout entries link the date to the game's season page (a January playoff
// game belongs to the prior year's season, so the season, not the date's year).
const blowoutEntry = (g) => ({
	main: `${g.pf}–${g.pa}`, sub: `vs ${g.opponent}`,
	detailHtml: `<a href="/${g.season}">${esc(formatDate(g.date))}</a>${esc(gameFlag(g))}`,
});

const CARDS = [
	{
		slug: 'best-starts', icon: 'mdi-rocket-launch-outline', title: 'Best Season Starts',
		note: 'Wins to open a season',
		entries: (d) => d.bestStarts.map((b) => ({ main: `${b.games}–0`, subHtml: yearLink(b.season) })),
	},
	{
		slug: 'perfect-seasons', icon: 'mdi-trophy-outline', title: 'Perfect Seasons',
		note: 'Finished the regular season without a loss',
		entries: (d) => d.perfectSeasons.map((p) => ({ main: p.record, subHtml: yearLink(p.season) })),
		empty: 'No perfect seasons. Yet.',
	},
	{
		slug: 'win-streaks', icon: 'mdi-fire', title: 'Longest Win Streaks',
		note: 'Consecutive regular-season wins (ties end a streak)',
		entries: (d) => d.winStreaks.map((s) => ({
			main: `${s.games} straight`,
			subHtml: s.startSeason === s.endSeason
				? yearLink(s.startSeason)
				: `${yearLink(s.startSeason)}–${yearLink(s.endSeason)}`,
			detail: `${formatDate(s.startDate)} – ${formatDate(s.endDate)}`,
		})),
	},
	{
		slug: 'worst-starts', icon: 'mdi-trending-down', title: 'Worst Season Starts',
		note: 'Losses to open a season',
		entries: (d) => d.worstStarts.map((w) => ({ main: `0–${w.games}`, subHtml: yearLink(w.season) })),
	},
	{
		slug: 'lopsided-wins', icon: 'mdi-scoreboard-outline', title: 'Most Lopsided Wins',
		note: 'Biggest margins of victory, playoffs included',
		entries: (d) => d.lopsidedWins.map(blowoutEntry),
	},
	{
		slug: 'worst-losses', icon: 'mdi-thumb-down-outline', title: 'Worst Losses',
		note: 'Biggest margins of defeat, playoffs included',
		entries: (d) => d.lopsidedLosses.map(blowoutEntry),
	},
	{
		slug: 'ties', icon: 'mdi-equal', title: 'Ties',
		note: 'Every tie in franchise history, most recent first — overtime arrived in 1974',
		entries: (d) => d.ties.map(blowoutEntry),
		empty: 'The Packers have never tied a game.',
	},
];

function entryHtml(e, i) {
	const sub = e.subHtml ?? esc(e.sub);
	const detail = e.detailHtml ?? (e.detail ? esc(e.detail) : '');
	return `<li class="record-entry${i === 0 ? ' record-entry-top' : ''}">
		<span class="record-entry-main">${esc(e.main)}</span>
		<span class="record-entry-sub">${sub}</span>
		${detail ? `<span class="record-entry-detail">${detail}</span>` : ''}
	</li>`;
}

function shareRowHtml(slug) {
	return `<div class="record-share" data-slug="${slug}">${shareButtonsHtml('share-btn record-share-btn')}</div>`;
}

function cardHtml(card, data) {
	const entries = card.entries(data);
	const body = entries.length
		? `<ol class="record-list">${entries.map(entryHtml).join('')}</ol>`
		: `<p class="record-empty">${esc(card.empty || 'Nothing here yet.')}</p>`;
	return `<section class="record-card" id="card-${card.slug}">
		<h2 class="record-card-title"><i class="mdi ${card.icon}"></i> ${esc(card.title)}</h2>
		<p class="record-note">${esc(card.note)}</p>
		${body}
		${shareRowHtml(card.slug)}
	</section>`;
}

function wireShares(grid, data) {
	grid.querySelectorAll('.record-share').forEach((row) => {
		const slug = row.dataset.slug;
		wireShareRow(row, recordsCopy(slug, data).desc, `${window.location.origin}/records/${slug}`);
	});
}

// /records/<slug> deep link (or ?card=<slug> when served statically in dev).
function requestedSlug() {
	const m = window.location.pathname.match(/\/records\/([a-z-]+)\/?$/);
	const slug = m ? m[1] : new URLSearchParams(window.location.search).get('card');
	return RECORD_SLUGS.includes(slug) ? slug : null;
}

async function init() {
	const grid = document.getElementById('records-grid');
	try {
		const res = await fetch('/data/packers_games.csv');
		if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
		const data = computeSuperlatives(parseGamesCsv(await res.text()));
		document.getElementById('records-subtitle').textContent =
			`Green Bay Packers · ${data.seasonRange.first}–${data.seasonRange.last}`;
		grid.innerHTML = CARDS.map((c) => cardHtml(c, data)).join('');
		wireShares(grid, data);

		const slug = requestedSlug();
		if (slug) {
			document.title = recordsCopy(slug, data).title;
			const card = document.getElementById(`card-${slug}`);
			if (card) {
				card.classList.add('record-card-focus');
				card.scrollIntoView({ block: 'center' });
			}
		}
	} catch (e) {
		grid.innerHTML = '<p class="record-empty">Could not load the game data. Try again later.</p>';
		console.error(e);
	}
}

init();
