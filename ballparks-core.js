// Ballparks and game-day records: each home park's record and crowds, and
// the biggest crowds, longest and shortest games, and hottest and coldest
// days. Pure functions over the game rows, gameinfo.csv's game-day columns
// and the line scores; the server builds the page's data once.
//
// Coverage differs by column, measured over every Brewers game:
// attendance and time of game are recorded for 90-100% of games in every
// decade; temperature for 94%+ from the 1990s but about half before (a 0
// means not recorded). The innings column is empty before 2020, so innings
// come from the line scores instead. Sky, wind and rain are too sparse
// before the 1990s to rank, and gameinfo has "snow" on a July game at
// Yankee Stadium, so they are left out.

import { splitCsvLine } from './records-core.js';
import { SITE } from './site.js';

/** gid -> the game-day columns that gameinfo.csv has and the parsed rows do
 *  not: attendance, minutes, temperature, park, day/night. Zero and blank
 *  are "not recorded" and come back null. */
export function parseGameDay(gameinfoCsv) {
	const lines = gameinfoCsv.trim().split('\n');
	const h = splitCsvLine(lines[0]);
	const I = Object.fromEntries(['gid', 'site', 'attendance', 'timeofgame', 'temp', 'daynight', 'sky', 'innings'].map((k) => [k, h.indexOf(k)]));
	const num = (s) => { const n = parseInt(s, 10); return n > 0 ? n : null; };
	const out = new Map();
	for (const line of lines.slice(1)) {
		const v = splitCsvLine(line);
		const gid = v[I.gid]?.trim();
		if (!gid) continue;
		out.set(gid, {
			site: v[I.site]?.trim() || '',
			attendance: num(v[I.attendance]),
			minutes: num(v[I.timeofgame]),
			temp: num(v[I.temp]),
			daynight: v[I.daynight]?.trim() || '',
			// "dome" is Retrosheet for a roof that was closed: 863 games at
			// Miller Park/American Family Field. The temperature recorded for
			// those is outdoors, not what anyone played in.
			roofClosed: v[I.sky]?.trim() === 'dome',
			// Scheduled innings, which the column holds from 2020: 7 for the
			// 2020-21 doubleheader games, else 9. Empty before 2020, so 9.
			scheduled: num(v[I.innings]) || 9,
		});
	}
	return out;
}

/** Innings played, from a line score: the last inning either team has a
 *  value for (an "x" for an unplayed bottom of the ninth counts). */
export function inningsPlayed(line) {
	if (!line) return null;
	let n = 0;
	for (const side of [line.visitor, line.home]) {
		const inns = side?.inns || [];
		for (let i = inns.length - 1; i >= 0; i--) if (inns[i] !== '') { n = Math.max(n, i + 1); break; }
	}
	return n || null;
}

/** A park's name on a date: the curated history in site.js for renamed
 *  parks, else ballparks.csv's one name, else the id. */
export function parkName(parks, site, season, names = SITE.parkNames) {
	const history = names?.[site];
	if (history) {
		const hit = history.find((h) => season >= (h.from ?? -Infinity) && season <= (h.to ?? Infinity));
		if (hit) return hit.name;
		return history[history.length - 1].name;
	}
	return parks.get(site)?.park || site;
}

const RESULT = { WIN: 'W', LOSS: 'L', TIE: 'T' };
const rec = (w, l, t) => (t ? `${w}–${l}–${t}` : `${w}–${l}`);

/** Everything the Ballparks page shows. `rows` are parsed game rows
 *  (parseGameinfoCsv), `gameDay` parseGameDay's map, `lineScores`
 *  parseTeamstatsLineScores's, `parks` a Map of park id -> { park, city }. */
