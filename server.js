// Minimal web service for arethebrewersontv.com
// - serves the static site
// - injects per-URL Open Graph / Twitter meta so shared links preview correctly
// - renders per-season social cards at /og/:season.png
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import { renderPng, renderRecordsPng, renderH2hPng, renderHistoryPng, renderCoachesPng, renderGamePng, renderBallparksPng } from './lib/cards.js';
import { indexLoadOutcome, isLfsPointer } from './lib/indices-health.js';
import { originOf } from './lib/origin.js';
import { getSeasonState, defaultSeason, allGames, teamstatsRaw, fetchEspn, tvLookup, simulcasts } from './lib/seasons.js';
import { parseGameDay, ballparkStats } from './ballparks-core.js';
import { buildCalendar } from './lib/calendar.js';
import { records, recordsMeta, isRecordSlug, historyMeta, liveSeasonHistory, liveRecordsVersion, registerBattingFeats, registerPitcherEra, registerNoHitterPitchers, registerTriplePlayFielders } from './lib/records.js';
import { coaches, coachesMeta } from './lib/coaches.js';
import { h2h, h2hMeta, isOpponentSlug } from './lib/h2h.js';
import { getCurrentSeasonCsvs } from './lib/espn-current.js';
import { seasonBatting, seasonPitching, seasonFielding, seasonFieldingTotals, regularGidsBySeason, buildLeaders, playerSeasons, playerDirectory, bornOn, parseBios, PLAYER_ID } from './stats-core.js';
import { espnTarget } from './lib/espn-target.js';
import { esc, parseCurrentNamesCsv, parseBallparksCsv, parseTeamstatsLineScores, BREWERS_IDS } from './records-core.js';
import { buildGameIndex, buildPitchingIndex, buildBattingIndex, buildFieldingIndex, buildPlayerNameMap, buildBoxscore, createScoringPlaysCollector, computeBattingFeats, computeFieldingFeats, POS_NAMES } from './boxscore-core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = process.env.PORT || 3000;

function assetVersion(file) {
  try { return createHash('sha1').update(readFileSync(join(ROOT, file))).digest('hex').slice(0, 8); }
  catch { return null; }
}

