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
import { renderPng, renderRecordsPng, renderH2hPng, renderHistoryPng, renderCoachesPng } from './lib/cards.js';
import { getSeasonState, defaultSeason } from './lib/seasons.js';
import { records, recordsMeta, isRecordSlug, seasonHistory, historyMeta } from './lib/records.js';
import { coaches, coachesMeta } from './lib/coaches.js';
import { h2h, h2hMeta, isOpponentSlug } from './lib/h2h.js';
import { esc, parseCurrentNamesCsv, parseBallparksCsv, parseTeamstatsLineScores } from './records-core.js';
import { buildGameIndex, buildPitchingIndex, buildBattingIndex, buildFieldingIndex, buildPlayerNameMap, buildBoxscore, createScoringPlaysCollector } from './boxscore-core.js';

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

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
};

function copy(state) {
  const s = state.season;
  const past = s < defaultSeason();
  const are = past ? 'finished' : 'are';
  switch (state.kind) {
    case 'undefeated':
      return { title: `Are the Brewers On TV? YES — ${state.record} (${s})`,
        desc: `The ${s} Milwaukee Brewers ${past ? 'finished' : 'are'} UNDEFEATED at ${state.record}.` };
    case 'champions':
      return { title: `${s} Milwaukee Brewers — World Series Champions`,
        desc: `The ${s} Milwaukee Brewers won ${state.worldSeriesName || 'the World Series'}.` };
    case 'offseason':
      return { title: `Are the Brewers On TV? — ${s} offseason`,
        desc: `The ${s} season hasn't started yet. Undefeated for now!` };
    case 'no':
      return { title: `Are the Brewers On TV? NO — ${state.record} (${s})`,
        desc: `The ${s} Milwaukee Brewers ${are} ${state.record}.` };
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

function originOf(req) {
  const proto = (req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
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

function serveRecordsHtml(req, res, slug) {
  const origin = originOf(req);
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

async function buildBoxIndices() {
  const started = Date.now();
  const { promises: p } = await import('fs');
  const read = async (f) => {
    try { return await p.readFile(f, 'utf8'); } catch { return ''; }
  };
  const [gameinfoRaw, namesRaw, teamstatsRaw, bioRaw, pitchingRaw, battingRaw, fieldingRaw, parksRaw] = await Promise.all([
    read(join(ROOT, 'data/gameinfo.csv')),
    read(join(ROOT, 'data/CurrentNames.csv')),
    read(join(ROOT, 'data/teamstats.csv')),
    read(join(ROOT, 'data/biofile0.csv')),
    read(join(ROOT, 'data/pitching.csv')),
    read(join(ROOT, 'data/batting.csv')),
    read(join(ROOT, 'data/fielding.csv')),
    read(join(ROOT, 'data/ballparks.csv')),
  ]);
  // The play-by-play file is ~400MB, far too large to hold as one string, so
  // it is streamed line by line and only scoring plays are kept. If the file
  // is missing or is an unfetched Git LFS pointer the index is simply empty
  // and the box score omits the scoring summary.
  const readScoringPlays = async () => {
    const collector = createScoringPlaysCollector();
    try {
      const { createReadStream } = await import('node:fs');
      const { createInterface } = await import('node:readline');
      const rl = createInterface({ input: createReadStream(join(ROOT, 'data/plays.lfs.csv'), 'utf8'), crlfDelay: Infinity });
      for await (const line of rl) collector.line(line);
    } catch { /* no plays data available */ }
    return collector.result();
  };

  const namesData = parseCurrentNamesCsv(namesRaw);
  const indices = {
    ...(await readScoringPlays()),
    games: buildGameIndex(gameinfoRaw),
    pitching: buildPitchingIndex(pitchingRaw),
    batting: buildBattingIndex(battingRaw),
    fielding: buildFieldingIndex(fieldingRaw),
    playerNames: buildPlayerNameMap(bioRaw),
    namesData,
    parks: parseBallparksCsv(parksRaw),
    lineScores: parseTeamstatsLineScores(teamstatsRaw),
  };
  console.log(`box score indices built in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return indices;
}

async function serveBoxscoreApi(req, res, gid) {
  const idx = await getBoxIndices();
  const box = buildBoxscore(gid, idx);
  if (!box) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'Game not found' })); }
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' });
  res.end(JSON.stringify(box));
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
  sendPage(res, GAME_VERSIONED, { title, desc, img: `${origin}/og/default.png`, canonical });
}

const staticImgCache = new Map();
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
      return serveCachedPng(res, `records:${ogRec[1]}`, () => renderRecordsPng(ogRec[1], records));
    }

    const ogVs = pathname.match(/^\/og\/vs\/([a-z0-9-]+)\.png$/);
    if (ogVs) {
      if (ogVs[1] !== 'overview' && !isOpponentSlug(ogVs[1])) return notFound(res);
      return serveCachedPng(res, `vs:${ogVs[1]}`, () => renderH2hPng(ogVs[1], h2h));
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
      return serveRecordsHtml(req, res, undefined);
    if (pathname.startsWith('/records/')) {
      const slug = pathname.slice('/records/'.length).replace(/\/$/, '');
      if (!isRecordSlug(slug)) return notFound(res);
      return serveRecordsHtml(req, res, slug);
    }

    if (pathname === '/history' || pathname === '/history/' || pathname === '/history.html') {
      const origin = originOf(req);
      const { title, desc } = historyMeta();
      return sendPage(res, HISTORY_VERSIONED, {
        title, desc, img: `${origin}/og/history.png`, canonical: `${origin}/history`,
      });
    }
    if (pathname === '/og/history.png')
      return serveCachedPng(res, 'history', () => renderHistoryPng(seasonHistory));

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

    const boxApi = pathname.match(/^\/api\/boxscore\/(.+)$/);
    if (boxApi) return await serveBoxscoreApi(req, res, boxApi[1]);

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
