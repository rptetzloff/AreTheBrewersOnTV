// Compare page: up to four Brewers side by side, each his Brewers career or
// one season, from /api/player/<id> (the same body the player page reads).
// The URL is the state — /compare?p=younr001-1982,yelic001-2018 — so a
// comparison can be shared; compare-core.js reads and writes it.
import { esc } from './records-core.js';
import { labeledShareButtonsHtml, wireShareRow, wireShareDropdown } from './share-core.js';
import { mountPlayerSearch } from './player-search.js';
import { parseSlots, slotsParam, slotLine, COMPARE_ROWS, bestIndexes, MAX_PLAYERS } from './compare-core.js';

const tables = document.getElementById('compare-tables');
const hint = document.getElementById('compare-hint');
const searchHost = document.getElementById('compare-search');

let slots = parseSlots(new URLSearchParams(window.location.search).get('p'));

// Each player is fetched once, however many columns he fills.
const players = new Map();
const load = (id) => {
	if (!players.has(id)) {
		players.set(id, fetch(`/api/player/${encodeURIComponent(id)}`)
			.then((r) => (r.ok ? r.json() : null))
			.catch(() => null));
	}
	return players.get(id);
};

const seasonsOf = (p) => [...new Set([...p.batting, ...p.pitching].map((l) => l.season))].sort((a, b) => a - b);
const span = (p) => (p.first === p.last ? `${p.first}` : `${p.first}–${p.last}`);
const label = (slot, p) => `${p.name} ${slot.season ? slot.season : `(${span(p)})`}`;
// "Yount" over "'82", or "Yount" over "career": a column heading that wraps
// to two short lines, so four columns fit a phone.
const shortName = (slot, p) => {
	const last = p.name.split(' ').slice(1).join(' ') || p.name;
	return `${esc(last)}<br><span class="compare-when">${slot.season ? `’${String(slot.season).slice(2)}` : 'career'}</span>`;
};

// A pitcher's column leads with pitching, as his page does: more innings
// than a quarter of his plate appearances.
const pitcherish = (slot, p) => {
	const pit = slotLine(p, slot.season, 'pitching');
	const bat = slotLine(p, slot.season, 'batting');
	return Boolean(pit) && (!bat || pit.ipouts / 3 > bat.pa / 4);
};

function slotCardHtml(slot, p, i) {
	if (!p) {
		return `<div class="compare-slot"><span class="compare-slot-name">${esc(slot.id)}</span>
			<span class="compare-slot-missing">No Brewers stats</span>
			<button type="button" class="compare-remove" data-i="${i}" aria-label="Remove">×</button></div>`;
	}
	const options = [`<option value=""${slot.season ? '' : ' selected'}>Career (${span(p)})</option>`,
		...seasonsOf(p).reverse().map((y) => `<option value="${y}"${slot.season === y ? ' selected' : ''}>${y}</option>`)];
	return `<div class="compare-slot">
		<a class="compare-slot-name" href="/player/${esc(p.id)}">${esc(p.name)}</a>
		<select class="stats-season-select compare-season" data-i="${i}" aria-label="${esc(p.name)}: career or season">${options.join('')}</select>
		<button type="button" class="compare-remove" data-i="${i}" aria-label="Remove ${esc(p.name)}">×</button>
	</div>`;
}

function sideTableHtml(side, data) {
	const lines = slots.map((s, i) => slotLine(data[i], s.season, side));
	if (lines.every((l) => !l)) return '';
	const head = slots.map((s, i) => `<th class="h2h-num" title="${data[i] ? esc(label(s, data[i])) : ''}">${data[i] ? shortName(s, data[i]) : '—'}</th>`).join('');
	const body = COMPARE_ROWS[side].map((row) => {
		const values = lines.map((l) => (l ? l[row.key] ?? null : null));
		const best = bestIndexes(values, row.better);
		const cells = lines.map((l, i) => {
			const v = values[i];
			const text = !l ? '—' : row.fmt ? row.fmt(v, l) : (v ?? 0).toLocaleString('en-US');
			return `<td class="h2h-num${best.has(i) ? ' compare-best' : ''}">${esc(text)}</td>`;
		}).join('');
		return `<tr><td title="${esc(row.title)}">${esc(row.label)}</td>${cells}</tr>`;
	}).join('');
	return `<section class="player-section">
		<h2 class="player-section-title">${side === 'batting' ? 'Batting' : 'Pitching'}</h2>
		<div class="h2h-table-wrap stats-table-wrap">
			<table class="h2h-table stats-table compare-table"><thead><tr><th>Stat</th>${head}</tr></thead><tbody>${body}</tbody></table>
		</div>
	</section>`;
}

