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
import { esc } from './records-core.js';

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
const HISTORY_VERSIONED = loadShell('history.html', ['history.js', 'styles.css']);
const COACHES_VERSIONED = loadShell('coaches.html', ['coaches.js', 'styles.css']);

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

    if (pathname === '/coaches' || pathname === '/coaches/' || pathname === '/coaches.html') {
      const origin = originOf(req);
      const { title, desc } = coachesMeta();
      return sendPage(res, COACHES_VERSIONED, {
        title, desc, img: `${origin}/og/coaches.png`, canonical: `${origin}/coaches`,
      });
    }
    if (pathname === '/og/coaches.png')
      return serveCachedPng(res, 'coaches', () => renderCoachesPng(coaches));

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
