// Player page: one Brewer's seasons, batting, pitching and fielding, each
// with a career line, from /api/player/<id>. Brewers seasons only — a player
// who also played elsewhere shows his Milwaukee years, which is what this
// site is about and all the data here covers.
import { esc } from './records-core.js';
import { labeledShareButtonsHtml, wireShareRow, wireShareDropdown } from './share-core.js';
import { BATTING_COLUMNS, PITCHING_COLUMNS, FIELDING_COLUMNS, cellHtml } from './stats-columns.js';

const tables = document.getElementById('player-tables');
const id = (window.location.pathname.match(/^\/player\/([^/]+)/) || [])[1] || '';

const SEASON_COLUMN = (tab) => ({ key: 'season', label: 'Year', html: (r) => `<a href="/stats/${r.season}#${tab}">${r.season}</a>` });
const CAREER_LABEL = { key: 'season', label: 'Year', html: () => 'Career' };

function tableHtml(title, columns, rows, careerRow) {
	const head = columns.map((c) => `<th${c.num ? ' class="h2h-num"' : ''}${c.title ? ` title="${esc(c.title)}"` : ''}>${esc(c.label)}</th>`).join('');
	const body = rows.map((r) => `<tr>${columns.map((c) => cellHtml(c, r)).join('')}</tr>`).join('');
	const foot = careerRow
		? `<tfoot><tr class="player-career">${[CAREER_LABEL, ...columns.slice(1)].map((c) => cellHtml(c, careerRow)).join('')}</tr></tfoot>`
		: '';
	return `<section class="player-section">
		<h2 class="player-section-title">${esc(title)}</h2>
		<div class="h2h-table-wrap stats-table-wrap">
			<table class="h2h-table stats-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table>
		</div>
	</section>`;
}

const POS_ORDER = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];

/** Career fielding is per position too: summed across seasons, FPCT again. */
function fieldingCareer(lines) {
	const by = new Map();
	for (const l of lines) {
		const c = by.get(l.pos) || { season: 'Career', pos: l.pos, g: 0, gs: 0, po: 0, a: 0, e: 0, dp: 0 };
		for (const k of ['g', 'gs', 'po', 'a', 'e', 'dp']) c[k] += l[k];
		by.set(l.pos, c);
	}
	return [...by.values()]
		.map((c) => ({ ...c, fpct: c.po + c.a + c.e > 0 ? (c.po + c.a) / (c.po + c.a + c.e) : null }))
		.sort((a, b) => POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos));
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = (iso) => {
	const [y, m, d] = iso.split('-').map(Number);
	return `${MONTHS[m - 1]} ${d}, ${y}`;
};

function bioText(bio) {
	if (!bio) return '';
	const bits = [];
	if (bio.born) bits.push(`Born ${longDate(bio.born)}${bio.birthplace ? `, ${bio.birthplace}` : ''}`);
	if (bio.died) bits.push(`Died ${longDate(bio.died)}`);
	if (bio.bats || bio.throws) bits.push(`Bats ${bio.bats || '?'}, throws ${bio.throws || '?'}`);
	if (bio.height) bits.push(`${Math.floor(bio.height / 12)}-${bio.height % 12}${bio.weight ? `, ${bio.weight} lb` : ''}`);
	if (bio.debut) bits.push(`MLB debut ${longDate(bio.debut)}`);
	return bits.join(' · ');
}

async function init() {
	try {
		const res = await fetch(`/api/player/${encodeURIComponent(id)}`);
		if (res.status === 404) {
			tables.innerHTML = '<p class="record-empty">No Brewers stats for this player.</p>';
			return;
		}
		if (!res.ok) throw new Error(`player ${res.status}`);
		const p = await res.json();
		const span = p.first === p.last ? `${p.first}` : `${p.first}–${p.last}`;
		document.title = `${p.name} — Milwaukee Brewers Stats`;
		document.getElementById('player-name').textContent = p.name;
		document.getElementById('player-subtitle').innerHTML =
			`Milwaukee Brewers · ${span} · ${p.seasons} season${p.seasons === 1 ? '' : 's'}${p.bio?.hof ? ' · <span class="player-hof">Hall of Fame</span>' : ''}`;
		document.getElementById('player-bio').textContent = bioText(p.bio);

		const sections = [];
		const batted = p.batting.length > 0;
		const pitched = p.pitching.length > 0;
		const bat = batted ? tableHtml('Batting', [SEASON_COLUMN('batting'), ...BATTING_COLUMNS], p.batting, p.career.batting) : '';
		const pit = pitched ? tableHtml('Pitching', [SEASON_COLUMN('pitching'), ...PITCHING_COLUMNS], p.pitching, p.career.pitching) : '';
		// A pitcher's page leads with pitching: more innings than a quarter of
		// his plate appearances is a pitcher who batted, not the reverse.
		const pitcherFirst = pitched && (!batted || p.career.pitching.ipouts / 3 > p.career.batting.pa / 4);
		sections.push(...(pitcherFirst ? [pit, bat] : [bat, pit]));
		if (p.fielding.length) {
			const rows = [...p.fielding].sort((a, b) => a.season - b.season || POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos));
			const career = fieldingCareer(p.fielding);
			const cols = [SEASON_COLUMN('fielding'), ...FIELDING_COLUMNS];
			sections.push(tableHtml('Fielding', cols, rows, null)
				.replace('</tbody>', `</tbody><tfoot>${career.map((c) => `<tr class="player-career">${[CAREER_LABEL, ...cols.slice(1)].map((col) => cellHtml(col, c)).join('')}</tr>`).join('')}</tfoot>`));
		}
		tables.innerHTML = sections.filter(Boolean).join('');

		const share = document.getElementById('player-share');
		share.innerHTML = labeledShareButtonsHtml('footer-share-item');
		wireShareRow(share, `${p.name} with the Milwaukee Brewers, ${span}, season by season.`, `${window.location.origin}/player/${p.id}`);
		wireShareDropdown();
	} catch (e) {
		tables.innerHTML = '<p class="record-empty">Could not load this player. Try again later.</p>';
		console.error(e);
	}
}

init();
