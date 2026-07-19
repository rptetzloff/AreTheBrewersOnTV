// Server-side managers: computed once at startup from gameinfo.csv,
// teamstats.csv, and biofile0.csv via coaches-core.js.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseBiofile, parseTeamstatsMgr, parseManagersCsv, computeCoachesFromData, coachesCopy } from '../coaches-core.js';
import { allGames } from './seasons.js';
import { seasonHistory } from './records.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEAMSTATS = join(__dirname, '..', 'data', 'teamstats.csv');
const BIOFILE = join(__dirname, '..', 'data', 'biofile0.csv');
const MANAGERS = join(__dirname, '..', 'data', 'managers.csv');

const champions = seasonHistory.filter((s) => s.champion).map((s) => s.season);
const gidToMgr = parseTeamstatsMgr(readFileSync(TEAMSTATS, 'utf8'));
const mgrNames = parseBiofile(readFileSync(BIOFILE, 'utf8'));
const officialTenures = parseManagersCsv(readFileSync(MANAGERS, 'utf8'));
export const coaches = computeCoachesFromData(allGames, gidToMgr, mgrNames, champions, officialTenures);

export function coachesMeta() {
	return coachesCopy(coaches);
}
