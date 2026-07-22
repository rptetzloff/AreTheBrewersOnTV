// Records & Superlatives page: computes superlatives from the games CSV
// (records-core.js, shared with the server) and renders one shareable card each.
import { parseGameinfoCsv, computeSuperlatives, computeTeamstatsRecords, recordsCopy, formatDate, RECORD_SLUGS, esc } from './records-core.js';
import { shareButtonsHtml, labeledShareButtonsHtml, wireShareRow, wireShareDropdown } from './share-core.js';

const yearLink = (yr) => `<a href="/${yr}">${yr}</a>`;
// Game links go straight to the box score page.
const gameLink = (season, gid, label) => `<a href="/game/${esc(gid)}">${label}</a>`;
const gameFlag = (g) => (g.worldseries ? ' · World Series' : g.playoff ? ' · Playoffs' : '');
const blowoutEntry = (g) => ({
	main: `${g.pf}–${g.pa}`, sub: `vs ${g.opponent}`,
	detailHtml: `${gameLink(g.season, g.gid, esc(formatDate(g.date)))}${esc(gameFlag(g))}`,
});
// No-hitter entry: like a blowout entry, but says who threw it — one pitcher
// is an individual no-hitter, several a combined one. Without pitcher data
// (server feats unavailable) the entry just omits the attribution.
const noHitterEntry = (g) => {
	const who = g.pitchers?.length
		? `${esc(g.pitchers.join(', '))}${g.pitchers.length > 1 ? ' <span class="record-combined">(combined)</span>' : ''}`
		: '';
	return {
		main: `${g.pf}–${g.pa}`, sub: `vs ${g.opponent}`,
		detailHtml: `${gameLink(g.season, g.gid, esc(formatDate(g.date)))}${esc(gameFlag(g))}${who ? ` · ${who}` : ''}`,
	};
};

const seasonEntry = (s) => ({
	main: s.record,
	subHtml: yearLink(s.season),
	detailHtml: `.${String(Math.round(s.winPct * 1000)).padStart(3, '0')} winning percentage`,
});

const CARDS = [
	{
		slug: 'best-seasons', icon: 'mdi-crown', title: 'Best Seasons',
		note: 'Highest winning percentage among completed seasons',
		entries: (d) => d.bestSeasons.map(seasonEntry),
	},
	{
		slug: 'worst-seasons', icon: 'mdi-emoticon-sad-outline', title: 'Worst Seasons',
		note: 'Lowest winning percentage among completed seasons',
		entries: (d) => d.worstSeasons.map(seasonEntry),
	},
	{
		slug: 'best-starts', icon: 'mdi-rocket-launch-outline', title: 'Best Season Starts',
		note: 'Wins to open a season',
		entries: (d) => d.bestStarts.map((b) => ({ main: `${b.games}–0`, subHtml: gameLink(b.season, b.firstGid, yearLink(b.season)) })),	},
	{
		slug: 'win-streaks', icon: 'mdi-fire', title: 'Longest Win Streaks',
		note: 'Consecutive regular-season wins (ties end a streak)',
		entries: (d) => d.winStreaks.map((s) => ({
			main: `${s.games} straight`,
			subHtml: s.startSeason === s.endSeason
				? yearLink(s.startSeason)
				: `${yearLink(s.startSeason)}–${yearLink(s.endSeason)}`,
			detailHtml: `${gameLink(s.startSeason, s.startGid, esc(formatDate(s.startDate)))} – ${gameLink(s.endSeason, s.endGid, esc(formatDate(s.endDate)))}`,
		})),	},
	{
		slug: 'worst-starts', icon: 'mdi-trending-down', title: 'Worst Season Starts',
		note: 'Losses to open a season',
		entries: (d) => d.worstStarts.map((w) => ({ main: `0–${w.games}`, subHtml: gameLink(w.season, w.firstGid, yearLink(w.season)) })),	},
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
		slug: 'no-hitters', icon: 'mdi-baseball', title: 'No-Hitters',
		note: 'Every no-hitter in franchise history, individual and combined, most recent first',
		highlightTop: false,
		entries: (d) => d.noHitters.map(noHitterEntry),
		empty: 'The Brewers have never thrown a no-hitter.',
	},
	{
		slug: 'perfect-games', icon: 'mdi-baseball-diamond', title: 'Perfect Games',
		note: 'Every perfect game in franchise history, most recent first',
		highlightTop: false,
		entries: (d) => d.perfectGames.map(noHitterEntry),
		empty: 'The Brewers have never thrown a perfect game.',
	},
	{
		slug: 'triple-plays', icon: 'mdi-numeric-3-circle-outline', title: 'Triple Plays',
		note: 'Every triple play the Brewers have turned, most recent first',
		highlightTop: false,
		entries: (d) => (d.triplePlays || []).map((g) => ({
			main: g.count > 1 ? `${g.count} in one game` : `vs ${g.opponent}`,
			sub: g.count > 1 ? `vs ${g.opponent}` : `${g.pf}–${g.pa}`,
			detailHtml: `${gameLink(g.season, g.gid, esc(formatDate(g.date)))}${esc(gameFlag(g))}`,
		})),
		empty: 'The Brewers have never turned a triple play.',
	},
	{
		slug: 'most-hr-game', icon: 'mdi-baseball-bat', title: 'Most Home Runs in a Game (Team)',
		note: 'Most home runs hit by the Brewers in a single game (ties included)',
		entries: (d) => (d.mostTeamHrGames || []).map((g) => ({
			main: `${g.hr} HR`,
			sub: `vs ${g.opponent} (${g.pf}–${g.pa})`,
			detailHtml: `${gameLink(g.season, g.gid, esc(formatDate(g.date)))}${esc(gameFlag(g))}`,
		})),
	},
	{
		slug: 'player-hr-game', icon: 'mdi-account-star-outline', title: 'Most Home Runs in a Game (Player)',
		note: 'Every three-homer game by a Brewer, best first',
		highlightTop: false,
		entries: (d) => (d.playerHrGames || []).map((g) => ({
			main: `${g.hr} HR`,
			sub: `${g.player} vs ${g.opponent}`,
			detailHtml: `${gameLink(g.season, g.gid, esc(formatDate(g.date)))}${esc(gameFlag(g))} · ${g.rbi} RBI`,
		})),
		empty: 'No Brewer has hit three home runs in a game. Yet.',
	},
	{
		slug: 'cycles', icon: 'mdi-sync-circle', title: 'Cycles',
		note: 'Every Brewer to hit for the cycle, most recent first',
		highlightTop: false,
		entries: (d) => (d.cycles || []).map((c) => ({
			main: c.player,
			sub: `vs ${c.opponent}`,
			detailHtml: `${gameLink(c.season, c.gid, esc(formatDate(c.date)))}${esc(gameFlag(c))} · ${c.h}-for-${c.ab}`,
		})),
		empty: 'No Brewer has hit for the cycle. Yet.',
	},
	{
		slug: 'world-series-appearances', icon: 'mdi-trophy-outline', title: 'World Series Appearances',
		note: 'Brewers World Series results by year',
		highlightTop: false,
		entries: (d) => d.worldSeriesAppearances.map((p) => ({
			main: String(p.season),
			subHtml: `<a href="/game/${esc(p.firstGid)}">${esc(p.result)} vs ${esc(p.opponent)} (${esc(p.record)})</a>`,
		})),
		empty: 'The Brewers have not yet reached a World Series.',
	},
	{
		slug: 'playoff-appearances', icon: 'mdi-medal-outline', title: 'Playoff Appearances',
		note: 'Brewers postseason series results by year',
		highlightTop: false,
		entries: (d) => d.playoffAppearances.map((p) => ({
			main: String(p.season),
			subHtml: p.series.map((s) => `<a href="/game/${esc(s.firstGid)}">${esc(s.result)} ${esc(s.roundLabel)} vs ${esc(s.opponent)} (${esc(s.record)})</a>`).join('<br>'),
		})),
		empty: 'The Brewers have not yet reached the playoffs.',
	},
	{
		slug: 'ties', icon: 'mdi-equal', title: 'Ties',
		note: 'Every tie in franchise history, most recent first',
		highlightTop: false,
		entries: (d) => d.ties.map(blowoutEntry),
		empty: 'The Brewers have never tied a game.',
	},
];

