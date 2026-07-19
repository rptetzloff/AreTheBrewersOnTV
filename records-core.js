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
// SE1 = Seattle Pilots (1969); MIL = Milwaukee Brewers (1970–present).
export const BREWERS_IDS = new Set(['MIL', 'SE1']);

// Playoff round depth ordering: higher = deeper in the postseason.
export const ROUND_ORDER = { F: 1, D: 2, L: 3, W: 4 };

// Parse ballparks.csv into a park-id → {id, city, park, first, last} map.
// `first`/`last` are 'YYYYMMDD' integers; `last` may be empty for active parks.
export function parseBallparksCsv(raw) {
	const lines = raw.split('\n');
	const header = splitCsvLine(lines[0]);
	const idI = header.indexOf('ID');
	const cityI = header.indexOf('City');
	const parkI = header.indexOf('Park Name');
	const firstI = header.indexOf('First');
	const lastI = header.indexOf('Last');
	const parks = [];
	for (const line of lines.slice(1)) {
		if (!line.trim()) continue;
		const v = splitCsvLine(line);
		const id = v[idI]?.trim();
		if (!id) continue;
		parks.push({
			id,
			city: (v[cityI] || '').trim(),
			park: (v[parkI] || '').trim(),
			first: (v[firstI] || '').trim(),
			last: (v[lastI] || '').trim(),
		});
	}
	return parks;
}