function loadShell(file, assets) {
  const raw = readFileSync(join(ROOT, file), 'utf8');
  const stripped = [
    /<title>[\s\S]*?<\/title>\s*/i,
    /<meta[^>]*\b(?:property=["']og:[^"']*["']|name=["']twitter:[^"']*["']|name=["']description["'])[^>]*>\s*/gi,
    /<link[^>]*\brel=["']canonical["'][^>]*>\s*/gi,
  ].reduce((html, re) => html.replace(re, ''), raw);
  return assets.reduce((html, asset) => {
    const v = assetVersion(asset);
    if (!v) return html;
    for (const attr of ['src', 'href']) {
      html = html
        .replace(`${attr}="${asset}"`, `${attr}="${asset}?v=${v}"`)
        .replace(`${attr}="/${asset}"`, `${attr}="/${asset}?v=${v}"`);
    }
    return html;
  }, stripped);
}
const INDEX_VERSIONED = loadShell('index.html', ['main.js', 'styles.css']);
const RECORDS_VERSIONED = loadShell('records.html', ['records.js', 'styles.css']);
const VS_VERSIONED = loadShell('vs.html', ['vs.js', 'styles.css']);
const GAME_VERSIONED = loadShell('game.html', ['game.js', 'styles.css']);
const HISTORY_VERSIONED = loadShell('history.html', ['history.js', 'styles.css']);
const MANAGERS_VERSIONED = loadShell('managers.html', ['managers.js', 'styles.css']);
const BALLPARKS_VERSIONED = loadShell('ballparks.html', ['ballparks.js', 'styles.css']);
const STATS_VERSIONED = loadShell('stats.html', ['stats.js', 'styles.css']);
const PLAYER_VERSIONED = loadShell('player.html', ['player.js', 'styles.css']);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
};

function copy(state) {
  const s = state.season;
  switch (state.kind) {
    case 'champions':
      return { title: `${s} Milwaukee Brewers — World Series Champions`,
        desc: `The ${s} Milwaukee Brewers won ${state.worldSeriesName || 'the World Series'}.` };
    case 'offseason':
      return { title: `Are the Brewers On TV? — ${s} offseason`,
        desc: `The ${s} season hasn't started yet. Check back for the schedule.` };
    case 'tv-yes':
      return { title: `Are the Brewers On TV? YES — today vs the ${state.opponent}`,
        desc: `The Brewers (${state.record}) play the ${state.opponent} today and the game is on TV. Channel details inside.` };
    case 'tv-streaming':
      return { title: `Are the Brewers On TV? Streaming only — today vs the ${state.opponent}`,
        desc: `The Brewers (${state.record}) play the ${state.opponent} today, streaming only. Details inside.` };
    case 'tv-no':
      return { title: `Are the Brewers On TV? NO — today vs the ${state.opponent}`,
        desc: `The Brewers (${state.record}) play the ${state.opponent} today, but the game isn't on TV.` };
    case 'no-game':
      return { title: `Are the Brewers On TV? No game today — ${state.record} (${s})`,
        desc: `No Brewers game today. Current record: ${state.record}. Check the full ${s} schedule.` };
    case 'record':
      return { title: `${s} Milwaukee Brewers — ${state.record}`,
        desc: `The ${s} Milwaukee Brewers finished ${state.record}. Full game-by-game schedule and box scores.` };
    default:
      return { title: 'Are the Brewers On TV?',
        desc: 'Are the Milwaukee Brewers on TV today? Check the current schedule.' };
  }
}

function metaBlock({ title, desc, img, canonical }) {
  return `
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}">
    <link rel="canonical" href="${esc(canonical)}">
    <meta property="og:title" content="${esc(title)}">
    <meta property="og:description" content="${esc(desc)}">
    <meta property="og:image" content="${esc(img)}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:url" content="${esc(canonical)}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Are the Brewers On TV?">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(title)}">
    <meta name="twitter:description" content="${esc(desc)}">
    <meta name="twitter:image" content="${esc(img)}">`;
}



function notFound(res) {
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

function sendPage(res, shell, meta) {
  const html = shell.replace('</head>', `${metaBlock(meta)}\n</head>`);
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
  res.end(html);
}

async function serveHtml(req, res, season) {
  const origin = originOf(req);
  const state = await getSeasonState(season);
  const canonical = season ? `${origin}/${state.season}` : `${origin}/`;
  const { title, desc } = copy(state);
  sendPage(res, INDEX_VERSIONED, { title, desc, img: `${origin}/og/${state.season}.png`, canonical });
}

async function serveRecordsHtml(req, res, slug) {
  const origin = originOf(req);
  await liveRecordsVersion();
  const { title, desc } = recordsMeta(slug);
  const canonical = slug ? `${origin}/records/${slug}` : `${origin}/records`;
  const img = `${origin}/og/records/${slug || 'overview'}.png`;
  sendPage(res, RECORDS_VERSIONED, { title, desc, img, canonical });
}

function serveVsHtml(req, res, slug) {
  const origin = originOf(req);
  const { title, desc } = h2hMeta(slug);
  const canonical = slug ? `${origin}/vs/${slug}` : `${origin}/vs`;
  const img = `${origin}/og/vs/${slug || 'overview'}.png`;
  sendPage(res, VS_VERSIONED, { title, desc, img, canonical });
}

// --- Box score data (server-side CSV indices, built once and cached) ---

// Memoized as a promise so concurrent cold-start requests (the /game page
// and its /api/boxscore fetch arrive nearly together) share one build instead
// of each streaming the 400MB plays file.
let _boxIndicesPromise = null;
let _boxIndicesReady = null;
function getBoxIndices() {
  if (!_boxIndicesPromise) {
    _boxIndicesPromise = buildBoxIndices().then((idx) => { _boxIndicesReady = idx; return idx; });
  }
  return _boxIndicesPromise;
}

/** Refuse to start, loudly.
 *
 *  Exits rather than throwing so the container stops instead of limping: a
 *  process that never listens fails its health check, the deploy is marked bad,
 *  and the previous image keeps serving. The alternative — which is what
 *  happened — is a healthy-looking container quietly missing a section of every
 *  box score.
 */
function die(reason) {
  console.error('');
  console.error('FATAL: refusing to start.');
  console.error(`  ${reason}`);
  console.error('');
  console.error('  Fix the deploy, or set INDICES_ALLOW_DEGRADED=1 to start anyway');
  console.error('  and accept box scores without their Scoring Summary.');
  console.error('');
  process.exit(1);
}

/** Load the precomputed indices, or null if there is no usable artifact.
 *
 *  Everything below this is the fallback: building the same indices by
 *  streaming ~457MB of CSV, which takes 5.7 seconds and peaks at a 339MB heap
 *  against this box's 400MB cap. The artifact is 6.6MB and loads in 0.8s at
 *  174MB, so the fallback exists to be correct rather than to be used.
 *
 *  Every failure here returns null and falls through. A missing file is the
 *  ordinary case on a fresh clone before scripts/build-indices.mjs has run; a
 *  format mismatch means boxscore-core changed shape and the committed file is
 *  stale. Both should cost a slow boot, never a wrong box score. */
async function loadPrecomputedIndices() {
  const started = Date.now();
  // Set as soon as the manifest is read, and inspected by the catch below.
  let manifestPresent = false;
  try {
    const { readFile } = await import('node:fs/promises');
    const { createReadStream } = await import('node:fs');
    const { createInterface } = await import('node:readline');
    const { createBrotliDecompress } = await import('node:zlib');
    // The manifest is checked FIRST, and its directory is derived here rather
    // than imported, because the import below is itself a thing that can fail —
    // it is precisely what failed when .dockerignore excluded scripts/. Asking
    // build-indices.mjs where the artifacts live before knowing whether it can
    // be loaded gets the order backwards, and the first version of this guard
    // did exactly that: the import threw while manifestPresent was still false,
    // so a broken deploy was classified as a fresh clone and fell through to a
    // full CSV rebuild.
    const manifestRaw = await readFile(join(ROOT, 'data', 'indices', 'manifest.json'), 'utf8');
    manifestPresent = true;

    const { ARTIFACT_DIR, FORMAT, reviver } = await import('./scripts/build-indices.mjs');
    const manifest = JSON.parse(manifestRaw);
    if (manifest?.format !== FORMAT) {
      console.warn(`indices: artifacts are format ${manifest?.format}, expected ${FORMAT} — rebuilding from CSV`);
      return null;
    }

    // Streamed, decompressed and parsed a line at a time.
    //
    // Not an optimisation — it is the only shape that fits. Reading a whole
    // index and calling JSON.parse on it needs the entire document as a UTF-16
    // string, which for the batting index alone is ~94MB before the Map is
    // built. Doing that for all thirteen wanted a 600MB heap against this box's
    // 512MB. A line at a time costs one entry.
    //
    // This is the same reason the CSV fallback below streams rather than
    // reading files whole, and the comment there says so.
    const readIndex = async (name) => {
      const rl = createInterface({
        input: createReadStream(join(ARTIFACT_DIR, `${name}.ndjson.br`)).pipe(createBrotliDecompress()),
        crlfDelay: Infinity,
      });
      let header = null;
      let plain;
      const map = new Map();
      for await (const line of rl) {
        if (!line) continue;
        if (!header) { header = JSON.parse(line); continue; }
        // The reviver matters at every depth: pitchCounts, firstPa and risp are
        // Maps of Maps, and without it the inner ones arrive as plain objects
        // and every box score throws on .get().
        if (header.kind === 'map') { const [k, v] = JSON.parse(line, reviver); map.set(k, v); }
        else plain = JSON.parse(line, reviver);
      }
      if (!header) throw new Error(`${name}: empty artifact`);
      if (header.kind !== 'map') return plain;
      // The header carries the entry count, so a file truncated mid-write is
      // caught here rather than becoming an index that is quietly short.
      if (map.size !== header.size) {
        throw new Error(`${name}: ${map.size} entries, header says ${header.size}`);
      }
      return map;
    };

    const indices = {};
    for (const name of manifest.indices) indices[name] = await readIndex(name);

    // The reviver turns the tagged Maps back into Maps. If that ever silently
    // stopped working, every .get() below would return undefined and every box
    // score would render empty rather than throwing, so it is checked once here
    // where the failure is still cheap to describe.
    if (!(indices.games instanceof Map)) {
      // The artifacts loaded and are wrong, which is strictly worse than not
      // loading: every .get() would return undefined and every box score would
      // render empty without throwing.
      if (process.env.INDICES_ALLOW_DEGRADED !== '1') {
        die('the committed indices loaded but did not revive Maps — every box score would render empty');
      }
      console.warn('indices: artifacts did not revive Maps — rebuilding from CSV');
      return null;
    }
    console.log(`indices: loaded ${manifest.indices.length} artifacts in ${Date.now() - started}ms`);
    return indices;
  } catch (err) {
    // A missing manifest is a fresh clone and always has been. A manifest that
    // exists and then fails is a deploy that will serve box scores with no
    // Scoring Summary while answering 200 to everything, which is what happened
    // for a week and is why this branch is here rather than a bare `return null`.
    const { fatal, reason } = indexLoadOutcome({
      manifestPresent,
      error: err?.message,
      allowDegraded: process.env.INDICES_ALLOW_DEGRADED === '1',
    });
    if (fatal) die(reason);
    if (err?.code !== 'ENOENT') console.warn(`indices: ${err.message} — rebuilding from CSV`);
    return null;
  }
}

async function buildBoxIndices() {
  const precomputed = await loadPrecomputedIndices();
  if (precomputed) return finishIndices(precomputed);

  const started = Date.now();
  const { promises: p, createReadStream } = await import('node:fs');
  const { createInterface } = await import('node:readline');
  const read = async (f) => {
    try { return await p.readFile(join(ROOT, f), 'utf8'); } catch { return ''; }
  };
  // The multi-megabyte CSVs are streamed line by line, one file at a time —
  // reading them as whole strings (plus split() copies) pushed the build past
  // the ~256MB heap that small hosts give Node. A missing file just yields
  // nothing (e.g. an unfetched Git LFS pointer parses as an empty index).
  async function* fileLines(f) {
    try {
      const rl = createInterface({ input: createReadStream(join(ROOT, f), 'utf8'), crlfDelay: Infinity });
      yield* rl;
    } catch { /* file missing or unreadable */ }
  }
  const readScoringPlays = async () => {
    const collector = createScoringPlaysCollector();
    let first = true;
    for await (const line of fileLines('data/plays.lfs.csv')) {
      // The first line decides whether this is the file or a stand-in for it.
      // With the LFS smudge filter off — which is now how every image is built,
      // deliberately, since the image excludes the 388MB file — the working tree
      // holds a 130-byte pointer. Fed to the collector it yields zero scoring
      // plays and no error, which is the failure this whole guard exists for.
      if (first) {
        first = false;
        if (isLfsPointer(line) && process.env.INDICES_ALLOW_DEGRADED !== '1') {
          die(indexLoadOutcome({ manifestPresent: false, playsIsPointer: true }).reason);
        }
      }
      collector.line(line);
    }
    return collector.result();
  };

  const [namesRaw, teamstatsRaw, parksRaw] = await Promise.all([
    read('data/CurrentNames.csv'),
    read('data/teamstats.csv'),
    read('data/ballparks.csv'),
  ]);
  const indices = {
    ...(await readScoringPlays()),
    games: await buildGameIndex(fileLines('data/gameinfo.csv')),
    pitching: await buildPitchingIndex(fileLines('data/pitching.csv')),
    batting: await buildBattingIndex(fileLines('data/batting.csv')),
    fielding: await buildFieldingIndex(fileLines('data/fielding.csv')),
    playerNames: await buildPlayerNameMap(fileLines('data/biofile0.csv')),
    namesData: parseCurrentNamesCsv(namesRaw),
    parks: parseBallparksCsv(parksRaw),
    lineScores: parseTeamstatsLineScores(teamstatsRaw),
  };
  console.log(`box score indices built from CSV in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return finishIndices(indices);
}

/** Everything that has to happen whichever way the indices arrived.
 *
 *  Split out when the precomputed artifact was added, because these steps are
 *  cheap, derive from the indices rather than from the CSVs, and register
 *  things with other modules as a side effect. Running them on one path and
 *  not the other would mean the fast boot quietly served a site with no
 *  prev/next navigation and no batting feats — a difference that shows up as
 *  missing content rather than as an error.
 *
 *  gameNav in particular is deliberately not in the artifact: it is derived in
 *  a few milliseconds from games, and storing it would add a second copy of
 *  every gid to a file that already holds them once. */
function finishIndices(indices) {
  // Chronological neighbors for prev/next navigation between games.
  const ordered = [...indices.games.keys()].sort((a, b) => {
    const ga = indices.games.get(a), gb = indices.games.get(b);
    return (parseInt(ga.date, 10) - parseInt(gb.date, 10))
      || (parseInt(ga.number, 10) || 0) - (parseInt(gb.number, 10) || 0)
      || a.localeCompare(b);
  });
  indices.gameNav = new Map();
  ordered.forEach((gid, i) => indices.gameNav.set(gid, { prev: ordered[i - 1] || null, next: ordered[i + 1] || null }));
  // Cycles and player HR feats need per-player batting lines, which only
  // exist in these indices — hand them to the records module for the
  // /records page, meta, and cards.
  registerBattingFeats({
    ...computeBattingFeats(indices.batting, indices.playerNames),
    ...computeFieldingFeats(indices.fielding, indices.playerNames),
  });
  registerPitcherEra(indices.pitching, indices.playerNames);
  // Pitcher names for each no-hitter (one name = individual, more = combined).
  const nhPitchers = {};
  for (const nh of [...(records.noHitters || []), ...(records.perfectGames || [])]) {
    const rows = (indices.pitching.get(nh.gid) || [])
      .filter(p => BREWERS_IDS.has(p.team))
      .sort((a, b) => a.seq - b.seq);
    if (rows.length) nhPitchers[nh.gid] = rows.map(p => indices.playerNames.get(p.id) || p.id);
  }
  registerNoHitterPitchers(nhPitchers);
  // Fielders credited on each triple play, with positions.
  const tpByGid = {};
  for (const [gid, parts] of indices.tpFielders || []) {
    tpByGid[gid] = parts.map(p => ({
      name: indices.playerNames.get(p.id) || p.id,
      pos: POS_NAMES[p.pos] || String(p.pos),
    }));
  }
  registerTriplePlayFielders(tpByGid);
  return indices;
}

// Cache in front of ESPN's public API. Serves stale data if ESPN is briefly
// unreachable; only the endpoints listed in lib/espn-target.js are proxied. TTL is chosen
// per response: data that can no longer change (completed-game summaries,
// schedules whose games are all final) is held for a day; a mid-season
// schedule with no game underway refreshes hourly, since season-to-date
// results can't change until the next game starts; anything near or during
// a live game refreshes every 60s.
const espnProxyCache = new Map(); // target url -> { at, status, body, ttl }
const ESPN_PROXY_TTL = 60 * 1000;
const ESPN_PROXY_IDLE_TTL = 60 * 60 * 1000;
const ESPN_PROXY_FINAL_TTL = 24 * 60 * 60 * 1000;
const ESPN_PROXY_MAX_ENTRIES = 500;
const ESPN_GAME_SOON_MS = 2 * 60 * 60 * 1000;

function espnTtlFor(target, status, body) {
  if (status !== 200) return ESPN_PROXY_TTL;
  try {
    if (target.includes('/summary?')) {
      const done = JSON.parse(body)?.header?.competitions?.[0]?.status?.type?.completed;
      return done ? ESPN_PROXY_FINAL_TTL : ESPN_PROXY_TTL;
    }
    if (target.includes('/schedule')) {
      const events = JSON.parse(body)?.events || [];
      let allDone = events.length > 0;
      for (const e of events) {
        const st = e?.competitions?.[0]?.status?.type;
        // 'post' covers finals AND postponements-without-makeup-date; both are
        // settled until a reschedule, which the idle TTL picks up soon enough.
        if (st?.state === 'post') continue;
        allDone = false;
        if (st?.state === 'in') return ESPN_PROXY_TTL;
        const startsIn = Date.parse(e?.date || '') - Date.now();
        if (Number.isNaN(startsIn) || startsIn < ESPN_GAME_SOON_MS) return ESPN_PROXY_TTL;
      }
      return allDone ? ESPN_PROXY_FINAL_TTL : ESPN_PROXY_IDLE_TTL;
    }
  } catch { /* unparseable — treat as volatile */ }
  return ESPN_PROXY_TTL;
}

async function serveEspnProxy(res, path, search) {
  // Only the endpoints and numeric parameters the site uses; see espn-target.js.
  const target = espnTarget(path, search);
  if (!target) return notFound(res);
  const sendJson = (status, body, cacheState, ttl) => {
    const maxAge = cacheState === 'stale' || ttl === ESPN_PROXY_TTL ? 15
      : ttl === ESPN_PROXY_IDLE_TTL ? 300 : 3600;
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAge}`,
      'X-Proxy-Cache': cacheState,
    });
    res.end(body);
  };
  const hit = espnProxyCache.get(target);
  if (hit && Date.now() - hit.at < hit.ttl) return sendJson(hit.status, hit.body, 'hit', hit.ttl);
  try {
    const r = await fetch(target);
    const body = await r.text();
    if (espnProxyCache.size >= ESPN_PROXY_MAX_ENTRIES) {
      // Drop expired entries first so long-lived ones survive routine churn.
      for (const [k, v] of espnProxyCache) {
        if (Date.now() - v.at >= v.ttl) espnProxyCache.delete(k);
      }
      if (espnProxyCache.size >= ESPN_PROXY_MAX_ENTRIES) espnProxyCache.clear();
    }
    const ttl = espnTtlFor(target, r.status, body);
    espnProxyCache.set(target, { at: Date.now(), status: r.status, body, ttl });
    return sendJson(r.status, body, 'miss', ttl);
  } catch {
    if (hit) return sendJson(hit.status, hit.body, 'stale', hit.ttl);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'ESPN unreachable' }));
  }
}

