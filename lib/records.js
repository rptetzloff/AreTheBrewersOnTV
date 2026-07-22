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

// Cycles and player multi-HR games come from the per-player batting index the
// box score service builds; the server registers them here once that index is
// warm. Until then those cards/meta fall back to their empty-state copy.
const rowByGid = new Map(allGames.map((r) => [r.gid, r]));
export function registerBattingFeats({ cycles, playerHrGames }) {
	const join = (c) => {
		const r = rowByGid.get(c.gid);
		return {
			...c,
			date: r?.date || '', season: parseInt(r?.season, 10) || 0, opponent: r?.Opponent || '',
			playoff: r ? r.regular_season !== '1' : false,
			worldseries: !!(r?.worldseries && r.worldseries.trim()),
		};
	};
	records.cycles = cycles.map(join).sort((a, b) => (a.date < b.date ? 1 : -1));
	records.playerHrGames = playerHrGames.map(join)
		.sort((a, b) => b.hr - a.hr || (a.date < b.date ? 1 : -1));
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
