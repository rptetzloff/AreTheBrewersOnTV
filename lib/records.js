// Server-side records/superlatives: computed at startup from the same parsed
// CSV rows lib/seasons.js loads, then brought up to date with the season being
// played whenever its games change (refreshLive, below). Pure computation
// lives in records-core.js (shared with the browser page).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { computeSuperlatives, computeSeasonHistory, computeTeamstatsRecords, recordsCopy, historyCopy, parseGameinfoCsv, computePitcherEra, RECORD_SLUGS } from '../records-core.js';
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

// Single-season pitcher ERAs need per-pitcher lines, which only the box score
// pitching index has; registered with the batting feats once it is warm.
export function registerPitcherEra(pitching, playerNames) {
	Object.assign(records, computePitcherEra(pitching, rowByGid, playerNames));
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

// The pages append the season being played from /api/current; the server's
// share cards and titles did not, so history said 1969–2025 under a chart
// that ran to 2026, and records left the season out entirely. This is the
// same append, server side, recomputed only when the current season's games
// change.
//
// Only the game results are appended, not the current season's teamstats
// lines: those are placeholders with no stats, so the box score records
// (no-hitters, triple plays, errors, homers) keep to Retrosheet's seasons.
const GAMEINFO_HEADER = readFileSync(join(DATA, 'gameinfo.csv'), 'utf8').split('\n', 1)[0];
let live = { key: null, version: 0, history: seasonHistory };
async function refreshLive() {
	const cur = await getCurrentSeasonCsvs();
	const key = cur.gameinfo || '';
	if (live.key === key) return live;
	const rows = key
		? [...allGames, ...parseGameinfoCsv(`${GAMEINFO_HEADER}\n${key}`, namesRaw)]
		: allGames;
	// Recomputing replaces the no-hitter and triple-play lists, so the names
	// the box score index attached to them go back on.
	Object.assign(records, computeSuperlatives(rows), computeTeamstatsRecords(rows, teamstatsRaw));
	if (records.noHitterPitchers) registerNoHitterPitchers(records.noHitterPitchers);
	if (records.triplePlayFielders) registerTriplePlayFielders(records.triplePlayFielders);
	live = { key, version: live.version + 1, history: computeSeasonHistory(rows) };
	return live;
}

export async function liveSeasonHistory() {
	return (await refreshLive()).history;
}

/** Brings `records` up to date with the season being played, and returns a
 *  version that changes whenever it does, for keying cached cards. */
export async function liveRecordsVersion() {
	return (await refreshLive()).version;
}

export function isRecordSlug(slug) {
	return RECORD_SLUGS.includes(slug);
}

// slug undefined/'overview' -> landing-page copy.
export function recordsMeta(slug) {
	return recordsCopy(slug || 'overview', records);
}
