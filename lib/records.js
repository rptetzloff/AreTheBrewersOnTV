// Server-side records/superlatives: computed once at startup from the same
// parsed CSV rows lib/seasons.js loads. Pure computation lives in
// records-core.js (shared with the browser page).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { computeSuperlatives, computeSeasonHistory, computeTeamstatsRecords, recordsCopy, historyCopy, parseGameinfoCsv, RECORD_SLUGS } from '../records-core.js';
import { allGames, teamstatsRaw } from './seasons.js';
import { getCurrentSeasonCsvs } from './espn-current.js';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const namesRaw = readFileSync(join(DATA, 'CurrentNames.csv'), 'utf8');

// Same merge the browser records page does — the teamstats-derived records
// (best/worst seasons, no-hitters, triple plays, ...) must be included here
// too or the /records/<slug> meta and cards break for those slugs.
export const records = { ...computeSuperlatives(allGames), ...computeTeamstatsRecords(allGames, teamstatsRaw) };
export const seasonHistory = computeSeasonHistory(allGames);

// Cycles and player multi-HR games come from the per-player batting index the
// box score service builds; the server registers them here once that index is
// warm. Until then those cards/meta fall back to their empty-state copy.
const rowByGid = new Map(allGames.map((r) => [r.gid, r]));
export function registerBattingFeats({ cycles, playerHrGames, playerRbiGames, playerErrorGames }) {
	const join = (c) => {
		const r = rowByGid.get(c.gid);
		return {
			...c,
			date: r?.date || '', season: parseInt(r?.season, 10) || 0, opponent: r?.Opponent || '',
			playoff: r ? r.regular_season !== '1' : false,
			championship: !!(r?.championship && r.championship.trim()),
		};
	};
	records.cycles = cycles.map(join).sort((a, b) => (a.date < b.date ? 1 : -1));
	records.playerHrGames = playerHrGames.map(join)
		.sort((a, b) => b.hr - a.hr || (a.date < b.date ? 1 : -1));
	// Best RBI games, everything tied with the 5th-best count included.
	const rbi = (playerRbiGames || []).map(join)
		.sort((a, b) => b.rbi - a.rbi || (a.date < b.date ? 1 : -1));
	const rbiCutoff = rbi[4]?.rbi ?? 0;
	records.playerRbiGames = rbi.filter((g) => g.rbi >= rbiCutoff);
	// Worst player error games, same tie-inclusive cutoff.
	const errs = (playerErrorGames || []).map(join)
		.sort((a, b) => b.e - a.e || (a.date < b.date ? 1 : -1));
	const errCutoff = errs[4]?.e ?? 0;
	records.playerErrorGames = errs.filter((g) => g.e >= errCutoff);
}

// Fielders credited on each Brewers triple play, from the play-by-play —
// attached to the triple-plays entries and served to the records page.
export function registerTriplePlayFielders(byGid) {
	records.triplePlayFielders = byGid;
	for (const tp of records.triplePlays || []) {
		if (byGid[tp.gid]) tp.fielders = byGid[tp.gid];
	}
}

// Pitcher names per no-hitter gid, from the box score pitching index — one
// name means an individual no-hitter, several a combined one. Attached to
// the no-hitter/perfect-game entries and served to the records page.
export function registerNoHitterPitchers(byGid) {
	records.noHitterPitchers = byGid;
	for (const list of [records.noHitters, records.perfectGames]) {
		for (const nh of list || []) {
			if (byGid[nh.gid]) nh.pitchers = byGid[nh.gid];
		}
	}
}

export function historyMeta(history = seasonHistory) {
	return historyCopy(history);
}

// The history page appends the season being played from /api/current; the
// share card and title did not, so they said 1969–2025 under a chart that
// ran to 2026. This is the same append, server side, recomputed only when
// the current season's games change.
let liveMemo = { key: null, history: seasonHistory };
export async function liveSeasonHistory() {
	const cur = await getCurrentSeasonCsvs();
	if (!cur.gameinfo) return seasonHistory;
	if (liveMemo.key === cur.gameinfo) return liveMemo.history;
	const header = readFileSync(join(DATA, 'gameinfo.csv'), 'utf8').split('\n', 1)[0];
	const tsHeader = teamstatsRaw.split('\n', 1)[0];
	const rows = parseGameinfoCsv(`${header}\n${cur.gameinfo}`, namesRaw, `${tsHeader}\n${cur.teamstats}`);
	liveMemo = { key: cur.gameinfo, history: computeSeasonHistory([...allGames, ...rows]) };
	return liveMemo.history;
}

export function isRecordSlug(slug) {
	return RECORD_SLUGS.includes(slug);
}

// slug undefined/'overview' -> landing-page copy.
export function recordsMeta(slug) {
	return recordsCopy(slug || 'overview', records);
}
