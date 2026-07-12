// Server-side head coaches: computed once at startup from the same parsed
// rows lib/seasons.js loads plus data/packers_coaches.csv. Pure computation
// lives in coaches-core.js (shared with the browser page).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseCoachesCsv, computeCoaches, coachesCopy } from '../coaches-core.js';
import { allGames } from './seasons.js';
import { seasonHistory } from './records.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV = join(__dirname, '..', 'data', 'packers_coaches.csv');

const champions = seasonHistory.filter((s) => s.champion).map((s) => s.season);
export const coaches = computeCoaches(allGames, parseCoachesCsv(readFileSync(CSV, 'utf8')), champions);

export function coachesMeta() {
	return coachesCopy(coaches);
}
