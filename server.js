// Minimal web service for arethepackersundefeated.com
// - serves the static site
// - injects per-URL Open Graph / Twitter meta so shared links preview correctly
// - renders per-season social cards at /og/:season.png
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, normalize, extname } from 'node:path';
import { renderPng, renderRecordsPng, renderH2hPng, renderHistoryPng } from './lib/cards.js';
import { getSeasonState, defaultSeason } from './lib/seasons.js';
import { records, recordsMeta, isRecordSlug, seasonHistory, historyMeta } from './lib/records.js';
import { h2h, h2hMeta, isOpponentSlug } from './lib/h2h.js';
import { esc } from './records-core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PORT = process.env.PORT || 3000;

// Stamp a short content hash onto local asset refs so a new deploy busts the
// browser cache automatically (main.js?v=<hash>). Change the file -> new hash.
function assetVersion(file) {
  try { return createHash('sha1').update(readFileSync(join(ROOT, file))).digest('hex').slice(0, 8); }
  catch { return null; }
}

// Load an HTML shell: strip any hardcoded <title>/description/OG/Twitter/
// canonical tags so the server is the single source of truth and pages never
// ship duplicate, conflicting meta (a static og:url will otherwise override
// per-URL tags), then version the given local assets (relative or /-rooted).
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
const HISTORY_VERSIONED = loadShell('history.html', ['history.js', 'styles.css']);

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
      return { title: `Are the Packers Undefeated? YES — ${state.record} (${s})`,
        desc: `The ${s} Green Bay Packers ${past ? 'finished' : 'are'} UNDEFEATED at ${state.record}.` };
    case 'champions':
      return { title: `${s} Green Bay Packers — Super Bowl Champions`,
        desc: `The ${s} Green Bay Packers won ${state.superBowlName || 'the Super Bowl'}.` };
    case 'offseason':
      return { title: `Are the Packers Undefeated? — ${s} offseason`,
        desc: `The ${s} season hasn't started yet. Undefeated for now!` };
    case 'no':
      return { title: `Are the Packers Undefeated? NO — ${state.record} (${s})`,
        desc: `The ${s} Green Bay Packers ${are} ${state.record}.` };
    default:
      return { title: 'Are the Packers Undefeated?',
        desc: 'The only question that matters: are the Green Bay Packers undefeated this season?' };
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
    <meta property="og:site_name" content="Are the Packers Undefeated?">
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
  // Canonical/og:url must be the CLEAN per-season URL — never echo the query
  // string (Facebook/X append ?fbclid=, ?utm_*), and never fall back to root
  // for a season page, or crawlers will canonicalize the whole thing away.
  const canonical = season ? `${origin}/${state.season}` : `${origin}/`;
  const { title, desc } = copy(state);
  sendPage(res, INDEX_VERSIONED, { title, desc, img: `${origin}/og/${state.season}.png`, canonical });
}

// /records and /records/<slug>: same shell, per-slug meta + social card.
function serveRecordsHtml(req, res, slug) {
  const origin = originOf(req);
  const { title, desc } = recordsMeta(slug);
  const canonical = slug ? `${origin}/records/${slug}` : `${origin}/records`;
  const img = `${origin}/og/records/${slug || 'overview'}.png`;
  sendPage(res, RECORDS_VERSIONED, { title, desc, img, canonical });
}

// /vs and /vs/<opponent>: same shell, per-opponent meta + social card.
function serveVsHtml(req, res, slug) {
  const origin = originOf(req);
  const { title, desc } = h2hMeta(slug);
  const canonical = slug ? `${origin}/vs/${slug}` : `${origin}/vs`;
  const img = `${origin}/og/vs/${slug || 'overview'}.png`;
  sendPage(res, VS_VERSIONED, { title, desc, img, canonical });
}

// Records/h2h data is fixed for the lifetime of the process (CSV is read at
// startup; updates arrive via redeploy), so render each card at most once.
const staticImgCache = new Map(); // cache key -> buf
function serveCachedPng(res, key, render) {
  let buf = staticImgCache.get(key);
  if (!buf) {
    buf = render();
    staticImgCache.set(key, buf);
  }
  res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' });
  res.end(buf);
}

const imgCache = new Map(); // season -> { buf, at }
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
    // Unversioned JS (module imports like records-core.js can't carry ?v=)
    // must revalidate on every load, or a deploy can pair a fresh versioned
    // entry module with an hour-stale dependency.
    const cache = versioned ? 'public, max-age=31536000, immutable'
      : ext === '.js' ? 'no-cache'
      : 'public, max-age=3600';
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': cache,
    });
    res.end(body);
  } catch {
    // Real assets (paths with a file extension) that don't exist must 404 —
    // returning HTML for a missing .png/.ico/.txt confuses crawlers (esp. Twitterbot).
    if (extname(pathname)) return notFound(res);
    // Extension-less route: serve the app shell with default meta (SPA fallback).
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
      // Only exact known slugs get the page; anything else (bad case, extra
      // segments) must 404, not fall through to the homepage SPA fallback.
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

    if (pathname === '/vs' || pathname === '/vs/' || pathname === '/vs.html')
      return serveVsHtml(req, res, undefined);
    if (pathname.startsWith('/vs/')) {
      const slug = pathname.slice('/vs/'.length).replace(/\/$/, '');
      if (!isOpponentSlug(slug)) return notFound(res);
      return serveVsHtml(req, res, slug);
    }

    return await serveStatic(req, res, pathname);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Server error');
    console.error(e);
  }
});

server.listen(PORT, () => console.log(`listening on :${PORT}`));