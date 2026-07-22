// Current-season ESPN data pooled into Retrosheet-shaped CSV lines.
//
// The h2h / history / managers pages compute everything from gameinfo.csv +
// teamstats.csv, which Retrosheet only updates after the season ends. This
// module renders the current season's completed games (regular + postseason,
// no spring training — gameinfo.csv has none) as data lines matching those
// files' real header order, so the pages can simply append them before
// parsing. Once Retrosheet ships the season, the year guard makes this
// return nothing and the CSVs take over.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { splitCsvLine } from '../records-core.js';
import { fetchEspn, maxSeason } from './seasons.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataFile = (f) => readFileSync(join(__dirname, '..', 'data', f), 'utf8');

const GAMEINFO_HEADERS = splitCsvLine(dataFile('gameinfo.csv').split('\n', 1)[0]);
const TEAMSTATS_HEADERS = splitCsvLine(dataFile('teamstats.csv').split('\n', 1)[0]);

// ESPN team names -> current Retrosheet team code, from CurrentNames.csv
// rows whose era is open-ended (empty endDate). Both "City Nickname" and the
// bare nickname are mapped — ESPN's displayName for Sacramento is just
// "Athletics".
const nameToCode = (() => {
  const map = new Map();
  const lines = dataFile('CurrentNames.csv').trim().split('\n');
  const h = splitCsvLine(lines[0]);
  const codeI = h.indexOf('teamName'), cityI = h.indexOf('city'), nickI = h.indexOf('team'), endI = h.indexOf('endDate');
  for (const line of lines.slice(1)) {
    const v = splitCsvLine(line);
    if ((v[endI] || '').trim()) continue; // only current-era rows
    const code = v[codeI]?.trim(), city = v[cityI]?.trim(), nick = v[nickI]?.trim();
    if (!code || !nick) continue;
    map.set(`${city} ${nick}`, code);
    if (!map.has(nick)) map.set(nick, code);
  }
  return map;
})();

// Active manager id: the managers.csv tenure with no end date.
const activeMgrId = (() => {
  const lines = dataFile('managers.csv').trim().split('\n');
  const h = splitCsvLine(lines[0]);
  const nameI = h.indexOf('name'), endI = h.indexOf('end_date');
  for (const line of lines.slice(1).reverse()) {
    const v = splitCsvLine(line);
    if (!(v[endI] || '').trim()) return v[nameI]?.trim() || '';
  }
  return '';
})();

const dayCT = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });

function gametypeOf(event) {
  if (event._t !== 'post') return 'regular';
  const note = (event.competitions?.[0]?.notes || []).map((n) => n.headline || '').join(' ');
  if (/world series/i.test(note)) return 'worldseries';
  if (/championship|lcs/i.test(note)) return 'lcs';
  if (/division/i.test(note)) return 'division';
  if (/wild/i.test(note)) return 'wildcard';
  return 'playoff';
}

const lineFor = (headers, vals) => headers.map((h) => vals[h] ?? '').join(',');

function buildCsvs(events, season) {
  const finals = events
    .filter((e) => e._t !== 'pre' && e.competitions?.[0]?.status?.type?.name === 'STATUS_FINAL')
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  // Retrosheet game number: 0 for a lone game, 1/2 for doubleheaders. Group
  // by home team + Central date first so the numbers (and gids) come out right.
  const byDay = new Map();
  const parsed = [];
  for (const e of finals) {
    let mil = null, opp = null;
    for (const c of e.competitions[0].competitors) {
      if (c.team?.abbreviation === 'MIL') mil = c; else opp = c;
    }
    const oppCode = opp && (nameToCode.get(opp.team?.displayName) || nameToCode.get(opp.team?.shortDisplayName));
    if (!mil || !oppCode) continue; // unmappable team — skip rather than corrupt
    const isHome = mil.homeAway === 'home';
    const homeCode = isHome ? 'MIL' : oppCode;
    const ymd = dayCT(e.date).replace(/-/g, '');
    const score = (c) => parseInt(c.score?.value ?? c.score ?? 0, 10) || 0;
    const g = {
      homeCode, visCode: isHome ? oppCode : 'MIL', ymd,
      hruns: isHome ? score(mil) : score(opp),
      vruns: isHome ? score(opp) : score(mil),
      gametype: gametypeOf(e),
    };
    const dayKey = `${homeCode}${ymd}`;
    if (!byDay.has(dayKey)) byDay.set(dayKey, []);
    byDay.get(dayKey).push(g);
    parsed.push(g);
  }

  const gameinfo = [], teamstats = [];
  for (const g of parsed) {
    const siblings = byDay.get(`${g.homeCode}${g.ymd}`);
    const number = siblings.length > 1 ? siblings.indexOf(g) + 1 : 0;
    const gid = `${g.homeCode}${g.ymd}${number}`;
    const winnerIsHome = g.hruns > g.vruns;
    gameinfo.push(lineFor(GAMEINFO_HEADERS, {
      gid, visteam: g.visCode, hometeam: g.homeCode, date: g.ymd,
      // Real park id for home games — an empty site would read as a new
      // ballpark to the history page's franchise-milestone scan.
      site: g.homeCode === 'MIL' ? 'MIL06' : '',
      number: String(number), gametype: g.gametype,
      vruns: String(g.vruns), hruns: String(g.hruns),
      wteam: winnerIsHome ? g.homeCode : g.visCode,
      lteam: winnerIsHome ? g.visCode : g.homeCode,
      season: String(season),
    }));
    teamstats.push(lineFor(TEAMSTATS_HEADERS, {
      gid, team: 'MIL', mgr: activeMgrId, stattype: 'value', gametype: g.gametype,
    }));
  }
  return { gameinfo: gameinfo.join('\n'), teamstats: teamstats.join('\n'), season };
}

const EMPTY = { gameinfo: '', teamstats: '', season: null };
let cache = null; // { at, ttl, csvs }

// Settled-aware TTL, same idea as the ESPN proxy: hourly when nothing is
// happening, a few minutes around a live game so a final shows up promptly.
function ttlFor(events) {
  const soon = Date.now() + 2 * 60 * 60 * 1000;
  const active = events.some((e) => {
    const st = e.competitions?.[0]?.status?.type;
    if (st?.state === 'in') return true;
    return st?.state === 'pre' && new Date(e.date).getTime() < soon;
  });
  return active ? 5 * 60 * 1000 : 60 * 60 * 1000;
}

export async function getCurrentSeasonCsvs() {
  if (cache && Date.now() - cache.at < cache.ttl) return cache.csvs;
  try {
    const { events, year } = await fetchEspn();
    // Once Retrosheet covers this season, the CSVs are authoritative.
    const csvs = !year || year <= maxSeason ? EMPTY : buildCsvs(events, year);
    cache = { at: Date.now(), ttl: ttlFor(events), csvs };
    return csvs;
  } catch {
    return cache ? cache.csvs : EMPTY; // stale beats empty when ESPN is down
  }
}