async function serveBoxscoreApi(req, res, gid) {
  const idx = await getBoxIndices();
  const box = buildBoxscore(gid, idx);
  if (!box) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Game not found' })); }
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
  res.end(JSON.stringify(box));
}

// Game rows by gid, for each box score's own share card.
const gameByGid = new Map(allGames.map((r) => [r.gid, r]));

// --- Ballparks (ballparks.html) ---

// Built once, on first request, from the files already on disk: about 100ms.
// Retrosheet's seasons only — the season being played has no game-day data
// (attendance, time, temperature) until Retrosheet publishes it.
let ballparksData = null;
function ballparks() {
  if (!ballparksData) {
    const gameinfo = readFileSync(join(ROOT, 'data', 'gameinfo.csv'), 'utf8');
    const parks = new Map(parseBallparksCsv(readFileSync(join(ROOT, 'data', 'ballparks.csv'), 'utf8')).map((p) => [p.id, p]));
    ballparksData = ballparkStats(allGames, parseGameDay(gameinfo), parseTeamstatsLineScores(teamstatsRaw), parks);
  }
  return ballparksData;
}

// --- Calendar feed ---

// The season's schedule for the calendar, fetched at most every ten minutes:
// calendar apps poll on their own clocks, and a hundred subscribers should
// not be a hundred ESPN fetches.
let calendarSchedule = { at: 0, events: [] };
async function calendarEvents() {
  if (Date.now() - calendarSchedule.at > 10 * 60 * 1000) {
    try {
      calendarSchedule = { at: Date.now(), events: (await fetchEspn()).events };
    } catch {
      // Stale beats empty: an empty calendar would delete every game from
      // subscribers' calendars until the next good fetch.
      if (!calendarSchedule.events.length) throw new Error('schedule unavailable');
    }
  }
  return calendarSchedule.events;
}

