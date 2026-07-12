// Server-side season status: reads packers_games.csv for past seasons and the
// live ESPN feed for the current season. Mirrors the logic in main.js.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseGamesCsv } from '../records-core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV = join(__dirname, '..', 'data', 'packers_games.csv');
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/gb/schedule';

// Single read+parse of the games CSV for the whole process; lib/records.js
// consumes the same rows.
const allGames = parseGamesCsv(readFileSync(CSV, 'utf8'));

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

function stateFromCounts({ season, wins, losses, ties, superBowlName, isPast }) {
  if (superBowlName) return { kind: 'champions', season, record: rec(wins, losses, ties), superBowlName };
  if (losses === 0 && wins > 0) return { kind: 'undefeated', season, record: rec(wins, losses, ties) };
  if (wins === 0 && losses === 0 && ties === 0) return { kind: isPast ? 'default' : 'offseason', season };
  return { kind: 'no', season, record: rec(wins, losses, ties) };
}

function csvState(season) {
  const games = bySeason.get(season) || [];
  let w = 0, l = 0, t = 0; let superBowlName = null;
  for (const g of games) {
    const result = g['Packers Win'];
    if (g.regular_season === '1') {
      if (result === 'WIN') w++; else if (result === 'LOSS') l++; else if (result === 'TIE') t++;
    }
    if (g.superbowl && g.superbowl.trim() !== '' && result === 'WIN') {
      superBowlName = `Super Bowl ${g.superbowl.toUpperCase()}`;
    }
  }
  return stateFromCounts({ season, wins: w, losses: l, ties: t, superBowlName, isPast: true });
}

// --- ESPN (live/current season) ---
const espnCache = new Map(); // season -> { at, state }
const ESPN_TTL = 60 * 1000;

function isOffseason(events) {
  const now = new Date();
  const offseasonMonth = now.getMonth() >= 2 && now.getMonth() <= 7;
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
    let gb = 0, opp = 0;
    for (const c of e.competitions[0].competitors) {
      const s = parseInt(c.score?.value ?? c.score ?? 0, 10) || 0;
      if (c.team.abbreviation === 'GB') gb = s; else opp = s;
    }
    if (gb > opp) w++; else if (gb < opp) l++; else t++;
  }
  return { w, l, t };
}

async function fetchEspn(season) {
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
    let superBowlName = null;
    for (const e of events) {
      if (e._t !== 'post' || e.competitions?.[0]?.status?.type?.name !== 'STATUS_FINAL') continue;
      const note = (e.competitions[0].notes || []).find((n) => /super bowl/i.test(n.headline || ''));
      if (!note) continue;
      let gb = 0, opp = 0;
      for (const c of e.competitions[0].competitors) {
        const s = parseInt(c.score?.value ?? 0, 10) || 0;
        if (c.team.abbreviation === 'GB') gb = s; else opp = s;
      }
      if (gb > opp) superBowlName = note.headline;
    }
    state = stateFromCounts({ season: year, wins: w, losses: l, ties: t, superBowlName, isPast: false });
  }
  espnCache.set(key, { at: Date.now(), state });
  return state;
}

export function defaultSeason() {
  const now = new Date();
  // NFL season is labelled by its starting year; Jan/Feb belong to the prior year.
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
    const offseasonMonth = now.getMonth() >= 2 && now.getMonth() <= 7;
    return offseasonMonth ? { kind: 'offseason', season: yr } : { kind: 'default', season: yr };
  }
}

export { maxSeason, allGames };
