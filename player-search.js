// Player search: type part of a name, pick a Brewer, land on his page. The
// list of every Brewer (/api/players, about 1,100, 85KB) loads on first use.
//
// matchPlayers is pure and exported so the tests can pin the ranking;
// mountPlayerSearch builds the box and touches the DOM only when called.

/** Lowercase, accents and punctuation gone: "Núñez" and "B.J." match "nunez"
 *  and "bj". */
export const fold = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

/** The best `n` matches for a query, ranked: a word of the name is the query
 *  ("robin", "cc"), then a word starts with it ("yel"), then every word of
 *  it starts some word of the name ("molitor p"), then the name merely
 *  contains it. Within a rank, the longer Brewers career first.
 *
 *  Surname-first ranking was tried and put Ron Robinson (three seasons)
 *  above Robin Yount for "robin": a whole-word match is the stronger signal,
 *  whichever word it is. */
export function matchPlayers(players, query, n = 8) {
	const q = fold(query);
	if (!q) return [];
	const words = q.split(' ');
	const ranked = [];
	for (const p of players) {
		const name = p._fold || (p._fold = fold(p.name));
		const parts = name.split(' ');
		let rank;
		if (name === q || parts.includes(q)) rank = 0;
		else if (parts.some((part) => part.startsWith(q)) || name.startsWith(q)) rank = 1;
		else if (words.every((w) => parts.some((part) => part.startsWith(w)))) rank = 2;
		else if (name.includes(q)) rank = 3;
		else continue;
		ranked.push({ p, rank });
	}
	return ranked
		.sort((a, b) => a.rank - b.rank || (b.p.last - b.p.first) - (a.p.last - a.p.first) || a.p.name.localeCompare(b.p.name))
		.slice(0, n)
		.map((r) => r.p);
}

let directory = null;
const loadDirectory = () => (directory ||= fetch('/api/players').then((r) => (r.ok ? r.json() : [])).catch(() => []));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const span = (p) => (p.first === p.last ? `${p.first}` : `${p.first}–${p.last}`);

/** Build the search box inside `host`. Picking a player opens his page,
 *  unless `onPick` is given (the compare page adds him instead). */
export function mountPlayerSearch(host, { onPick = null, placeholder = 'Find a Brewer…' } = {}) {
	host.classList.add('player-search');
	host.innerHTML = `
		<i class="mdi mdi-magnify player-search-icon" aria-hidden="true"></i>
		<input type="search" class="player-search-input" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false"
			role="combobox" aria-label="${esc(placeholder.replace(/…$/, ''))}" aria-autocomplete="list" aria-expanded="false" aria-controls="player-search-list">
		<ul id="player-search-list" class="player-search-list" role="listbox" hidden></ul>`;
	const input = host.querySelector('input');
	const list = host.querySelector('ul');
	let results = [];
	let active = -1;

	const go = (p) => {
		if (!onPick) { window.location.href = `/player/${encodeURIComponent(p.id)}`; return; }
		onPick(p);
		input.value = '';
		close();
	};
	const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
	const highlight = (i) => {
		active = i;
		[...list.children].forEach((li, j) => li.setAttribute('aria-selected', String(j === i)));
		if (i >= 0) input.setAttribute('aria-activedescendant', `player-search-opt-${i}`);
		else input.removeAttribute('aria-activedescendant');
	};
	const render = async () => {
		const all = await loadDirectory();
		results = matchPlayers(all, input.value);
		if (!input.value.trim()) return close();
		list.innerHTML = results.length
			? results.map((p, i) => `<li id="player-search-opt-${i}" role="option" aria-selected="false" data-i="${i}">
				<span class="player-search-name">${esc(p.name)}</span>
				<span class="player-search-meta">${p.pitcher ? 'P · ' : ''}${span(p)}</span></li>`).join('')
			: '<li class="player-search-none" role="option" aria-disabled="true">No Brewer by that name</li>';
		list.hidden = false;
		input.setAttribute('aria-expanded', 'true');
		highlight(results.length ? 0 : -1);
	};

	input.addEventListener('focus', loadDirectory, { once: true });
	input.addEventListener('input', render);
	input.addEventListener('keydown', (e) => {
		if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); highlight((active + 1) % results.length); }
		else if (e.key === 'ArrowUp' && results.length) { e.preventDefault(); highlight((active - 1 + results.length) % results.length); }
		else if (e.key === 'Enter' && results[active]) { e.preventDefault(); go(results[active]); }
		else if (e.key === 'Escape') close();
	});
	// mousedown, not click: click fires after the input's blur has closed the list.
	list.addEventListener('mousedown', (e) => {
		const li = e.target.closest('li[data-i]');
		if (li) { e.preventDefault(); go(results[Number(li.dataset.i)]); }
	});
	input.addEventListener('blur', () => setTimeout(close, 100));
}