function entryHtml(e, i, highlightTop) {
	const sub = e.subHtml ?? esc(e.sub);
	const detail = e.detailHtml ?? (e.detail ? esc(e.detail) : '');
	return `<li class="record-entry${highlightTop && i === 0 ? ' record-entry-top' : ''}">
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
		? `<ol class="record-list">${entries.map((e, i) => entryHtml(e, i, card.highlightTop !== false)).join('')}</ol>`
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

function requestedSlug() {
	const m = window.location.pathname.match(/\/records\/([a-z-]+)\/?$/);
	const slug = m ? m[1] : new URLSearchParams(window.location.search).get('card');
	return RECORD_SLUGS.includes(slug) ? slug : null;
}

async function init() {
	const grid = document.getElementById('records-grid');
	try {
		const [gamesRes, namesRes, teamstatsRes, cyclesRes] = await Promise.all([
			fetch('/data/gameinfo.csv'),
			fetch('/data/CurrentNames.csv'),
			fetch('/data/teamstats.csv'),
			// Server-computed (needs the full batting file); optional — the cards
			// show their empty state if unavailable.
			fetch('/api/records/batting').catch(() => null),
		]);
		if (!gamesRes.ok || !namesRes.ok || !teamstatsRes.ok) throw new Error(`CSV fetch failed`);
		const namesText = await namesRes.text();
		const teamstatsText = await teamstatsRes.text();
		const rows = parseGameinfoCsv(await gamesRes.text(), namesText, teamstatsText);
		const featsJson = cyclesRes?.ok ? await cyclesRes.json().catch(() => null) : null;
		const data = {
			...computeSuperlatives(rows), ...computeTeamstatsRecords(rows, teamstatsText),
			cycles: featsJson?.cycles || [], playerHrGames: featsJson?.playerHrGames || [],
		};
		// Pitcher names per no-hitter (one = individual, several = combined).
		const nhPitchers = featsJson?.noHitterPitchers || {};
		for (const list of [data.noHitters, data.perfectGames]) {
			for (const nh of list || []) {
				if (nhPitchers[nh.gid]) nh.pitchers = nhPitchers[nh.gid];
			}
		}
		document.getElementById('records-subtitle').textContent =
			`Milwaukee Brewers · ${data.seasonRange.first}–${data.seasonRange.last}`;
		grid.innerHTML = CARDS.map((c) => cardHtml(c, data)).join('');
		wireShares(grid, data);

		const footerShare = document.getElementById('records-share');
		footerShare.innerHTML = labeledShareButtonsHtml('footer-share-item');
		wireShareRow(footerShare, recordsCopy('overview', data).desc, `${window.location.origin}/records`);
		wireShareDropdown();

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