// Franchise milestones for the history chart: team identity / home-ballpark
// transitions as vertical milestone lines. Returns [{date, label, type}] sorted
// ascending. Parses the RAW gameinfo CSV (not the Brewers-facing parsed rows)
// because it needs hometeam/visteam/site columns that parseGameinfoCsv drops.
// `brewersParks` maps site IDs → park name for the Brewers' home parks.
export function computeFranchiseMilestones(rawGameinfo, brewersParks) {
	const lines = rawGameinfo.split('\n');
	const header = splitCsvLine(lines[0]);
	const dateI = header.indexOf('date');
	const visI = header.indexOf('visteam');
	const homeI = header.indexOf('hometeam');
	const siteI = header.indexOf('site');
	if (dateI < 0 || homeI < 0 || siteI < 0) return [];
	const toIso = (yyyymmdd) => {
		const s = String(yyyymmdd);
		return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
	};
	// Collect Brewers home games: {date, site, teamId} sorted ascending.
	const homeGames = [];
	for (const line of lines.slice(1)) {
		if (!line.trim()) continue;
		const v = splitCsvLine(line);
		const home = v[homeI];
		if (!BREWERS_IDS.has(home)) continue;
		homeGames.push({ date: toIso(v[dateI]), site: v[siteI], teamId: home });
	}
	homeGames.sort((a, b) => (a.date < b.date ? -1 : 1));
	if (!homeGames.length) return [];
	// Park name lookup. ballparks.csv omits Sick's Stadium (SEA01), the
	// Pilots' 1969 home, so we fill it in directly.
	const parkName = new Map(brewersParks.map((p) => [p.id, p.park]));
	parkName.set('SEA01', "Sick's Stadium");
	// Team identity transitions: first home game under each team id.
	const teamName = { SE1: 'Seattle Pilots', MIL: 'Milwaukee Brewers' };
	const seenTeam = new Set();
	const seenPark = new Set();
	const out = [];
	for (const g of homeGames) {
		if (!seenTeam.has(g.teamId)) {
			seenTeam.add(g.teamId);
			out.push({ date: g.date, label: teamName[g.teamId] || g.teamId, type: 'team' });
		}
		if (!seenPark.has(g.site)) {
			seenPark.add(g.site);
			const name = parkName.get(g.site);
			if (name) out.push({ date: g.date, label: name, type: 'park' });
		}
	}
	// Team and park transitions on the same date (1970: Pilots→Brewers +
	// Sick's→County) stay as separate entries — the chart renders them in
	// distinct icon tracks so they never overlap.
	return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

// Retrosheet teamName codes that may not appear in CurrentNames.csv or whose
// franchiseName lookup could resolve to the wrong era. Covers all opponents
// the Brewers have faced since 1969 (AL 1969–1997, NL 1998+, interleague).
const RETROSHEET_TEAM_NAMES = {
	// NL teams
	CHN: 'Chicago Cubs', NYN: 'New York Mets', SFN: 'San Francisco Giants',
	SDN: 'San Diego Padres', SLN: 'St. Louis Cardinals', LAN: 'Los Angeles Dodgers',
	MON: 'Montreal Expos', FLO: 'Florida Marlins', MIA: 'Miami Marlins',
	WAS: 'Washington Nationals',
	ARI: 'Arizona Diamondbacks', COL: 'Colorado Rockies',
	ATL: 'Atlanta Braves', HOU: 'Houston Astros', PHI: 'Philadelphia Phillies',
	PIT: 'Pittsburgh Pirates', CIN: 'Cincinnati Reds',
	// AL teams
	NYA: 'New York Yankees', CHA: 'Chicago White Sox', KCA: 'Kansas City Royals',
	BOS: 'Boston Red Sox', BAL: 'Baltimore Orioles', CLE: 'Cleveland Guardians',
	DET: 'Detroit Tigers', MIN: 'Minnesota Twins', OAK: 'Oakland Athletics',
	SEA: 'Seattle Mariners', TEX: 'Texas Rangers', TOR: 'Toronto Blue Jays',
	TBA: 'Tampa Bay Rays', TBD: 'Tampa Bay Devil Rays',
	LAA: 'Los Angeles Angels',
	// Historical / franchise-era codes
	ANA: 'Anaheim Angels', CAL: 'California Angels',
	SE1: 'Seattle Pilots',
	WS1: 'Washington Senators', WS2: 'Washington Senators',
	KC1: 'Kansas City Athletics',
	PHA: 'Philadelphia Athletics', ATH: 'Oakland Athletics',
	MLN: 'Milwaukee Braves',
	BSN: 'Boston Braves', BRO: 'Brooklyn Dodgers', NY1: 'New York Giants',
	SLA: 'St. Louis Browns', BLA: 'Baltimore Orioles',
	CLE1: 'Cleveland Spiders',
};

// Maps any gametype string to a canonical single-letter code:
//   R = regular season, T = tiebreaker (game 163), F = wild card,
//   D = division series, L = league championship, W = world series
function normalizeGametype(gt) {
	if (!gt) return '';
	const u = gt.toUpperCase().replace(/[\s_-]/g, '');
	if (u === 'R' || u === 'RS' || u === '0' || u === 'REGULAR') return 'R';
	if (u === 'W' || u === 'WS' || u === 'WORLDSERIES') return 'W';
	if (u === 'L' || u === 'LCS' || u === 'ALCS' || u === 'NLCS' || u === 'C') return 'L';
	if (u === 'D' || u === 'DS' || u === 'DIVISIONSERIES' || u === 'DIVISION') return 'D';
	if (u === 'F' || u === 'WILDCARD' || u === 'WILDCARDGAME') return 'F';
	if (u === 'PLAYOFF' || u === 'PLAYOFFS' || u === 'P') return 'T';
	return '';
}

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
				const norm = normalizeGametype(gt);
				if (!norm || norm === 'R') continue;
				tsPlayoff.add(gid);
				if (norm === 'W') tsWorldSeries.add(gid);
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

			// Normalize gametype to single-letter codes used throughout.
			// teamstats uses full words: regular, wildcard, divisionseries, lcs, worldseries, playoff.
			// gameinfo.csv may use R/D/L/W/F or be empty.
			const rawGt = (r.gametype || '').toUpperCase().trim();
			const normGt = normalizeGametype(rawGt);
			const gt = normGt || (tsPlayoff.has(r.gid) ? (tsWorldSeries.has(r.gid) ? 'W' : 'D') : 'R');
			const regularSeason = gt === 'R' ? '1' : '0';
			const playoff = gt !== 'R' ? '1' : '0';
			const worldseries = gt === 'W' ? r.season : '';

			return {
				gid: r.gid || '',
				date: isoDate,
				season: r.season,
				regular_season: regularSeason,
				playoff,
				worldseries,
				gametype: gt,
				Opponent: opponentName,
				'Brewers Win': result,
				brewers_score: isNaN(brewersScore) ? '' : String(brewersScore),
				opponent_score: isNaN(opponentScore) ? '' : String(opponentScore),
				location: isHome ? 'home' : 'away',
				wp: r.wp || '',
				lp: r.lp || '',
				save: r.save || '',
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
			let n = 0, first = null;
			for (const g of seasons.get(yr)) {
				if (g['Brewers Win'] === result) { if (!first) first = g; n++; }
				else break;
			}
			if (n > 0) out.push({ season: yr, games: n, firstGid: first?.gid || '' });
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

	// Postseason series results. Each series is grouped by (season, gametype,
	// opponent); gametype codes: F=Wild Card, D=Division Series, L=LCS, W=World Series.
	const ROUND_LABEL = { T: 'Tiebreaker', F: 'Wild Card', D: 'Division Series', L: 'LCS', W: 'World Series' };
	const ROUND_ORDER = { T: 0, F: 1, D: 2, L: 3, W: 4 };
	const seriesMap = new Map(); // key -> { season, round, opponent, wins, losses, firstGid, firstDate }
	for (const g of games) {
		if (g.regular_season === '1') continue;
		const yr = parseInt(g.season, 10);
		const gt = g.gametype || 'D';
		const key = `${yr}|${gt}|${g.Opponent}`;
		let s = seriesMap.get(key);
		if (!s) {
			s = { season: yr, round: gt, opponent: g.Opponent, wins: 0, losses: 0, firstGid: g.gid || '', firstDate: g.date || '' };
			seriesMap.set(key, s);
		}
		// Keep the chronologically earliest game as the series anchor.
		if (g.date && (!s.firstDate || g.date < s.firstDate)) {
			s.firstGid = g.gid || s.firstGid;
			s.firstDate = g.date;
		}
		if (g['Brewers Win'] === 'WIN') s.wins++;
		else if (g['Brewers Win'] === 'LOSS') s.losses++;
	}
	const allSeries = [...seriesMap.values()].map((s) => ({
		...s,
		roundLabel: ROUND_LABEL[s.round] || 'Playoffs',
		result: s.wins > s.losses ? 'Won' : 'Lost',
		record: `${s.wins}–${s.losses}`,
	}));
	// Group series by season: playoff appearances list every series; WS
	// appearances list only the World Series series (one per season at most).
	const seriesBySeason = new Map();
	for (const s of allSeries) {
		if (!seriesBySeason.has(s.season)) seriesBySeason.set(s.season, []);
		seriesBySeason.get(s.season).push(s);
	}
	const playoffAppearances = [...seriesBySeason.entries()]
		.map(([season, series]) => ({
			season,
			series: series.sort((a, b) => (ROUND_ORDER[a.round] ?? 9) - (ROUND_ORDER[b.round] ?? 9)),
		}))
		.sort((a, b) => b.season - a.season);
	const worldSeriesAppearances = allSeries
		.filter((s) => s.round === 'W')
		.sort((a, b) => b.season - a.season);

	// Regular-season win streaks, contained within a single season; a loss or tie ends one.
	const winStreaks = [];
	let run = null;
	let runSeason = null;
	const endRun = () => { if (run) { winStreaks.push(run); run = null; runSeason = null; } };
	for (const g of regular) {
		const gSeason = parseInt(g.season, 10);
		if (runSeason !== null && gSeason !== runSeason) endRun();
		if (g['Brewers Win'] === 'WIN') {
			if (!run) run = { games: 0, start: null, end: null };
			runSeason = gSeason;
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
		startGid: s.start.gid || '', endGid: s.end.gid || '',
	});
	const topStreaks = winStreaks
		.sort((a, b) => b.games - a.games || (a.start.date < b.start.date ? -1 : 1))
		.slice(0, top)
		.map(streakEntry);

	const gameInfo = (g) => {
		const pf = parseInt(g.brewers_score, 10) || 0;
		const pa = parseInt(g.opponent_score, 10) || 0;
		return {
			gid: g.gid || '',
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
		playoffAppearances, worldSeriesAppearances,
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
		let wsWins = 0, wsLosses = 0;
		let deepestRound = null, deepestOrder = 0;
		for (const g of bySeason.get(yr)) {
			const isReg = g.regular_season === '1';
			if (!isReg) {
				lastPlayoff = g;
				const order = ROUND_ORDER[g.gametype] || 0;
				if (order > deepestOrder) { deepestOrder = order; deepestRound = g.gametype; }
				if (g.worldseries && g.worldseries.trim()) {
					if (g['Brewers Win'] === 'WIN') wsWins++;
					else if (g['Brewers Win'] === 'LOSS') wsLosses++;
				}
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
		const worldseries = wsWins > wsLosses;
		const gamesPlayed = w + l + t;
		return {
			season: yr,
			wins: w, losses: l, ties: t,
			record: rec(w, l, t),
			winPct: gamesPlayed ? (w + t / 2) / gamesPlayed : 0,
			pf, pa,
			champion: worldseries || (lastPlayoff !== null && lastPlayoff.gametype !== 'W' && lastPlayoff['Brewers Win'] === 'WIN'),
			worldseries,
			postseason: deepestRound,
			undefeated: regLosses === 0 && regWins > 0 && seasonSettled(yr, now),
		};
	});
}

// Per-season best/worst records and team-pitching milestones (no-hitters,
// perfect games) from teamstats.csv. `rows` are the parsed gameinfo rows
// (for opponent/score/date cross-reference). Best/worst seasons use only
// settled regular-season records.
export function computeTeamstatsRecords(rows, teamstatsRaw, { top = 5, now = new Date() } = {}) {
	const lines = teamstatsRaw.trim().split('\n');
	const headers = splitCsvLine(lines[0]);
	const idx = (name) => headers.indexOf(name);
	const gidI = idx('gid'), teamI = idx('team');
	const hitI = idx('p_h'), ipoutsI = idx('p_ipouts'), wI = idx('p_w'), hbpI = idx('p_hbp'), bfpI = idx('p_bfp');
	const pitch = new Map();
	for (const line of lines.slice(1)) {
		const v = splitCsvLine(line);
		const team = v[teamI]?.trim();
		if (team !== 'MIL' && team !== 'SE1') continue;
		const gid = v[gidI]?.trim();
		if (!gid) continue;
		pitch.set(gid, {
			h: parseInt(v[hitI], 10) || 0,
			ipouts: parseInt(v[ipoutsI], 10) || 0,
			w: parseInt(v[wI], 10) || 0,
			hbp: parseInt(v[hbpI], 10) || 0,
			bfp: parseInt(v[bfpI], 10) || 0,
		});
	}

	const seasons = computeSeasonHistory(rows, { now, playoffs: false });
	const completed = seasons.filter((s) => seasonSettled(s.season, now) && (s.wins + s.losses + s.ties) > 0);
	const byBest = (a, b) => b.winPct - a.winPct || b.wins - a.wins || a.season - b.season;
	const byWorst = (a, b) => a.winPct - b.winPct || a.losses - b.losses || a.season - b.season;
	const bestSeasons = completed.slice().sort(byBest).slice(0, top);
	const worstSeasons = completed.slice().sort(byWorst).slice(0, top);

	const games = rows
		.filter((r) => RESULTS.has(r['Brewers Win']))
		.slice()
		.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
	const noHitters = [];
	const perfectGames = [];
	for (const g of games) {
		const p = pitch.get(g.gid);
		if (!p || p.ipouts < 27 || p.h !== 0) continue;
		const perfect = p.w === 0 && p.hbp === 0 && p.bfp === p.ipouts;
		const entry = {
			gid: g.gid, date: g.date, season: parseInt(g.season, 10), opponent: g.Opponent,
			pf: parseInt(g.brewers_score, 10) || 0, pa: parseInt(g.opponent_score, 10) || 0,
			playoff: g.regular_season !== '1', worldseries: !!(g.worldseries && g.worldseries.trim()),
			perfect,
		};
		noHitters.push(entry);
		if (perfect) perfectGames.push({ ...entry });
	}
	noHitters.reverse();
	perfectGames.reverse();
	return { bestSeasons, worstSeasons, noHitters, perfectGames };
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
		case 'world-series-appearances': {
			const w = data.worldSeriesAppearances;
			return {
				title: w.length ? `Brewers World Series — ${w.map((x) => `${x.season} (${x.result} ${x.record} vs ${x.opponent})`).join(', ')}` : 'Brewers World Series Appearances',
				desc: w.length
					? `World Series results by the Milwaukee Brewers: ${w.map((x) => `${x.season}: ${x.result} ${x.record} vs the ${x.opponent}`).join('; ')}.`
					: 'The Brewers have not yet reached a World Series.',
			};
		}
		case 'playoff-appearances': {
			const p = data.playoffAppearances;
			const summary = p.map((x) => `${x.season} (${x.series.map((s) => `${s.result} ${s.roundLabel}`).join(', ')})`).join('; ');
			return {
				title: p.length ? `Brewers Playoff Appearances — ${p.map((x) => x.season).join(', ')}` : 'Brewers Playoff Appearances',
				desc: p.length
					? `Postseason series results by the Milwaukee Brewers: ${summary}.`
					: 'The Brewers have not yet reached the playoffs.',
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
		case 'best-seasons': {
			const s = data.bestSeasons[0];
			return {
				title: `Best Brewers Seasons — ${s.record} in ${s.season}`,
				desc: `The best Milwaukee Brewers season: ${s.record} in ${s.season}. Top ${data.bestSeasons.length} seasons by winning percentage.`,
			};
		}
		case 'worst-seasons': {
			const s = data.worstSeasons[0];
			return {
				title: `Worst Brewers Seasons — ${s.record} in ${s.season}`,
				desc: `The worst Milwaukee Brewers season: ${s.record} in ${s.season}. It happens to the best of us.`,
			};
		}
		case 'no-hitters': {
			const n = data.noHitters;
			if (!n.length) return { title: 'Brewers No-Hitters', desc: 'The Brewers have never thrown a no-hitter.' };
			const g = n[0];
			return {
				title: `Brewers No-Hitters — ${n.length} all-time`,
				desc: `The Brewers have thrown ${n.length} no-hitter${n.length === 1 ? '' : 's'}. Most recent: ${g.pf}–${g.pa} vs the ${g.opponent} on ${formatDate(g.date)}.`,
			};
		}
		case 'perfect-games': {
			const n = data.perfectGames;
			if (!n.length) return { title: 'Brewers Perfect Games', desc: 'The Brewers have never thrown a perfect game.' };
			const g = n[0];
			return {
				title: `Brewers Perfect Games — ${n.length} all-time`,
				desc: `The Brewers have thrown ${n.length} perfect game${n.length === 1 ? '' : 's'}. Most recent: ${g.pf}–${g.pa} vs the ${g.opponent} on ${formatDate(g.date)}.`,
			};
		}
		default:
			return {
				title: 'Brewers Records & Superlatives',
				desc: `Best starts, longest win streaks, worst starts, lopsided wins, worst losses, World Series and playoff appearances, and every tie — Milwaukee Brewers, ${range}.`,
			};
	}
}

// Parse teamstats.csv and return a Map of gid → { visitor, home } where each side has:
//   team, inns (array of run strings per inning, '' for not played), r, h, e
export function parseTeamstatsLineScores(raw) {
	const lines = raw.trim().split('\n');
	const headers = splitCsvLine(lines[0]);
	const gidI = headers.indexOf('gid');
	const teamI = headers.indexOf('team');
	const vhI = headers.indexOf('vishome');
	const runI = headers.indexOf('b_r');
	const hitI = headers.indexOf('b_h');
	const errI = headers.indexOf('d_e');
	const innIdxs = [];
	for (let i = 1; i <= 28; i++) {
		innIdxs.push(headers.indexOf(`inn${i}`));
	}
	const map = new Map();
	for (const line of lines.slice(1)) {
		const v = splitCsvLine(line);
		const gid = v[gidI]?.trim();
		if (!gid) continue;
		if (!map.has(gid)) map.set(gid, {});
		const entry = map.get(gid);
		const vh = v[vhI]?.trim();
		const side = {
			team: v[teamI]?.trim() || '',
			inns: innIdxs.map(idx => (idx >= 0 ? v[idx]?.trim() ?? '' : '')),
			r: parseInt(v[runI], 10) || 0,
			h: parseInt(v[hitI], 10) || 0,
			e: parseInt(v[errI], 10) || 0,
		};
		if (vh === 'v') entry.visitor = side;
		else if (vh === 'h') entry.home = side;
	}
	return map;
}

export const RECORD_SLUGS = ['best-seasons', 'worst-seasons', 'best-starts', 'win-streaks', 'worst-starts', 'lopsided-wins', 'worst-losses', 'no-hitters', 'perfect-games', 'world-series-appearances', 'playoff-appearances', 'ties'];