async function serveCalendar(req, res, provider, areaParam) {
  if (provider && !tvLookup.providers[provider]) return notFound(res);
  const areas = provider ? tvLookup.providers[provider].service_areas.length : 0;
  const area = /^\d+$/.test(areaParam || '') && Number(areaParam) < areas ? Number(areaParam) : 0;
  let events;
  try { events = await calendarEvents(); } catch {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '600' });
    return res.end('Schedule unavailable; try again shortly.');
  }
  const ics = buildCalendar(events, tvLookup, simulcasts, { provider, area, origin: originOf(req) });
  res.writeHead(200, {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': `inline; filename="brewers${provider ? `-${provider}` : ''}.ics"`,
    'Cache-Control': 'public, max-age=600',
  });
  return res.end(ics);
}

// --- Player stats (stats.html) ---

// Each season's regular-season games, and the player tables built from them.
// A season's tables never change once Retrosheet has it, so each is built
// once, on first request, from the box score indices already in memory.
const statsGidsBySeason = regularGidsBySeason(allGames);
const STATS_SEASONS = [...statsGidsBySeason.keys()].sort((a, b) => a - b);
const statsCache = new Map();
async function seasonStats(season) {
  if (!statsCache.has(season)) {
    const idx = await getBoxIndices();
    const gids = statsGidsBySeason.get(season);
    statsCache.set(season, {
      season, seasons: STATS_SEASONS,
      batting: seasonBatting(idx.batting, gids, idx.playerNames, BREWERS_IDS),
      pitching: seasonPitching(idx.pitching, gids, idx.playerNames, BREWERS_IDS),
      fielding: seasonFielding(idx.fielding, gids, idx.playerNames, BREWERS_IDS),
      fieldingTotals: seasonFieldingTotals(idx.fielding, gids, idx.playerNames, BREWERS_IDS),
    });
  }
  return statsCache.get(season);
}

