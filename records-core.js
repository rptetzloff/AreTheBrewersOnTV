// Shared (browser + node) computation of Brewers records/superlatives from
// Retrosheet data (gameinfo.csv + CurrentNames.csv). Pure functions only — no fs/fetch/DOM.

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

// CurrentNames.csv columns: franchiseName,teamName,league,division,city,team,alternate,startDate,endDate,...
// teamName = period-specific abbreviation used as the primary lookup key.
// franchiseName and alternate are indexed too so Retrosheet franchise codes
// (e.g. CHN, NYN, NYA) resolve even when the period teamName differs.
export function parseCurrentNamesCsv(raw) {
	const names = {};
	const lines = raw.trim().split('\n');
	const headers = splitCsvLine(lines[0]);
	const franIdx = headers.indexOf('franchiseName');
	const keyIdx = headers.indexOf('teamName');
	const cityIdx = headers.indexOf('city');
	const nickIdx = headers.indexOf('team');
	const altIdx = headers.indexOf('alternate');
	for (const line of lines.slice(1)) {
		const p = splitCsvLine(line);
		const id = p[keyIdx]?.trim();
		const city = p[cityIdx]?.trim();
		const nick = p[nickIdx]?.trim();
		if (id && city && nick) {
			const display = `${city} ${nick}`;
			names[id] = display;
			// Also index by franchiseName (first occurrence wins — later rows of the same
			// franchise would overwrite the historical display name with a modern one).
			const fran = franIdx >= 0 ? p[franIdx]?.trim() : '';
			if (fran && fran !== id && !names[fran]) names[fran] = display;
			// Also index by alternate abbreviation (first occurrence wins).
			const alt = altIdx >= 0 ? p[altIdx]?.trim() : '';
			if (alt && alt !== id && !names[alt]) names[alt] = display;
		}
	}
	return names;
}

// Brewers Retrosheet team IDs across all seasons.
export const BREWERS_IDS = new Set(['MIL', 'SEA']); // SEA = Seattle Pilots, 1969

// Retrosheet uses league-suffix codes and historical codes that may not appear
// in CurrentNames.csv with a matching teamName. This covers all codes the
// Brewers have faced since 1969 (AL 1969–1997, NL 1998+, interleague).
const RETROSHEET_TEAM_NAMES = {
	// NL teams — Retrosheet appends 'N' for NL
	CHN: 'Chicago Cubs', NYN: 'New York Mets', SFN: 'San Francisco Giants',
	SDN: 'San Diego Padres', SLN: 'St. Louis Cardinals', LAN: 'Los Angeles Dodgers',
	MON: 'Montreal Expos', FLO: 'Florida Marlins', MIA: 'Miami Marlins',
	ARI: 'Arizona Diamondbacks', COL: 'Colorado Rockies',
	ATL: 'Atlanta Braves', HOU: 'Houston Astros', PHI: 'Philadelphia Phillies',
	PIT: 'Pittsburgh Pirates', CIN: 'Cincinnati Reds',
	// AL teams — Retrosheet appends 'A' for AL
	NYA: 'New York Yankees', CHA: 'Chicago White Sox', KCA: 'Kansas City Royals',
	BOS: 'Boston Red Sox', BAL: 'Baltimore Orioles', CLE: 'Cleveland Guardians',
	DET: 'Detroit Tigers', MIN: 'Minnesota Twins', OAK: 'Oakland Athletics',
	SEA: 'Seattle Mariners', TEX: 'Texas Rangers', TOR: 'Toronto Blue Jays',
	TBA: 'Tampa Bay Rays', TBD: 'Tampa Bay Devil Rays',
	LAA: 'Los Angeles Angels',
	// Historical names / franchise eras
	ANA: 'Anaheim Angels', CAL: 'California Angels',
	WAS: 'Washington Senators', WAS1: 'Washington Senators',
	KC1: 'Kansas City Athletics',
};

