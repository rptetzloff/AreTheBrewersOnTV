// Server-side season status: reads gameinfo.csv + CurrentNames.csv for past
// seasons and the live ESPN feed for the current season. Mirrors the logic in main.js.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseGameinfoCsv, splitCsvLine } from '../records-core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GAMEINFO = join(__dirname, '..', 'data', 'gameinfo.csv');
const NAMES = join(__dirname, '..', 'data', 'CurrentNames.csv');
const TEAMSTATS = join(__dirname, '..', 'data', 'teamstats.csv');

// Single parse of the game data for the whole process; lib/records.js + lib/h2h.js
// consume the same rows. The raw teamstats text is exported too — lib/records
// needs it for the teamstats-derived records (no-hitters, triple plays, ...).
export const teamstatsRaw = readFileSync(TEAMSTATS, 'utf8');
const allGames = parseGameinfoCsv(
  readFileSync(GAMEINFO, 'utf8'),
  readFileSync(NAMES, 'utf8'),
  teamstatsRaw,
);

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams/mil/schedule';

function indexBySeason(rows) {
  const bySeason = new Map();
  let maxSeason = 0;
  for (const r of rows) {
    const yr = parseInt(r.season, 10);
    if (!Number.isFinite(yr)) continue;
    if (!bySeason.has(yr)) bySeason.set(yr, []);
    bySeason.get(yr).push(r);
    if (yr > maxSeason) maxSeason = yr;
  }
  return { bySeason, maxSeason };
}

const { bySeason, maxSeason } = indexBySeason(allGames);

const rec = (w, l, t) => (t > 0 ? `${w}-${l}-${t}` : `${w}-${l}`);

// --- TV channel classification (mirrors main.js getTvStatus) ---
// channel_lookup.csv types a channel broadcast/cable/regional/streaming/radio;
// a broadcast/cable/regional channel counts as "on TV" even when ESPN labels
// it Streaming (e.g. Brewers.TV, carried by cable/satellite providers).
const channelTypes = new Map();
try {
  const chLines = readFileSync(join(__dirname, '..', 'data', 'channel_lookup.csv'), 'utf8').trim().split('\n');
  const chH = splitCsvLine(chLines[0]);
  const keyI = chH.indexOf('key'), aliasI = chH.indexOf('alias'), dispI = chH.indexOf('display_name'), typeI = chH.indexOf('type');
  for (const line of chLines.slice(1)) {
    const v = splitCsvLine(line);
    const type = v[typeI]?.trim();
    if (!type) continue;
    for (const n of [v[keyI], v[dispI], ...(v[aliasI] || '').split(',')]) {
      const name = n?.trim().toLowerCase();
      if (name) channelTypes.set(name, type);
    }
  }
} catch { /* no channel metadata — ESPN's own type labels still apply */ }

// Local over-the-air simulcast dates (hand-maintained in data/simulcasts.csv;
// these games never appear in the ESPN/MLB broadcast feeds).
const simulcastDates = new Set();
try {
  const scLines = readFileSync(join(__dirname, '..', 'data', 'simulcasts.csv'), 'utf8').trim().split('\n');
  for (const line of scLines.slice(1)) {
    const d = splitCsvLine(line)[0]?.trim();
    if (d) simulcastDates.add(d);
  }
} catch { /* no simulcast data */ }

const TV_TYPES = new Set(['broadcast', 'cable', 'regional']);
function tvStatusFor(event) {
  const broadcasts = event?.competitions?.[0]?.broadcasts || [];
  if (!broadcasts.length) return 'no';
  let hasTV = false, hasStreaming = false;
  for (const b of broadcasts) {
    const name = b.media?.shortName;
    if (!name) continue;
    const type = channelTypes.get(name.trim().toLowerCase());
    if (type) {
      if (TV_TYPES.has(type)) { hasTV = true; continue; }
      if (type === 'streaming') { hasStreaming = true; continue; }
    }
    const t = b.type?.shortName || '';
    if (t === 'TV') hasTV = true;
    else if (t === 'Streaming') hasStreaming = true;
  }
  return hasTV ? 'yes' : hasStreaming ? 'streaming' : 'no';
}

// Brewers "today" is Central time.
const dayCT = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

function todaysGame(events) {
  const today = dayCT(new Date());
  return events.find((e) => {
    const st = e.competitions?.[0]?.status?.type?.name || '';
    if (st === 'STATUS_POSTPONED' || st === 'STATUS_CANCELED') return false;
    return dayCT(e.date) === today;
  }) || null;
}

function opponentOf(event) {
  const opp = event?.competitions?.[0]?.competitors?.find((c) => c.team?.abbreviation !== 'MIL');
  return opp?.team?.displayName || opp?.team?.shortDisplayName || '';
}

