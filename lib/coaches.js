// Server-side managers, for the managers page's link preview and share card:
// computed at startup from gameinfo.csv, teamstats.csv, and biofile0.csv via
// coaches-core.js, and again whenever the season being played changes.
//
// It used to be computed once, from Retrosheet's seasons alone, so the card
// would have read "0 championships between them" after a 2026 title, and
// Pat Murphy's line stopped at 2025. The page itself appends the season
// being played (managers.js); this now does the same, as lib/records.js does
// for the history card.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseBiofile, parseTeamstatsMgr, parseManagersCsv, computeCoachesFromData, coachesCopy } from '../coaches-core.js';
import { parseGameinfoCsv } from '../records-core.js';
import { allGames } from './seasons.js';
import { seasonHistory, liveSeasonHistory } from './records.js';
import { getCurrentSeasonCsvs } from './espn-current.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, '..', 'data');
const TEAMSTATS_RAW = readFileSync(join(DATA, 'teamstats.csv'), 'utf8').trimEnd();
const GAMEINFO_HEADER = readFileSync(join(DATA, 'gameinfo.csv'), 'utf8').split('\n', 1)[0];
const NAMES_RAW = readFileSync(join(DATA, 'CurrentNames.csv'), 'utf8');
const mgrNames = parseBiofile(readFileSync(join(DATA, 'biofile0.csv'), 'utf8'));
const officialTenures = parseManagersCsv(readFileSync(join(DATA, 'managers.csv'), 'utf8'));

const championsOf = (history) => history.filter((s) => s.champion).map((s) => s.season);

/** Retrosheet's seasons only: what the server starts with. */
export const coaches = computeCoachesFromData(allGames, parseTeamstatsMgr(TEAMSTATS_RAW), mgrNames, championsOf(seasonHistory), officialTenures);

let live = { key: '', version: 0, coaches };

/** The managers with the season being played appended, and a version that
 *  changes when they do, for keying the cached card. */
export async function liveCoaches() {
	const cur = await getCurrentSeasonCsvs();
	const history = await liveSeasonHistory();
	const champions = championsOf(history);
	const key = `${cur.gameinfo || ''}|${champions.join(',')}`;
	if (live.key === key) return live;
	const rows = cur.gameinfo ? [...allGames, ...parseGameinfoCsv(`${GAMEINFO_HEADER}\n${cur.gameinfo}`, NAMES_RAW)] : allGames;
	const teamstats = cur.teamstats ? `${TEAMSTATS_RAW}\n${cur.teamstats}` : TEAMSTATS_RAW;
	live = {
		key,
		version: live.version + 1,
		coaches: computeCoachesFromData(rows, parseTeamstatsMgr(teamstats), mgrNames, champions, officialTenures),
	};
	return live;
}

export function coachesMeta(data = coaches) {
	return coachesCopy(data);
}