// Convert gameinfo.csv rows + CurrentNames.csv into the internal game-row format
// used throughout records-core, h2h-core, etc.
// teamstatsRaw is optional: its gametype column is used ONLY when it identifies
// a known playoff type (D/L/W/F/C), so that regular season games (however
// teamstats encodes them) always default to 'R'.
export function parseGameinfoCsv(gamesRaw, namesRaw, teamstatsRaw = null) {
	const teamNames = parseCurrentNamesCsv(namesRaw);

	// Build gid→gametype from teamstats, but only retain known playoff codes.
	// teamstats uses full-word values: 'regular' for regular season, and words
	// like 'division', 'lcs', 'worldseries', 'wildcard' for postseason games.
	// We treat anything that is NOT a regular-season indicator as a playoff game.
	const tsPlayoff = new Set(); // gids confirmed as playoff by teamstats
	const tsWorldSeries = new Set();
	if (teamstatsRaw) {
		const tsLines = teamstatsRaw.trim().split('\n');
		const tsH = splitCsvLine(tsLines[0]);
		const gidI = tsH.indexOf('gid'), gtI = tsH.indexOf('gametype');
		if (gidI >= 0 && gtI >= 0) {
			for (const line of tsLines.slice(1)) {
				const v = splitCsvLine(line);
				const gid = v[gidI]?.trim();
				const gt = (v[gtI]?.trim() || '').toUpperCase();
				if (!gid) continue;
				// Regular-season identifiers (letter 'R', word 'REGULAR', numeric '0')
				const isRegular = !gt || gt === 'R' || gt === 'REGULAR' || gt === '0' || gt === 'RS';
				if (!isRegular) {
					tsPlayoff.add(gid);
					if (gt === 'W' || gt === 'WS' || gt === 'WORLDSERIES' || gt === 'WORLD SERIES' || gt.includes('WORLD')) {
						tsWorldSeries.add(gid);
					}
				}
			}
		}
	}
	const rows = parseGamesCsv(gamesRaw);

	return rows
		.filter((r) => BREWERS_IDS.has(r.hometeam) || BREWERS_IDS.has(r.visteam))
		.map((r) => {
			const isHome = BREWERS_IDS.has(r.hometeam);
			const opponentId = isHome ? r.visteam : r.hometeam;
			const opponentName = teamNames[opponentId] || RETROSHEET_TEAM_NAMES[opponentId] || opponentId;

			const vr = r.vruns !== '' ? parseInt(r.vruns, 10) : NaN;
			const hr = r.hruns !== '' ? parseInt(r.hruns, 10) : NaN;
			const brewersScore = isHome ? hr : vr;
			const opponentScore = isHome ? vr : hr;

			let result = '';
			if (r.wteam && BREWERS_IDS.has(r.wteam)) result = 'WIN';
			else if (r.lteam && BREWERS_IDS.has(r.lteam)) result = 'LOSS';
			else if (!isNaN(vr) && !isNaN(hr) && vr === hr) result = 'TIE';

			// Convert YYYYMMDD → YYYY-MM-DD
			const rawDate = r.date || '';
			const isoDate = /^\d{8}$/.test(rawDate)
				? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
				: rawDate;

			// gameinfo.csv often lacks gametype; teamstats confirms known playoff gids.
			// Normalize full-word values (e.g. 'regular' → 'R', 'worldseries' → 'W').
			const rawGt = (r.gametype || '').toUpperCase().trim();
			const normGt = rawGt === 'REGULAR' || rawGt === 'RS' || rawGt === '0' ? 'R' : rawGt;
			const gt = normGt || (tsPlayoff.has(r.gid) ? (tsWorldSeries.has(r.gid) ? 'W' : 'D') : 'R');
			const regularSeason = gt === 'R' ? '1' : '0';
			const playoff = ['D', 'L', 'W', 'F', 'C'].includes(gt) ? '1' : '0';
			const worldseries = gt === 'W' ? r.season : '';

			return {
				gid: r.gid || '',
				date: isoDate,
				season: r.season,
				regular_season: regularSeason,
				playoff,
				worldseries,
				Opponent: opponentName,
				'Brewers Win': result,
				brewers_score: isNaN(brewersScore) ? '' : String(brewersScore),
				opponent_score: isNaN(opponentScore) ? '' : String(opponentScore),
				location: isHome ? 'home' : 'away',
			};
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

// A season labelled Y runs from April through October; by December 1 it is over.
const seasonSettled = (yr, now) =>
	now.getFullYear() > yr || (now.getFullYear() === yr && now.getMonth() >= 11);

// rows: parsed CSV rows. Returns { seasonRange, bestStarts, perfectSeasons,
// winStreaks, worstStarts, lopsidedWins } — each list sorted best-first,
// trimmed to `top`. Streaks/starts/perfect seasons are regular season only;
// ties end win streaks (record-book convention). Lopsided wins include
// playoffs, flagged.
export function computeSuperlatives(rows, { top = 5, now = new Date() } = {}) {
	const games = rows
		.filter((r) => RESULTS.has(r['Brewers Win']))
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
				if (g['Brewers Win'] === result) n++;
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
			if (g['Brewers Win'] === 'WIN') w++;
			else if (g['Brewers Win'] === 'LOSS') l++;
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
		if (g['Brewers Win'] === 'WIN') {
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
		const pf = parseInt(g.brewers_score, 10) || 0;
		const pa = parseInt(g.opponent_score, 10) || 0;
		return {
			date: g.date, season: parseInt(g.season, 10), opponent: g.Opponent,
			pf, pa,
			playoff: g.regular_season !== '1',
			worldseries: !!(g.worldseries && g.worldseries.trim()),
		};
	};

	// Biggest margins, either direction; sort by margin, then winner's score, then date.
	const lopsided = (result) => games
		.filter((g) => g['Brewers Win'] === result)
		.map(gameInfo)
		.sort((a, b) => Math.abs(b.pf - b.pa) - Math.abs(a.pf - a.pa)
			|| Math.max(b.pf, b.pa) - Math.max(a.pf, a.pa)
			|| (a.date < b.date ? -1 : 1))
		.slice(0, top);

	// Every tie ever, not a top-N list; newest first.
	const ties = games.filter((g) => g['Brewers Win'] === 'TIE').map(gameInfo).reverse();

	return {
		seasonRange, bestStarts, perfectSeasons, winStreaks: topStreaks, worstStarts,
		lopsidedWins: lopsided('WIN'), lopsidedLosses: lopsided('LOSS'), ties,
	};
}

export const streakSpan = (s) =>
	s.startSeason === s.endSeason ? String(s.startSeason) : `${s.startSeason}–${s.endSeason}`;

// One entry per season, chronological: record, win% (ties count half), and
// runs for/against, plus championship/undefeated flags for chart markers.
// `playoffs: true` folds postseason games into the record/runs; the
// champion and undefeated flags always use their own rules regardless.
export function computeSeasonHistory(rows, { now = new Date(), playoffs = false } = {}) {
	const games = rows
		.filter((r) => ['WIN', 'LOSS', 'TIE'].includes(r['Brewers Win']))
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
		let worldseries = false;
		for (const g of bySeason.get(yr)) {
			const isReg = g.regular_season === '1';
			if (!isReg) {
				lastPlayoff = g;
				if (g.worldseries && g.worldseries.trim() && g['Brewers Win'] === 'WIN') worldseries = true;
			}
			if (isReg) {
				if (g['Brewers Win'] === 'WIN') regWins++;
				else if (g['Brewers Win'] === 'LOSS') regLosses++;
			}
			if (!isReg && !playoffs) continue;
			if (g['Brewers Win'] === 'WIN') w++;
			else if (g['Brewers Win'] === 'LOSS') l++;
			else t++;
			pf += parseInt(g.brewers_score, 10) || 0;
			pa += parseInt(g.opponent_score, 10) || 0;
		}
		const gamesPlayed = w + l + t;
		return {
			season: yr,
			wins: w, losses: l, ties: t,
			record: rec(w, l, t),
			winPct: gamesPlayed ? (w + t / 2) / gamesPlayed : 0,
			pf, pa,
			champion: lastPlayoff !== null && lastPlayoff['Brewers Win'] === 'WIN',
			worldseries,
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
		title: `Brewers Season-by-Season History, ${first}–${last}`,
		desc: `Every Milwaukee Brewers season since ${first} in one chart: ${titles} championships and ${winning} winning seasons across ${history.length} years.`,
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
				title: `Best Brewers Season Starts — ${b.games}–0 in ${b.season}`,
				desc: `The best start in Milwaukee Brewers history: ${b.games}–0 to open the ${b.season} season. Top ${data.bestStarts.length} starts, ${range}.`,
			};
		}
		case 'perfect-seasons': {
			const p = data.perfectSeasons[0];
			return {
				title: p ? `Perfect Brewers Seasons — ${p.record} in ${p.season}` : 'Perfect Brewers Seasons',
				desc: p
					? `Seasons the Milwaukee Brewers finished without a loss: ${data.perfectSeasons.map((x) => `${x.record} in ${x.season}`).join(', ')}.`
					: 'No Brewers season has finished without a loss. Yet.',
			};
		}
		case 'win-streaks': {
			const s = data.winStreaks[0];
			return {
				title: `Longest Brewers Win Streaks — ${s.games} straight (${streakSpan(s)})`,
				desc: `The longest regular-season win streak in Milwaukee Brewers history: ${s.games} straight, ${formatDate(s.startDate)} to ${formatDate(s.endDate)}.`,
			};
		}
		case 'worst-starts': {
			const w = data.worstStarts[0];
			return {
				title: `Worst Brewers Season Starts — 0–${w.games} in ${w.season}`,
				desc: `The worst start in Milwaukee Brewers history: 0–${w.games} to open the ${w.season} season. It happens to the best of us.`,
			};
		}
		case 'lopsided-wins': {
			const g = data.lopsidedWins[0];
			return {
				title: `Most Lopsided Brewers Wins — ${g.pf}–${g.pa} over the ${g.opponent}`,
				desc: `The biggest blowout in Milwaukee Brewers history: ${g.pf}–${g.pa} over the ${g.opponent} on ${formatDate(g.date)}.`,
			};
		}
		case 'worst-losses': {
			const g = data.lopsidedLosses[0];
			return {
				title: `Worst Brewers Losses — ${g.pf}–${g.pa} to the ${g.opponent}`,
				desc: `The most lopsided loss in Milwaukee Brewers history: ${g.pa}–${g.pf} to the ${g.opponent} on ${formatDate(g.date)}. We don't talk about it.`,
			};
		}
		case 'ties': {
			const t = data.ties[0];
			if (!t) return { title: 'Brewers Ties', desc: 'The Brewers have never tied a game.' };
			return {
				title: `Brewers Ties — ${data.ties.length} all-time`,
				desc: `The Brewers have played ${data.ties.length} ties. Most recent: ${t.pf}–${t.pa} vs the ${t.opponent} on ${formatDate(t.date)}.`,
			};
		}
		default:
			return {
				title: 'Brewers Records & Superlatives',
				desc: `Best starts, perfect seasons, longest win streaks, worst starts, lopsided wins, worst losses, and every tie — Milwaukee Brewers, ${range}.`,
			};
	}
}

export const RECORD_SLUGS = ['best-starts', 'perfect-seasons', 'win-streaks', 'worst-starts', 'lopsided-wins', 'worst-losses', 'ties'];