function csvState(season) {
  const games = bySeason.get(season) || [];
  let w = 0, l = 0, t = 0;
  let wsWins = 0, wsLosses = 0, wsName = '';
  for (const g of games) {
    const result = g['Brewers Win'];
    if (g.regular_season === '1') {
      if (result === 'WIN') w++; else if (result === 'LOSS') l++; else if (result === 'TIE') t++;
    }
    if (g.worldseries && g.worldseries.trim() !== '') {
      wsName = `World Series ${g.worldseries.toUpperCase()}`;
      if (result === 'WIN') wsWins++;
      else if (result === 'LOSS') wsLosses++;
    }
  }
  const worldSeriesName = wsWins > wsLosses ? wsName : null;
  if (worldSeriesName) return { kind: 'champions', season, record: rec(w, l, t), worldSeriesName };
  if (w === 0 && l === 0 && t === 0) return { kind: 'default', season };
  return { kind: 'record', season, record: rec(w, l, t) };
}

// --- ESPN (live/current season) ---
const espnCache = new Map(); // season -> { at, state }
const ESPN_TTL = 60 * 1000;

function isOffseason(events) {
  const now = new Date();
  // MLB offseason: November through February
  const offseasonMonth = now.getMonth() >= 10 || now.getMonth() <= 1;
  const in30 = new Date(now.getTime() + 30 * 864e5);
  const upcoming = events.some((e) => {
    const d = new Date(e.date);
    const st = e.competitions?.[0]?.status?.type?.name;
    return d > now && d <= in30 && st === 'STATUS_SCHEDULED';
  });
  return offseasonMonth && !upcoming;
}

function countFinal(events, type) {
  let w = 0, l = 0, t = 0;
  for (const e of events) {
    if (e.competitions?.[0]?.status?.type?.name !== 'STATUS_FINAL') continue;
    if (e._t !== type) continue;
    let mil = 0, opp = 0;
    for (const c of e.competitions[0].competitors) {
      const s = parseInt(c.score?.value ?? c.score ?? 0, 10) || 0;
      if (c.team.abbreviation === 'MIL') mil = s; else opp = s;
    }
    if (mil > opp) w++; else if (mil < opp) l++; else t++;
  }
  return { w, l, t };
}

export async function fetchEspn(season) {
  const q = season ? `&season=${season}` : '';
  const [pre, reg, post] = await Promise.all([
    fetch(`${ESPN}?seasontype=1${q}`).then((r) => r.json()),
    fetch(`${ESPN}?seasontype=2${q}`).then((r) => r.json()),
    fetch(`${ESPN}?seasontype=3${q}`).then((r) => r.json()),
  ]);
  const tag = (d, t) => (d.events || []).map((e) => ({ ...e, _t: t }));
  const events = [...tag(pre, 'pre'), ...tag(reg, 'regular'), ...tag(post, 'post')];
  const yr = reg.requestedSeason?.year || reg.season?.year || season;
  return { events, year: yr };
}

async function espnState(season) {
  const key = season || 'current';
  const hit = espnCache.get(key);
  if (hit && Date.now() - hit.at < ESPN_TTL) return hit.state;

  const { events, year } = await fetchEspn(season);
  let state;
  if (!events.length || isOffseason(events)) {
    state = { kind: 'offseason', season: year };
  } else {
    const { w, l, t } = countFinal(events, 'regular');
    let worldSeriesName = null;
    for (const e of events) {
      if (e._t !== 'post' || e.competitions?.[0]?.status?.type?.name !== 'STATUS_FINAL') continue;
      const note = (e.competitions[0].notes || []).find((n) => /world series/i.test(n.headline || ''));
      if (!note) continue;
      let mil = 0, opp = 0;
      for (const c of e.competitions[0].competitors) {
        const s = parseInt(c.score?.value ?? 0, 10) || 0;
        if (c.team.abbreviation === 'MIL') mil = s; else opp = s;
      }
      if (mil > opp) worldSeriesName = note.headline;
    }
    const record = rec(w, l, t);
    if (worldSeriesName) {
      state = { kind: 'champions', season: year, record, worldSeriesName };
    } else {
      // The site's actual question: is today's game on TV?
      const game = todaysGame(events);
      if (!game) {
        state = { kind: 'no-game', season: year, record };
      } else {
        // A hand-tracked local simulcast makes the game on TV regardless of
        // what the ESPN broadcast list says.
        const tv = simulcastDates.has(dayCT(game.date)) ? 'yes' : tvStatusFor(game);
        state = {
          kind: tv === 'yes' ? 'tv-yes' : tv === 'streaming' ? 'tv-streaming' : 'tv-no',
          season: year, record, opponent: opponentOf(game),
        };
      }
    }
  }
  espnCache.set(key, { at: Date.now(), state });
  return state;
}

export function defaultSeason() {
  const now = new Date();
  // MLB season runs April-October; Jan/Feb belong to the prior year.
  return now.getMonth() <= 1 ? now.getFullYear() - 1 : now.getFullYear();
}

// Returns a card state for the requested season (or the current one if omitted).
export async function getSeasonState(season) {
  const yr = season || defaultSeason();
  if (bySeason.has(yr) && yr <= maxSeason) return csvState(yr);
  try {
    return await espnState(yr);
  } catch {
    // ESPN unreachable: fall back to a sensible static card.
    const now = new Date();
    const offseasonMonth = now.getMonth() >= 10 || now.getMonth() <= 1;
    return offseasonMonth ? { kind: 'offseason', season: yr } : { kind: 'default', season: yr };
  }
}

export { maxSeason, allGames };