// Career and single-season leaderboards: every season's tables, built once.
// About 100ms over all the seasons once the indices are warm.
let statsLeaders = null;
async function allSeasonStats() {
  const seasons = [];
  for (const yr of STATS_SEASONS) seasons.push(await seasonStats(yr));
  return seasons;
}
async function leaders() {
  if (!statsLeaders) {
    const seasons = await allSeasonStats();
    const teamGames = new Map(STATS_SEASONS.map((yr) => [yr, statsGidsBySeason.get(yr).length]));
    statsLeaders = { ...buildLeaders(seasons, teamGames), range: { first: STATS_SEASONS[0], last: STATS_SEASONS[STATS_SEASONS.length - 1] } };
  }
  return statsLeaders;
}

// Player pages: a player's seasons are picked out of the season tables on
// request (milliseconds), and the biographical line comes from biofile0.csv,
// read once and kept only for players who appear in the tables.
let statsBios = null;
async function bios() {
  if (!statsBios) {
    const seasons = await allSeasonStats();
    const ids = new Set(seasons.flatMap((s) => [...s.batting, ...s.pitching, ...s.fielding].map((l) => l.id)));
    statsBios = parseBios(readFileSync(join(ROOT, 'data', 'biofile0.csv'), 'utf8'), ids);
  }
  return statsBios;
}

