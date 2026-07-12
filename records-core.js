// Shared (browser + node) computation of Packers records/superlatives from
// data/packers_games.csv. Pure functions only — no fs/fetch/DOM.

export function splitCsvLine(line) {
	const out = []; let cur = ''; let q = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
		else if (ch === ',' && !q) { out.push(cur); cur = ''; }
		else cur += ch;
	}
	out.push(cur);
	return out.map((s) => s.trim());
}

export function parseGamesCsv(raw) {
	const lines = raw.trim().split('\n');
	const headers = splitCsvLine(lines[0]);
	return lines.slice(1).map((l) => {
		const v = splitCsvLine(l); const o = {};
		headers.forEach((h, i) => { o[h] = v[i] ?? ''; });
		return o;
	});
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 'YYYY-MM-DD' -> 'Oct 23, 1966' without Date() timezone pitfalls.
export function formatDate(iso) {
	const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
	return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export const rec = (w, l, t) => (t > 0 ? `${w}–${l}–${t}` : `${w}–${l}`);

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const RESULTS = new Set(['WIN', 'LOSS', 'TIE']);

// A season labelled Y runs into Jan/Feb of Y+1; by March 1 of Y+1 it is over.
// Guards "perfect season" claims against the mid-season CSV updates the weekly
// data workflow commits (an unbeaten October team hasn't finished anything).
const seasonSettled = (yr, now) =>
	now.getFullYear() > yr + 1 || (now.getFullYear() === yr + 1 && now.getMonth() >= 2);

// rows: parsed CSV rows. Returns { seasonRange, bestStarts, perfectSeasons,
// winStreaks, worstStarts, lopsidedWins } — each list sorted best-first,
// trimmed to `top`. Streaks/starts/perfect seasons are regular season only;
// ties end win streaks (record-book convention). Lopsided wins include
// playoffs, flagged.
export function computeSuperlatives(rows, { top = 5, now = new Date() } = {}) {
	const games = rows
		.filter((r) => RESULTS.has(r['Packers Win']))
		.slice()
		.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
	const regular = games.filter((r) => r.regular_season === '1');

	const seasons = new Map(); // year -> chronological regular-season games
	for (const g of regular) {
		const yr = parseInt(g.season, 10);
		if (!seasons.has(yr)) seasons.set(yr, []);
		seasons.get(yr).push(g);
	}
	const years = [...seasons.keys()].sort((a, b) => a - b);
	const seasonRange = { first: years[0], last: years[years.length - 1] };

	// Leading run of `result` games to open each season.
	const seasonStarts = (result) => {
		const out = [];
		for (const yr of years) {
			let n = 0;
			for (const g of seasons.get(yr)) {
				if (g['Packers Win'] === result) n++;
				else break;
			}
			if (n > 0) out.push({ season: yr, games: n });
		}
		return out.sort((a, b) => b.games - a.games || a.season - b.season).slice(0, top);
	};
	const bestStarts = seasonStarts('WIN');
	const worstStarts = seasonStarts('LOSS');

	const perfectSeasons = [];
	for (const yr of years) {
		let w = 0, l = 0, t = 0;
		for (const g of seasons.get(yr)) {
			if (g['Packers Win'] === 'WIN') w++;
			else if (g['Packers Win'] === 'LOSS') l++;
			else t++;
		}
		if (l === 0 && w > 0 && seasonSettled(yr, now)) perfectSeasons.push({ season: yr, wins: w, record: rec(w, l, t) });
	}
	perfectSeasons.sort((a, b) => b.wins - a.wins || a.season - b.season);

	// Regular-season win streaks, allowed to span seasons; a loss or tie ends one.
	const winStreaks = [];
	let run = null;
	const endRun = () => { if (run) { winStreaks.push(run); run = null; } };
	for (const g of regular) {
		if (g['Packers Win'] === 'WIN') {
			if (!run) run = { games: 0, start: null, end: null };
			run.games++;
			if (!run.start) run.start = g;
			run.end = g;
		} else {
			endRun();
		}
	}
	endRun();
	const streakEntry = (s) => ({
		games: s.games,
		startDate: s.start.date, endDate: s.end.date,
		startSeason: parseInt(s.start.season, 10), endSeason: parseInt(s.end.season, 10),
	});
	const topStreaks = winStreaks
		.sort((a, b) => b.games - a.games || (a.start.date < b.start.date ? -1 : 1))
		.slice(0, top)
		.map(streakEntry);

	const gameInfo = (g) => {
		const pf = parseInt(g.packers_score, 10) || 0;
		const pa = parseInt(g.opponent_score, 10) || 0;
		return {
			date: g.date, season: parseInt(g.season, 10), opponent: g.Opponent,
			pf, pa,
			playoff: g.regular_season !== '1',
			superbowl: !!(g.superbowl && g.superbowl.trim()),
		};
	};

	// Biggest margins, either direction; sort by margin, then winner's score, then date.
	const lopsided = (result) => games
		.filter((g) => g['Packers Win'] === result)
		.map(gameInfo)
		.sort((a, b) => Math.abs(b.pf - b.pa) - Math.abs(a.pf - a.pa)
			|| Math.max(b.pf, b.pa) - Math.max(a.pf, a.pa)
			|| (a.date < b.date ? -1 : 1))
		.slice(0, top);

	// Every tie ever, not a top-N list; newest first.
	const ties = games.filter((g) => g['Packers Win'] === 'TIE').map(gameInfo).reverse();

	return {
		seasonRange, bestStarts, perfectSeasons, winStreaks: topStreaks, worstStarts,
		lopsidedWins: lopsided('WIN'), lopsidedLosses: lopsided('LOSS'), ties,
	};
}

export const streakSpan = (s) =>
	s.startSeason === s.endSeason ? String(s.startSeason) : `${s.startSeason}–${s.endSeason}`;

// The 1929-31 titles were awarded on standings — no championship game to win.
// Every later title (NFL Championships and Super Bowls) is "won the season's
// final playoff game".
const STANDINGS_TITLES = new Set([1929, 1930, 1931]);

// One entry per season, chronological: record, win% (ties count half), and
// points for/against, plus championship/undefeated flags for chart markers.
// `playoffs: true` folds postseason games into the record/points; the
// champion and undefeated flags always use their own rules regardless.
export function computeSeasonHistory(rows, { now = new Date(), playoffs = false } = {}) {
	const games = rows
		.filter((r) => ['WIN', 'LOSS', 'TIE'].includes(r['Packers Win']))
		.slice()
		.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
	const bySeason = new Map();
	for (const g of games) {
		const yr = parseInt(g.season, 10);
		if (!bySeason.has(yr)) bySeason.set(yr, []);
		bySeason.get(yr).push(g);
	}
	return [...bySeason.keys()].sort((a, b) => a - b).map((yr) => {
		let w = 0, l = 0, t = 0, pf = 0, pa = 0, regLosses = 0, regWins = 0;
		let lastPlayoff = null;
		let superbowl = false;
		for (const g of bySeason.get(yr)) {
			const isReg = g.regular_season === '1';
			if (!isReg) {
				lastPlayoff = g;
				if (g.superbowl && g.superbowl.trim() && g['Packers Win'] === 'WIN') superbowl = true;
			}
			if (isReg) {
				if (g['Packers Win'] === 'WIN') regWins++;
				else if (g['Packers Win'] === 'LOSS') regLosses++;
			}
			if (!isReg && !playoffs) continue;
			if (g['Packers Win'] === 'WIN') w++;
			else if (g['Packers Win'] === 'LOSS') l++;
			else t++;
			pf += parseInt(g.packers_score, 10) || 0;
			pa += parseInt(g.opponent_score, 10) || 0;
		}
		const gamesPlayed = w + l + t;
		return {
			season: yr,
			wins: w, losses: l, ties: t,
			record: rec(w, l, t),
			winPct: gamesPlayed ? (w + t / 2) / gamesPlayed : 0,
			pf, pa,
			champion: STANDINGS_TITLES.has(yr) || (lastPlayoff !== null && lastPlayoff['Packers Win'] === 'WIN'),
			superbowl,
			undefeated: regLosses === 0 && regWins > 0 && seasonSettled(yr, now),
		};
	});
}

// Meta copy for the /history page, shared by server OG meta and client share.
export function historyCopy(history) {
	const first = history[0].season, last = history[history.length - 1].season;
	const titles = history.filter((s) => s.champion).length;
	const winning = history.filter((s) => s.winPct > 0.5).length;
	return {
		title: `Packers Season-by-Season History, ${first}–${last}`,
		desc: `Every Green Bay Packers season since ${first} in one chart: ${titles} championships and ${winning} winning seasons across ${history.length} years.`,
	};
}

// Per-card copy shared by server OG meta and client share messages.
// slug 'overview' covers the /records landing URL.
export function recordsCopy(slug, data) {
	const range = `${data.seasonRange.first}–${data.seasonRange.last}`;
	switch (slug) {
		case 'best-starts': {
			const b = data.bestStarts[0];
			return {
				title: `Best Packers Season Starts — ${b.games}–0 in ${b.season}`,
				desc: `The best start in Green Bay Packers history: ${b.games}–0 to open the ${b.season} season. Top ${data.bestStarts.length} starts, ${range}.`,
			};
		}
		case 'perfect-seasons': {
			const p = data.perfectSeasons[0];
			return {
				title: p ? `Perfect Packers Seasons — ${p.record} in ${p.season}` : 'Perfect Packers Seasons',
				desc: p
					? `Seasons the Green Bay Packers finished without a loss: ${data.perfectSeasons.map((x) => `${x.record} in ${x.season}`).join(', ')}.`
					: 'No Packers season has finished without a loss. Yet.',
			};
		}
		case 'win-streaks': {
			const s = data.winStreaks[0];
			return {
				title: `Longest Packers Win Streaks — ${s.games} straight (${streakSpan(s)})`,
				desc: `The longest regular-season win streak in Green Bay Packers history: ${s.games} straight, ${formatDate(s.startDate)} to ${formatDate(s.endDate)}.`,
			};
		}
		case 'worst-starts': {
			const w = data.worstStarts[0];
			return {
				title: `Worst Packers Season Starts — 0–${w.games} in ${w.season}`,
				desc: `The worst start in Green Bay Packers history: 0–${w.games} to open the ${w.season} season. It happens to the best of us.`,
			};
		}
		case 'lopsided-wins': {
			const g = data.lopsidedWins[0];
			return {
				title: `Most Lopsided Packers Wins — ${g.pf}–${g.pa} over the ${g.opponent}`,
				desc: `The biggest blowout in Green Bay Packers history: ${g.pf}–${g.pa} over the ${g.opponent} on ${formatDate(g.date)}.`,
			};
		}
		case 'worst-losses': {
			const g = data.lopsidedLosses[0];
			return {
				title: `Worst Packers Losses — ${g.pf}–${g.pa} to the ${g.opponent}`,
				desc: `The most lopsided loss in Green Bay Packers history: ${g.pa}–${g.pf} to the ${g.opponent} on ${formatDate(g.date)}. We don't talk about it.`,
			};
		}
		case 'ties': {
			const t = data.ties[0];
			if (!t) return { title: 'Packers Ties', desc: 'The Packers have never tied a game.' };
			return {
				title: `Packers Ties — ${data.ties.length} all-time`,
				desc: `The Packers have played ${data.ties.length} ties. Most recent: ${t.pf}–${t.pa} vs the ${t.opponent} on ${formatDate(t.date)}.`,
			};
		}
		default:
			return {
				title: 'Packers Records & Superlatives',
				desc: `Best starts, perfect seasons, longest win streaks, worst starts, lopsided wins, worst losses, and every tie — Green Bay Packers, ${range}.`,
			};
	}
}

export const RECORD_SLUGS = ['best-starts', 'perfect-seasons', 'win-streaks', 'worst-starts', 'lopsided-wins', 'worst-losses', 'ties'];
