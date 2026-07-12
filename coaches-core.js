// Shared (browser + node) head-coach records, computed by assigning every
// game to a coaching tenure by date. Tenures come from
// data/packers_coaches.csv (from/to dates, so mid-season changes like
// Ronzani -> Devore/McLean in 1953 or McCarthy -> Philbin in 2018 split
// correctly). Pure functions only.
import { rec, splitCsvLine } from './records-core.js';

export const slugifyCoach = (name) =>
	name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function parseCoachesCsv(raw) {
	const lines = raw.trim().split('\n');
	const headers = splitCsvLine(lines[0]);
	return lines.slice(1).map((l) => {
		const v = splitCsvLine(l); const o = {};
		headers.forEach((h, i) => { o[h] = v[i] ?? ''; });
		return o;
	});
}

const RESULTS = new Set(['WIN', 'LOSS', 'TIE']);

// games: parsed packers_games.csv rows. tenures: parsed packers_coaches.csv
// rows ({coach, from, to}; empty to = present). Returns { coaches, bySlug },
// coaches in tenure order. A championship counts for the coach who coached
// that champion season's final game.
export function computeCoaches(rows, tenures, championSeasons) {
	const games = rows
		.filter((g) => RESULTS.has(g['Packers Win']))
		.slice()
		.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

	const spans = tenures.map((t) => ({
		name: t.coach, from: t.from, to: t.to || '9999-12-31',
		interim: t.interim === '1',
		image: t.image || null, imagePage: t.image_page || null,
	}));
	const coachOf = (date) => spans.find((s) => date >= s.from && date <= s.to)?.name ?? null;

	const byCoach = new Map(spans.map((s) => [s.name, []]));
	for (const g of games) {
		const name = coachOf(g.date);
		if (name) byCoach.get(name).push(g);
	}

	// Champion season -> coach of that season's final game.
	const titleCount = new Map();
	const bySeason = new Map();
	for (const g of games) {
		const yr = parseInt(g.season, 10);
		if (!bySeason.has(yr) || g.date > bySeason.get(yr).date) bySeason.set(yr, g);
	}
	for (const yr of championSeasons) {
		const finale = bySeason.get(yr);
		const name = finale && coachOf(finale.date);
		if (name) titleCount.set(name, (titleCount.get(name) || 0) + 1);
	}

	const coaches = spans
		.filter((s) => byCoach.get(s.name).length > 0)
		.map((s) => {
			const list = byCoach.get(s.name);
			// Coach records follow convention: regular season, playoffs split out.
			const reg = { WIN: 0, LOSS: 0, TIE: 0 };
			const playoff = { WIN: 0, LOSS: 0, TIE: 0 };
			let pf = 0, pa = 0;
			for (const g of list) {
				(g.regular_season === '1' ? reg : playoff)[g['Packers Win']]++;
				pf += parseInt(g.packers_score, 10) || 0;
				pa += parseInt(g.opponent_score, 10) || 0;
			}
			const regGames = reg.WIN + reg.LOSS + reg.TIE;
			const playoffGames = playoff.WIN + playoff.LOSS + playoff.TIE;
			const firstSeason = parseInt(list[0].season, 10);
			const lastSeason = parseInt(list[list.length - 1].season, 10);
			return {
				name: s.name, slug: slugifyCoach(s.name),
				interim: s.interim,
				image: s.image, imagePage: s.imagePage,
				firstSeason, lastSeason,
				tenure: firstSeason === lastSeason ? String(firstSeason) : `${firstSeason}–${lastSeason}`,
				games: list.length,
				wins: reg.WIN, losses: reg.LOSS, ties: reg.TIE,
				record: rec(reg.WIN, reg.LOSS, reg.TIE),
				winPct: regGames ? (reg.WIN + reg.TIE / 2) / regGames : 0,
				playoffGames,
				playoffRecord: playoffGames ? rec(playoff.WIN, playoff.LOSS, playoff.TIE) : null,
				pf, pa,
				titles: titleCount.get(s.name) || 0,
			};
		});

	return { coaches, bySlug: new Map(coaches.map((c) => [c.slug, c])) };
}

// Meta copy for the /coaches page, shared by server OG meta and client share.
export function coachesCopy(data) {
	const { coaches } = data;
	const wins = [...coaches].sort((a, b) => b.wins - a.wins)[0];
	const titles = coaches.reduce((s, c) => s + c.titles, 0);
	return {
		title: `Packers Head Coaches, ${coaches[0].firstSeason}–present`,
		desc: `Every Green Bay Packers head coach and their record — ${coaches.length} of them, ${titles} championships. Most wins: ${wins.name} (${wins.record}).`,
	};
}