async function playerData(id) {
  if (!PLAYER_ID.test(id)) return null;
  const p = playerSeasons(await allSeasonStats(), id);
  if (!p) return null;
  return { ...p, bio: (await bios()).get(id) || null };
}

// The player search's list: every Brewer once — 1,074 through 2025, 85KB.
let statsDirectory = null;
async function servePlayersApi(res) {
  if (!statsDirectory) statsDirectory = JSON.stringify(playerDirectory(await allSeasonStats()));
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
  return res.end(statsDirectory);
}

// Brewers born on a day, for the On This Day panel. Small and fixed for a
// given day, so the CDN can keep each one.
let statsDirectoryList = null;
async function serveBornApi(res, monthDay) {
  statsDirectoryList ||= playerDirectory(await allSeasonStats());
  const born = bornOn(statsDirectoryList, await bios(), monthDay);
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
  return res.end(JSON.stringify(born));
}

async function servePlayerApi(res, id) {
  const p = await playerData(id);
  if (!p) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'No Brewers stats for that player' }));
  }
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
  return res.end(JSON.stringify(p));
}

// The title and description name the player and his Brewers line, so a
// shared link reads as him. They need the indices, so a cold start serves
// the generic ones rather than make the page wait, as box scores do.
async function servePlayerHtml(req, res, id) {
  const origin = originOf(req);
  const p = _boxIndicesReady ? await playerData(id) : null;
  if (_boxIndicesReady && !p) return notFound(res);
  const span = p ? (p.first === p.last ? `${p.first}` : `${p.first}–${p.last}`) : '';
  const b = p?.career.batting, pi = p?.career.pitching;
  const c = (v) => v.toLocaleString('en-US');
  const line = pi && (!b || pi.ipouts / 3 > b.pa / 4)
    ? `${pi.w}-${pi.l}, ${pi.era === null ? '—' : pi.era.toFixed(2)} ERA, ${c(pi.k)} strikeouts in ${pi.ip} innings`
    : b ? `${b.avg === null ? '—' : b.avg.toFixed(3).replace(/^0/, '')}, ${c(b.hr)} home runs, ${c(b.h)} hits, ${c(b.rbi)} RBI` : '';
  sendPage(res, PLAYER_VERSIONED, {
    title: p ? `${p.name} — Milwaukee Brewers Stats` : 'Milwaukee Brewers Player Stats',
    desc: p ? `${p.name} with the Brewers, ${span}: ${line}. Season by season, regular season.` : 'Season-by-season Milwaukee Brewers stats.',
    img: `${origin}/og/records/overview.png`,
    canonical: `${origin}/player/${id}`,
  });
}

async function serveLeadersApi(res) {
  const body = JSON.stringify(await leaders());
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
  return res.end(body);
}

async function serveStatsApi(res, season) {
  if (!statsGidsBySeason.has(season)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'No stats for that season' }));
  }
  const body = JSON.stringify(await seasonStats(season));
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
  return res.end(body);
}

const LEADER_VIEWS = {
  career: { title: 'Milwaukee Brewers Career Leaders', desc: 'Franchise career leaders in hits, home runs, RBI, wins, saves, strikeouts, ERA and more.' },
  'single-season': { title: 'Milwaukee Brewers Single-Season Leaders', desc: 'The best single seasons in franchise history: home runs, batting average, wins, strikeouts, ERA and more.' },
};

function serveLeadersHtml(req, res, view) {
  const origin = originOf(req);
  sendPage(res, STATS_VERSIONED, {
    ...LEADER_VIEWS[view],
    img: `${origin}/og/records/overview.png`,
    canonical: `${origin}/stats/${view}`,
  });
}

function serveStatsHtml(req, res, yr) {
  const origin = originOf(req);
  sendPage(res, STATS_VERSIONED, {
    title: `${yr} Milwaukee Brewers Stats`,
    desc: `Batting, pitching and fielding for every ${yr} Milwaukee Brewer: regular season, sortable.`,
    img: `${origin}/og/${yr}.png`,
    canonical: `${origin}/stats/${yr}`,
  });
}

async function serveGameHtml(req, res, gid) {
  const origin = originOf(req);
  const canonical = `${origin}/game/${gid}`;
  // Never block the page on the index build — the shell renders its own
  // loading state and the /api/boxscore fetch waits instead. Only a cold
  // start serves generic meta tags here.
  const box = _boxIndicesReady ? buildBoxscore(gid, _boxIndicesReady) : null;
  const title = box ? `${box.game.visName} @ ${box.game.homeName} — ${box.game.date}` : 'Box Score';
  const desc = box ? `Full box score: ${box.game.visName} ${box.game.visScore}, ${box.game.homeName} ${box.game.homeScore} (${box.game.date}). Milwaukee Brewers historical game.` : 'Milwaukee Brewers historical game box score.';
  const img = gameByGid.has(gid) ? `${origin}/og/game/${gid}.png` : `${origin}/og/default.png`;
  sendPage(res, GAME_VERSIONED, { title, desc, img, canonical });
}

const staticImgCache = new Map();
let historyCard = { key: null, png: null };
let recordsCardsVersion = null;
function serveCachedPng(res, key, render) {
  let buf = staticImgCache.get(key);
  if (!buf) {
    buf = render();
    staticImgCache.set(key, buf);
  }
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' });
  res.end(buf);
}

