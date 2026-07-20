// Server-side records/superlatives: computed once at startup from the same
// parsed CSV rows lib/seasons.js loads. Pure computation lives in
// records-core.js (shared with the browser page).
import { computeSuperlatives, computeSeasonHistory, computeTeamstatsRecords, recordsCopy, historyCopy, RECORD_SLUGS } from '../records-core.js';
import { allGames, teamstatsRaw } from './seasons.js';

// Same merge the browser records page does — the teamstats-derived records
// (best/worst seasons, no-hitters, triple plays, ...) must be included here
// too or the /records/<slug> meta and cards break for those slugs.
export const records = { ...computeSuperlatives(allGames), ...computeTeamstatsRecords(allGames, teamstatsRaw) };
export const seasonHistory = computeSeasonHistory(allGames);

// Cycles come from the per-player batting index the box score service builds;
// the server registers them here once that index is warm. Until then the
// cycles card/meta falls back to its empty-state copy.
const rowByGid = new Map(allGames.map((r) => [r.gid, r]));
export function registerCycles(rawCycles) {
	const joined = rawCycles.map((c) => {
		const r = rowByGid.get(c.gid);
		return {
			...c,
			date: r?.date || '', season: parseInt(r?.season, 10) || 0, opponent: r?.Opponent || '',
			playoff: r ? r.regular_season !== '1' : false,
			worldseries: !!(r?.worldseries && r.worldseries.trim()),
		};
	});
	joined.sort((a, b) => (a.date < b.date ? 1 : -1));
	records.cycles = joined;
}

export function historyMeta() {
	return historyCopy(seasonHistory);
}

export function isRecordSlug(slug) {
	return RECORD_SLUGS.includes(slug);
}

// slug undefined/'overview' -> landing-page copy.
export function recordsMeta(slug) {
	return recordsCopy(slug || 'overview', records);
}
