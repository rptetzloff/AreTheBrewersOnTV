// Records & Superlatives page: computes superlatives from the games CSV
// (records-core.js, shared with the server) and renders one shareable card each.
import { parseGamesCsv, computeSuperlatives, recordsCopy, formatDate, streakSpan, RECORD_SLUGS, esc } from './records-core.js';

const CARDS = [
	{
		slug: 'best-starts', icon: 'mdi-rocket-launch-outline', title: 'Best Season Starts',
		note: 'Wins to open a season',
		entries: (d) => d.bestStarts.map((b) => ({ main: `${b.games}–0`, sub: String(b.season) })),
	},
	{
		slug: 'perfect-seasons', icon: 'mdi-trophy-outline', title: 'Perfect Seasons',
		note: 'Finished the regular season without a loss',
		entries: (d) => d.perfectSeasons.map((p) => ({ main: p.record, sub: String(p.season) })),
		empty: 'No perfect seasons. Yet.',
	},
	{
		slug: 'win-streaks', icon: 'mdi-fire', title: 'Longest Win Streaks',
		note: 'Consecutive regular-season wins (ties end a streak)',
		entries: (d) => d.winStreaks.map((s) => ({
			main: `${s.games} straight`, sub: streakSpan(s),
			detail: `${formatDate(s.startDate)} – ${formatDate(s.endDate)}`,
		})),
	},
	{
		slug: 'worst-starts', icon: 'mdi-trending-down', title: 'Worst Season Starts',
		note: 'Losses to open a season',
		entries: (d) => d.worstStarts.map((w) => ({ main: `0–${w.games}`, sub: String(w.season) })),
	},
	{
		slug: 'lopsided-wins', icon: 'mdi-scoreboard-outline', title: 'Most Lopsided Wins',
		note: 'Biggest margins of victory, playoffs included',
		entries: (d) => d.lopsidedWins.map((g) => ({
			main: `${g.pf}–${g.pa}`, sub: `vs ${g.opponent}`,
			detail: formatDate(g.date) + (g.superbowl ? ' · Super Bowl' : g.playoff ? ' · Playoffs' : ''),
		})),
	},
];

function entryHtml(e, i) {
	return `<li class="record-entry${i === 0 ? ' record-entry-top' : ''}">
		<span class="record-entry-main">${esc(e.main)}</span>
		<span class="record-entry-sub">${esc(e.sub)}</span>
		${e.detail ? `<span class="record-entry-detail">${esc(e.detail)}</span>` : ''}
	</li>`;
}

function shareRowHtml(slug) {
	const native = !!navigator.share;
	const alts = native ? '' : `
		<a class="share-btn record-share-btn" data-share="x" href="#" target="_blank" rel="noopener noreferrer" aria-label="Post on X"><i class="mdi mdi-twitter"></i></a>
		<a class="share-btn record-share-btn" data-share="bsky" href="#" target="_blank" rel="noopener noreferrer" aria-label="Post on Bluesky"><i class="mdi mdi-butterfly"></i></a>
		<a class="share-btn record-share-btn" data-share="fb" href="#" target="_blank" rel="noopener noreferrer" aria-label="Share on Facebook"><i class="mdi mdi-facebook"></i></a>
		<a class="share-btn record-share-btn" data-share="reddit" href="#" target="_blank" rel="noopener noreferrer" aria-label="Post on Reddit"><i class="mdi mdi-reddit"></i></a>`;
	return `<div class="record-share" data-slug="${slug}">
		${native ? '<button class="share-btn record-share-btn" data-share="native" aria-label="Share"><i class="mdi mdi-share-variant"></i></button>' : ''}
		${alts}
		<button class="share-btn record-share-btn" data-share="copy" aria-label="Copy link"><i class="mdi mdi-clipboard-outline"></i></button>
	</div>`;
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

function shareUrl(slug) {
	return `${window.location.origin}/records/${slug}`;
}

function wireShares(grid, data) {
	grid.querySelectorAll('.record-share').forEach((row) => {
		const slug = row.dataset.slug;
		const url = shareUrl(slug);
		const message = recordsCopy(slug, data).desc;
		const text = `${message}\n\n${url}`;
		row.querySelectorAll('[data-share]').forEach((btn) => {
			switch (btn.dataset.share) {
				case 'x': btn.href = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`; break;
				case 'bsky': btn.href = `https://bsky.app/intent/compose?text=${encodeURIComponent(text)}`; break;
				case 'fb': btn.href = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(message)}`; break;
				case 'reddit': btn.href = `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(message)}`; break;
				case 'native':
					btn.addEventListener('click', async () => {
						try { await navigator.share({ text: message, url }); } catch { /* user cancelled */ }
					});
					break;
				case 'copy':
					btn.addEventListener('click', async () => {
						try { await navigator.clipboard.writeText(text); }
						catch {
							const ta = document.createElement('textarea');
							ta.value = text;
							ta.style.cssText = 'position:fixed;opacity:0';
							document.body.appendChild(ta);
							ta.select();
							document.execCommand('copy');
							ta.remove();
						}
						const original = btn.innerHTML;
						btn.innerHTML = '<i class="mdi mdi-check"></i>';
						btn.classList.add('copy-success');
						setTimeout(() => { btn.innerHTML = original; btn.classList.remove('copy-success'); }, 2000);
					});
					break;
			}
		});
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