export function ballparkStats(rows, gameDay, lineScores, parks, { top = 10, names = SITE.parkNames } = {}) {
	const games = rows
		.filter((r) => RESULT[r.result] && gameDay.has(r.gid))
		.map((r) => {
			const d = gameDay.get(r.gid);
			const season = parseInt(r.season, 10);
			return {
				gid: r.gid, date: r.date, season, opponent: r.Opponent,
				home: r.location === 'home', regular: r.regular_season === '1',
				result: RESULT[r.result], pf: parseInt(r.scoreFor, 10) || 0, pa: parseInt(r.scoreAgainst, 10) || 0,
				site: d.site, park: parkName(parks, d.site, season, names),
				attendance: d.attendance, minutes: d.minutes, daynight: d.daynight,
				// Closed roof: no temperature that means anything for the game.
				temp: d.roofClosed ? null : d.temp,
				innings: inningsPlayed(lineScores?.get(r.gid)),
			};
		});

	// --- each home park ---
	const bySite = new Map();
	for (const g of games.filter((x) => x.home)) {
		let p = bySite.get(g.site);
		if (!p) {
			p = { site: g.site, first: g, last: g, w: 0, l: 0, t: 0, pw: 0, pl: 0, games: 0, crowd: 0, counted: 0, biggest: null };
			bySite.set(g.site, p);
		}
		if (g.date < p.first.date) p.first = g;
		if (g.date > p.last.date) p.last = g;
		p.games++;
		if (g.regular) { if (g.result === 'W') p.w++; else if (g.result === 'L') p.l++; else p.t++; }
		else if (g.result === 'W') p.pw++; else if (g.result === 'L') p.pl++;
		if (g.attendance) {
			p.crowd += g.attendance;
			p.counted++;
			if (!p.biggest || g.attendance > p.biggest.attendance) p.biggest = g;
		}
	}
	// The last season in the data: a park still in use when it ends is the
	// current home, its years open-ended rather than stopping where the data does.
	const lastSeason = Math.max(...games.map((g) => g.season));
	const parkList = [...bySite.values()]
		.sort((a, b) => (a.first.date < b.first.date ? -1 : 1))
		.map((p, i, all) => {
			const history = names?.[p.site];
			const name = history ? history[history.length - 1].name : (parks.get(p.site)?.park || p.site);
			const formerly = history ? history.slice(0, -1).map((h) => ({ name: h.name, from: h.from, to: h.to })) : [];
			// The same seven boards as the page's, over this park's home games,
			// keeping the top of each: the park's own records.
			const own = gameDayBoards(games.filter((g) => g.home && g.site === p.site), 1);
			const one = (list) => list[0] || null;
			return {
				site: p.site, name, formerly, city: parks.get(p.site)?.city || '',
				first: p.first.season, last: p.last.season,
				current: i === all.length - 1 && p.last.season === lastSeason,
				firstGame: p.first, lastGame: p.last, games: p.games,
				record: rec(p.w, p.l, p.t), winPct: p.w + p.l + p.t ? (p.w + p.t / 2) / (p.w + p.l + p.t) : null,
				postseason: p.pw + p.pl ? rec(p.pw, p.pl, 0) : null,
				attendance: p.crowd, averageAttendance: p.counted ? Math.round(p.crowd / p.counted) : null,
				attendanceCoverage: p.games ? p.counted / p.games : 0,
				biggestCrowd: p.biggest,
				smallestCrowd: one(own.smallestCrowds),
				longestTime: one(own.longestTime),
				shortestTime: one(own.shortestTime),
				mostInnings: one(own.mostInnings),
				hottest: one(own.hottest),
				coldest: one(own.coldest),
			};
		});

	const homeGames = games.filter((g) => g.home);
	const boards = gameDayBoards(games, top);
	return {
		parks: parkList,
		// Crowds are home games: a road crowd is the other team's.
		biggestCrowds: gameDayBoards(homeGames, top).biggestCrowds,
		smallestCrowds: gameDayBoards(homeGames, top).smallestCrowds,
		longestTime: boards.longestTime,
		shortestTime: boards.shortestTime,
		mostInnings: boards.mostInnings,
		hottest: boards.hottest,
		coldest: boards.coldest,
		range: games.length ? { first: Math.min(...games.map((g) => g.season)), last: Math.max(...games.map((g) => g.season)) } : null,
	};
}

/** The seven game-day boards over a pool of games, top `n` of each. Used for
 *  the whole franchise and for each park, so the two can never disagree on
 *  the rules: nine innings or more for the shortest (a rain-shortened game is
 *  short for a reason that is not baseball), extra innings only for the most
 *  innings, and ties to the earlier date. */
export function gameDayBoards(pool, n) {
	const board = (list, key, dir) => list
		.filter((g) => g[key] !== null && g[key] !== undefined)
		.sort((a, b) => dir * (a[key] - b[key]) || (a.date < b.date ? -1 : 1))
		.slice(0, n);
	return {
		biggestCrowds: board(pool, 'attendance', -1),
		smallestCrowds: board(pool, 'attendance', 1),
		longestTime: board(pool, 'minutes', -1),
		shortestTime: board(pool.filter((g) => g.innings >= 9), 'minutes', 1),
		mostInnings: pool
			.filter((g) => g.innings > 9)
			.sort((a, b) => b.innings - a.innings || (b.minutes || 0) - (a.minutes || 0) || (a.date < b.date ? -1 : 1))
			.slice(0, n),
		hottest: board(pool, 'temp', -1),
		coldest: board(pool, 'temp', 1),
	};
}
