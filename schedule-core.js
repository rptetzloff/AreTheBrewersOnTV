// The home page's schedule as compact rows: one line a game — date,
// opponent, result or start time, TV — under month headings, with a chip a
// month to jump the list. The season used to be a card a game, ~110px each,
// 210 of them in a 400px box: about 23,000px of scrolling in a small window.
// Pure functions — no fetch/DOM — so the rows can be tested; main.js builds
// the row objects from ESPN's schedule or Retrosheet's games and wires the
// clicks.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "2026-10" for a Date, in the viewer's own time zone (a 9 PM game on the
 *  last of the month is that month, not the next one in UTC). */
export const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthIndex = (key) => Number(key.slice(5, 7)) - 1;
export const monthName = (key) => `${MONTHS[monthIndex(key)]} ${key.slice(0, 4)}`;
export const monthShort = (key) => SHORT[monthIndex(key)];

/**
 * One game's row. `row` is
 *   { key, date: Date, opp, home, state, text, tv: [labels], clickable, title }
 * where state is 'win' | 'loss' | 'tie' | 'live' | 'next' | 'upcoming' |
 * 'postponed', and text the result ("W 6-2"), the score of a live game, or
 * the start time. `key` becomes data-key (and the id, for Retrosheet's g-<gid>
 * anchors when given as `anchor`).
 */
export function scheduleRowHtml(row) {
	const d = row.date;
	const when = `<span class="sched-dow">${DOW[d.getDay()]}</span> ${SHORT[d.getMonth()]} ${d.getDate()}`;
	const tv = (row.tv || []).filter(Boolean);
	const attrs = [
		`class="sched-row sched-${esc(row.state)}${row.clickable ? ' sched-click' : ''}"`,
		`data-key="${esc(row.key)}"`,
		row.anchor ? `id="${esc(row.anchor)}"` : '',
		row.clickable ? 'role="button" tabindex="0"' : '',
		row.title ? `title="${esc(row.title)}"` : '',
	].filter(Boolean).join(' ');
	return `<div ${attrs}>`
		+ `<span class="sched-date">${when}</span>`
		+ `<span class="sched-opp">${row.home ? 'vs' : '@'} ${esc(row.opp)}</span>`
		+ `<span class="sched-out">${row.state === 'live' ? '<span class="live-indicator-small"></span>' : ''}${esc(row.text)}</span>`
		+ `<span class="sched-tv">${esc(tv.join(' · '))}</span>`
		+ '</div>';
}

/** The list: phase labels where the phase changes (Preseason, Regular
 *  Season, Playoffs...), and each month's games in a group under its
 *  heading. The heading sticks to the top while its own group scrolls by;
 *  as siblings in one list, the headings stuck on top of one another
 *  instead ("September" showing through "October"). `rows` are
 *  scheduleRowHtml's objects plus `phase`, in date order. */
export function scheduleListHtml(rows, phaseLabels = {}) {
	let phase = null;
	let month = null;
	const out = [];
	const close = () => { if (month) out.push('</section>'); };
	for (const r of rows) {
		if (r.phase && r.phase !== phase) {
			close();
			phase = r.phase;
			out.push(`<div class="season-divider">${esc(phaseLabels[phase] || phase)}</div>`);
			month = null; // the first month of a phase is named under its label
		}
		const m = monthKey(r.date);
		if (m !== month) {
			close();
			month = m;
			out.push(`<section class="sched-group" data-month="${m}"><div class="sched-month">${esc(monthName(m))}</div>`);
		}
		out.push(scheduleRowHtml(r));
	}
	close();
	return out.join('');
}

/** A chip a month, in order, the active one marked. */
export function monthChipsHtml(rows, active = null) {
	const keys = [...new Set(rows.map((r) => monthKey(r.date)))];
	if (keys.length < 2) return '';
	return keys.map((k) => `<button type="button" class="sched-chip${k === active ? ' active' : ''}" data-month="${k}" aria-label="${esc(monthName(k))}">${esc(monthShort(k))}</button>`).join('');
}