function share(data) {
	const named = slots.map((s, i) => (data[i] ? label(s, data[i]) : null)).filter(Boolean);
	const el = document.getElementById('compare-share');
	el.innerHTML = labeledShareButtonsHtml('footer-share-item');
	wireShareRow(el, named.length ? `${named.join(' vs ')} — Milwaukee Brewers compared.` : 'Compare Milwaukee Brewers side by side.', window.location.href);
	wireShareDropdown();
}

async function render() {
	window.history.replaceState(null, '', slots.length ? `/compare?p=${slotsParam(slots)}` : '/compare');
	hint.hidden = slots.length > 0;
	const input = searchHost.querySelector('input');
	input.disabled = slots.length >= MAX_PLAYERS;
	input.placeholder = slots.length >= MAX_PLAYERS ? 'Four at a time — remove one to add another' : slots.length ? 'Add another Brewer…' : 'Add a Brewer…';
	if (!slots.length) {
		tables.innerHTML = '';
		document.title = 'Compare Brewers';
		share([]);
		return;
	}
	tables.innerHTML = '<div class="loading">Loading players...</div>';
	const data = await Promise.all(slots.map((s) => load(s.id)));
	const named = slots.map((s, i) => (data[i] ? label(s, data[i]) : null)).filter(Boolean);
	document.title = `${named.join(' vs ')} — Compare Brewers`;
	// Only the sides that apply: all pitchers compare pitching, all hitters
	// batting — a pitcher's few at-bats or a position player's mop-up inning
	// would be a mostly empty table. A mix gets both, batting first.
	const kinds = slots.map((s, i) => (data[i] ? pitcherish(s, data[i]) : null)).filter((k) => k !== null);
	const sides = kinds.length && kinds.every(Boolean) ? ['pitching']
		: kinds.every((k) => !k) ? ['batting']
		: ['batting', 'pitching'];
	tables.innerHTML = `<div class="compare-slots">${slots.map((s, i) => slotCardHtml(s, data[i], i)).join('')}</div>`
		+ (sides.map((side) => sideTableHtml(side, data)).join('') || '<p class="record-empty">Nothing to compare for these choices.</p>');
	share(data);
}

tables.addEventListener('change', (e) => {
	const sel = e.target.closest('select.compare-season');
	if (!sel) return;
	const i = Number(sel.dataset.i);
	const season = sel.value ? Number(sel.value) : null;
	// The same player and season twice says nothing new: leave it as it was.
	if (slots.some((s, j) => j !== i && s.id === slots[i].id && s.season === season)) { render(); return; }
	slots[i] = { ...slots[i], season };
	render();
});
tables.addEventListener('click', (e) => {
	const btn = e.target.closest('button.compare-remove');
	if (!btn) return;
	slots.splice(Number(btn.dataset.i), 1);
	render();
});

mountPlayerSearch(searchHost, {
	placeholder: 'Add a Brewer…',
	onPick: (p) => {
		if (slots.length >= MAX_PLAYERS) return;
		// Picking a player already shown as a career adds his last Brewers
		// season instead of a second copy of the career.
		const season = slots.some((s) => s.id === p.id && s.season === null) ? p.last : null;
		if (slots.some((s) => s.id === p.id && s.season === season)) return;
		slots.push({ id: p.id, season });
		render();
	},
});

render();
