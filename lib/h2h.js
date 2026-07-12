// Server-side head-to-head: computed once at startup from the same parsed CSV
// rows lib/seasons.js loads. Pure computation lives in h2h-core.js (shared
// with the browser page).
import { computeHeadToHead, h2hCopy } from '../h2h-core.js';
import { allGames } from './seasons.js';

export const h2h = computeHeadToHead(allGames);

export function isOpponentSlug(slug) {
	return h2h.bySlug.has(slug);
}

// slug undefined/'overview' -> landing-page copy.
export function h2hMeta(slug) {
	return h2hCopy(slug || 'overview', h2h);
}