const imgCache = new Map();
async function serveImage(req, res, season) {
  const cur = defaultSeason();
  const isPast = season < cur;
  const ttl = isPast ? Infinity : 60 * 1000;
  const hit = imgCache.get(season);
  let buf;
  if (hit && Date.now() - hit.at < ttl) {
    buf = hit.buf;
  } else {
    const state = await getSeasonState(season);
    buf = renderPng(state);
    imgCache.set(season, { buf, at: Date.now() });
  }
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Cache-Control': isPast ? 'public, max-age=31536000, immutable' : 'public, max-age=60',
  });
  res.end(buf);
}

async function serveStatic(req, res, pathname) {
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, safe);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  try {
    const st = await stat(file);
    if (st.isDirectory()) throw new Error('dir');
    const body = await readFile(file);
    const versioned = /[?&]v=/.test(req.url);
    const ext = extname(file).toLowerCase();
    const cache = versioned ? 'public, max-age=31536000, immutable'
      : ext === '.js' ? 'no-cache'
      : 'public, max-age=3600';
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': cache,
    });
    res.end(body);
  } catch {
    if (extname(pathname)) return notFound(res);
    await serveHtml(req, res, undefined);
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const pathname = decodeURIComponent(url.pathname);

    const ogRec = pathname.match(/^\/og\/records\/([a-z-]+)\.png$/);
    if (ogRec) {
      if (ogRec[1] !== 'overview' && !isRecordSlug(ogRec[1])) return notFound(res);
      // Keyed on whether the box score index is warm: no-hitter pitchers,
      // cycles and multi-HR games arrive with it, and a card first drawn
      // during a cold start was otherwise kept without them until restart.
      const warm = _boxIndicesReady ? 'warm' : 'cold';
      // And on the season being played: when its games change, every records
      // card is stale, so they are dropped rather than left to pile up one
      // set per day.
      const version = await liveRecordsVersion();
      if (version !== recordsCardsVersion) {
        for (const k of staticImgCache.keys()) if (k.startsWith('records:')) staticImgCache.delete(k);
        recordsCardsVersion = version;
      }
      return serveCachedPng(res, `records:${ogRec[1]}:${warm}`, () => renderRecordsPng(ogRec[1], records));
    }

    const ogVs = pathname.match(/^\/og\/vs\/([a-z0-9-]+)\.png$/);
    if (ogVs) {
      if (ogVs[1] !== 'overview' && !isOpponentSlug(ogVs[1])) return notFound(res);
      return serveCachedPng(res, `vs:${ogVs[1]}`, () => renderH2hPng(ogVs[1], h2h));
    }

    // A box score's card. Not kept in staticImgCache: there are 9,000 games,
    // and a crawler walking them would hold every PNG in memory. A past game
    // never changes, so the CDN can keep it instead.
    const ogGame = pathname.match(/^\/og\/game\/([A-Z0-9]{3}\d{9})\.png$/);
    if (ogGame) {
      const row = gameByGid.get(ogGame[1]);
      if (!row) return notFound(res);
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' });
      return res.end(renderGamePng(row));
    }

    const img = pathname.match(/^\/og\/(\d{4})\.png$/);
    if (img) return await serveImage(req, res, parseInt(img[1], 10));
    if (pathname === '/og/default.png' || pathname === '/og.png')
      return await serveImage(req, res, defaultSeason());

    if (pathname === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
      return res.end('User-agent: *\nAllow: /\n');
    }

    if (pathname === '/' || pathname === '/index.html') {
      const q = url.searchParams.get('season');
      return await serveHtml(req, res, q ? parseInt(q, 10) : undefined);
    }
    const yr = pathname.match(/^\/(\d{4})\/?$/);
    if (yr) return await serveHtml(req, res, parseInt(yr[1], 10));

    if (pathname === '/records' || pathname === '/records/' || pathname === '/records.html')
      return await serveRecordsHtml(req, res, undefined);
    if (pathname.startsWith('/records/')) {
      const slug = pathname.slice('/records/'.length).replace(/\/$/, '');
      if (!isRecordSlug(slug)) return notFound(res);
      return await serveRecordsHtml(req, res, slug);
    }

    if (pathname === '/history' || pathname === '/history/' || pathname === '/history.html') {
      const origin = originOf(req);
      const { title, desc } = historyMeta(await liveSeasonHistory());
      return sendPage(res, HISTORY_VERSIONED, {
        title, desc, img: `${origin}/og/history.png`, canonical: `${origin}/history`,
      });
    }
    // Rendered again when the season being played changes, not cached for
    // the life of the process: one card, replaced, rather than one per day.
    if (pathname === '/og/history.png') {
      const history = await liveSeasonHistory();
      const last = history[history.length - 1];
      const key = `${last.season}:${last.record}:${last.postseason}`;
      if (historyCard.key !== key) historyCard = { key, png: renderHistoryPng(history) };
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' });
      return res.end(historyCard.png);
    }

    if (pathname === '/api/ballparks') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
      return res.end(JSON.stringify(ballparks()));
    }
    if (pathname === '/ballparks' || pathname === '/ballparks/' || pathname === '/ballparks.html') {
      const origin = originOf(req);
      const { parks, biggestCrowds, longestTime } = ballparks();
      const names = parks.map((p) => p.name).join(', ');
      return sendPage(res, BALLPARKS_VERSIONED, {
        title: 'Milwaukee Brewers Ballparks & Game-Day Records',
        desc: `Every Brewers home park — ${names} — with its record and crowds, and the biggest crowds (${biggestCrowds[0]?.attendance.toLocaleString('en-US')}), longest games (${longestTime[0]?.innings} innings) and hottest and coldest days.`,
        img: `${origin}/og/ballparks.png`,
        canonical: `${origin}/ballparks`,
      });
    }
    if (pathname === '/og/ballparks.png')
      return serveCachedPng(res, 'ballparks', () => renderBallparksPng(ballparks()));

    if (pathname === '/managers' || pathname === '/managers/' || pathname === '/managers.html') {
      const origin = originOf(req);
      const { title, desc } = coachesMeta();
      return sendPage(res, MANAGERS_VERSIONED, {
        title, desc, img: `${origin}/og/managers.png`, canonical: `${origin}/managers`,
      });
    }
    if (pathname === '/og/managers.png')
      return serveCachedPng(res, 'managers', () => renderCoachesPng(coaches));

    if (pathname === '/vs' || pathname === '/vs/' || pathname === '/vs.html')
      return serveVsHtml(req, res, undefined);
    if (pathname.startsWith('/vs/')) {
      const slug = pathname.slice('/vs/'.length).replace(/\/$/, '');
      if (!isOpponentSlug(slug)) return notFound(res);
      return serveVsHtml(req, res, slug);
    }

    // ESPN API proxy: browsers hit this instead of ESPN directly, so a page
    // full of visitors (and 30-second live polling) shares one upstream
    // request per TTL window instead of each polling ESPN.
    if (pathname.startsWith('/api/espn/')) {
      return await serveEspnProxy(res, pathname.slice('/api/espn/'.length), url.search);
    }

    // Current-season games as Retrosheet-shaped CSV data lines (no header),
    // for the h2h/history/managers pages to append to the real CSVs. Empty
    // once Retrosheet's files cover the season.
    if (pathname === '/api/current/gameinfo.csv' || pathname === '/api/current/teamstats.csv') {
      const cur = await getCurrentSeasonCsvs();
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
      return res.end(pathname.endsWith('/gameinfo.csv') ? cur.gameinfo : cur.teamstats);
    }

    // Batting feats for the records page — computed server-side from the
    // batting index (the raw batting CSV is far too large to ship to the
    // browser).
    if (pathname === '/api/records/batting') {
      await getBoxIndices();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
      return res.end(JSON.stringify({
        cycles: records.cycles || [],
        playerHrGames: records.playerHrGames || [],
        playerRbiGames: records.playerRbiGames || [],
        playerErrorGames: records.playerErrorGames || [],
        noHitterPitchers: records.noHitterPitchers || {},
        triplePlayFielders: records.triplePlayFielders || {},
        bestPitcherEra: records.bestPitcherEra || [],
        worstPitcherEra: records.worstPitcherEra || [],
      }));
    }

    const boxApi = pathname.match(/^\/api\/boxscore\/(.+)$/);
    if (boxApi) return await serveBoxscoreApi(req, res, boxApi[1]);

    if (pathname === '/calendar.ics') return await serveCalendar(req, res, null, null);
    const calendarFor = pathname.match(/^\/calendar\/([a-z_]+)\.ics$/);
    if (calendarFor) return await serveCalendar(req, res, calendarFor[1], url.searchParams.get('area'));

    if (pathname === '/api/stats/leaders') return await serveLeadersApi(res);
    if (pathname === '/api/players') return await servePlayersApi(res);
    const bornApi = pathname.match(/^\/api\/born\/((?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01]))$/);
    if (bornApi) return await serveBornApi(res, bornApi[1]);
    const playerApi = pathname.match(/^\/api\/player\/([^/]+)$/);
    if (playerApi) return await servePlayerApi(res, playerApi[1]);
    const playerPage = pathname.match(/^\/player\/([^/]+)\/?$/);
    if (playerPage) {
      if (!PLAYER_ID.test(playerPage[1])) return notFound(res);
      return await servePlayerHtml(req, res, playerPage[1]);
    }
    const leaderView = pathname.match(/^\/stats\/(career|single-season)\/?$/);
    if (leaderView) return serveLeadersHtml(req, res, leaderView[1]);
    const statsApi = pathname.match(/^\/api\/stats\/(\d{4})$/);
    if (statsApi) return await serveStatsApi(res, parseInt(statsApi[1], 10));
    // No season in the path: send the newest, so every stats URL names one and
    // the page never has to guess.
    if (pathname === '/stats' || pathname === '/stats/' || pathname === '/stats.html') {
      res.writeHead(302, { Location: `/stats/${STATS_SEASONS[STATS_SEASONS.length - 1]}` });
      return res.end();
    }
    const statsPage = pathname.match(/^\/stats\/(\d{4})\/?$/);
    if (statsPage) {
      const yr = parseInt(statsPage[1], 10);
      if (!statsGidsBySeason.has(yr)) return notFound(res);
      return serveStatsHtml(req, res, yr);
    }

    const gameRoute = pathname.match(/^\/game\/(.+)$/);
    if (gameRoute) return await serveGameHtml(req, res, gameRoute[1]);

    return await serveStatic(req, res, pathname);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Server error');
    console.error(e);
  }
});

server.listen(PORT, () => {
  console.log(`listening on :${PORT}`);
  // Warm the box score indices in the background so the first visitor after
  // a deploy or spin-down doesn't pay the full CSV/plays parse on request.
  getBoxIndices().catch((err) => console.error('box index warmup failed:', err));
});
