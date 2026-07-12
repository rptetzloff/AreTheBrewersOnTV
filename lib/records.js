// Server-side records/superlatives: computed once at startup from the same
// parsed CSV rows lib/seasons.js loads. Pure computation lives in
// records-core.js (shared with the browser page).
import { computeSuperlatives, computeSeasonHistory, recordsCopy, historyCopy, RECORD_SLUGS } from '../records-core.js';
import { allGames } from './seasons.js';

export const records = computeSuperlatives(allGames);
export const seasonHistory = computeSeasonHistory(allGames);

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
