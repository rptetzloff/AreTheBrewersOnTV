// Open Graph social card generator (1200x630) for arethebrewersontv.com
// Renders SVG -> PNG with bundled fonts so output is identical everywhere.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import * as OT from 'opentype.js';
import { formatDate, streakSpan, esc } from '../records-core.js';
import { meetings } from '../h2h-core.js';
import { buildChartSvg } from '../history-chart.js';

const opentype = OT.default ?? OT;
const __dirname = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = join(__dirname, '..', 'fonts');
const BOLD = join(FONT_DIR, 'LiberationSans-Bold.ttf');
const REGULAR = join(FONT_DIR, 'LiberationSans-Regular.ttf');

const boldFont = opentype.parse(readFileSync(BOLD).buffer);

const NAVY_DARK = '#0d1d38';
const NAVY = '#12284B';
const GOLD = '#FFC52F';
const WHITE = '#FFFFFF';
const SUB = '#C5D5E8';
const FONT = 'Liberation Sans';
const CAP_RATIO = 106 / 150; // cap height / font size for Liberation Sans Bold

// Baseball SVG centered at (cx, cy)
function baseball(cx, cy, r = 72) {
  return `<g transform="translate(${cx},${cy})">
    <circle r="${r}" fill="${WHITE}" stroke="${NAVY_DARK}" stroke-width="5"/>
    <path d="M -${r * 0.35} -${r * 0.85} C -${r * 0.1} -${r * 0.55} -${r * 0.1} ${r * 0.55} -${r * 0.35} ${r * 0.85}" fill="none" stroke="#CC0000" stroke-width="4"/>
    <path d="M ${r * 0.35} -${r * 0.85} C ${r * 0.1} -${r * 0.55} ${r * 0.1} ${r * 0.55} ${r * 0.35} ${r * 0.85}" fill="none" stroke="#CC0000" stroke-width="4"/>
    <line x1="-${r * 0.3}" y1="-${r * 0.7}" x2="-${r * 0.12}" y2="-${r * 0.62}" stroke="#CC0000" stroke-width="2.5"/>
    <line x1="-${r * 0.3}" y1="-${r * 0.5}" x2="-${r * 0.12}" y2="-${r * 0.42}" stroke="#CC0000" stroke-width="2.5"/>
    <line x1="-${r * 0.3}" y1="-${r * 0.3}" x2="-${r * 0.12}" y2="-${r * 0.22}" stroke="#CC0000" stroke-width="2.5"/>
    <line x1="${r * 0.12}" y1="-${r * 0.62}" x2="${r * 0.3}" y2="-${r * 0.7}" stroke="#CC0000" stroke-width="2.5"/>
    <line x1="${r * 0.12}" y1="-${r * 0.42}" x2="${r * 0.3}" y2="-${r * 0.5}" stroke="#CC0000" stroke-width="2.5"/>
    <line x1="${r * 0.12}" y1="-${r * 0.22}" x2="${r * 0.3}" y2="-${r * 0.3}" stroke="#CC0000" stroke-width="2.5"/>
  </g>`;
}

// Big centered word. Letters (ignoring trailing . or !) are centered on x=600,
// with `gap` px between the baseball's bottom edge and the letter cap-tops.
function bigWord(text, color, baseballCy, { gap = 40, size = 150 } = {}) {
  const letters = text.replace(/[.!]+$/, '');
  const w = boldFont.getAdvanceWidth(letters, size);
  const xLeft = 600 - w / 2;
  const baseline = baseballCy + 72 + 3 + gap + CAP_RATIO * size;
  const svg = `<text x="${xLeft.toFixed(1)}" y="${baseline.toFixed(1)}" font-family="${FONT}" `
    + `font-size="${size}" font-weight="bold" fill="${color}" text-anchor="start">${esc(text)}</text>`;
  return { svg, baseline };
}

function frame(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><radialGradient id="bg" cx="50%" cy="38%" r="80%">
    <stop offset="0%" stop-color="${NAVY}"/><stop offset="100%" stop-color="${NAVY_DARK}"/>
  </radialGradient></defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="0" y="0" width="1200" height="14" fill="${GOLD}"/>
  <rect x="0" y="616" width="1200" height="14" fill="${GOLD}"/>
  ${inner}
  <text x="600" y="586" font-family="${FONT}" font-size="30" font-weight="bold" fill="${GOLD}" text-anchor="middle" letter-spacing="2">arethebrewersontv.com</text>
</svg>`;
}

const sub = (y, text) =>
  `<text x="600" y="${y}" font-family="${FONT}" font-size="30" fill="${SUB}" text-anchor="middle">${esc(text)}</text>`;
const line = (y, text, color, size = 42) =>
  `<text x="600" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="bold" fill="${color}" text-anchor="middle" letter-spacing="1">${esc(text)}</text>`;

// state: { kind, season, record, worldSeriesName, opponent }
export function buildSvg(state) {
  const seasonLine = `Milwaukee Brewers · ${state.season} season`;
  const todayLine = state.opponent ? `today vs the ${state.opponent} · ${state.record}` : state.record;
  switch (state.kind) {
    case 'champions': {
      const { svg, baseline } = bigWord('CHAMPIONS', GOLD, 140, { size: 120 });
      return frame(baseball(600, 140) + svg + line(baseline + 58, 'WORLD SERIES CHAMPIONS', WHITE, 40) + sub(baseline + 112, seasonLine));
    }
    case 'offseason': {
      const { svg, baseline } = bigWord('OFFSEASON', GOLD, 175, { size: 120 });
      return frame(baseball(600, 175) + svg + sub(baseline + 58, `The ${state.season} season hasn't started yet`));
    }
    case 'tv-yes': {
      const { svg, baseline } = bigWord('YES!!!', GOLD, 150);
      return frame(baseball(600, 150) + svg + line(baseline + 60, todayLine, WHITE, 38) + sub(baseline + 118, seasonLine));
    }
    case 'tv-streaming': {
      const { svg, baseline } = bigWord('STREAMING', GOLD, 150, { size: 110 });
      return frame(baseball(600, 150) + svg + line(baseline + 60, todayLine, WHITE, 38) + sub(baseline + 118, seasonLine));
    }
    case 'tv-no': {
      const { svg, baseline } = bigWord('NO.', WHITE, 150);
      return frame(baseball(600, 150) + svg + line(baseline + 60, todayLine, GOLD, 38) + sub(baseline + 118, seasonLine));
    }
    case 'no-game': {
      const { svg, baseline } = bigWord('NOT TODAY', WHITE, 150, { size: 110 });
      return frame(baseball(600, 150) + svg + line(baseline + 60, `no game today · ${state.record}`, GOLD, 38) + sub(baseline + 118, seasonLine));
    }
    case 'record': {
      const { svg, baseline } = bigWord(state.record, GOLD, 150);
      return frame(baseball(600, 150) + svg + line(baseline + 60, 'FINAL RECORD', WHITE, 38) + sub(baseline + 118, seasonLine));
    }
    default: {
      const title = `<text x="600" y="370" font-family="${FONT}" font-size="66" font-weight="bold" fill="${WHITE}" text-anchor="middle" letter-spacing="1">ARE THE BREWERS</text>`
        + `<text x="600" y="448" font-family="${FONT}" font-size="66" font-weight="bold" fill="${WHITE}" text-anchor="middle" letter-spacing="1">ON TV?</text>`;
      return frame(baseball(600, 210) + title);
    }
  }
}

function toPng(svg) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1200 },
    font: { fontFiles: [BOLD, REGULAR], defaultFontFamily: FONT, loadSystemFonts: false },
  });
  return resvg.render().asPng();
}

export function renderPng(state) {
  return toPng(buildSvg(state));
}

// --- Records & Superlatives cards ---

const title = (text, size = 58) =>
  `<text x="600" y="120" font-family="${FONT}" font-size="${size}" font-weight="bold" fill="${GOLD}" text-anchor="middle" letter-spacing="2">${esc(text)}</text>`;
const headline = (text, color = GOLD) =>
  `<text x="600" y="345" font-family="${FONT}" font-size="130" font-weight="bold" fill="${color}" text-anchor="middle">${esc(text)}</text>`;

// Standard records layout: title, season-range subtitle, big #1, context line,
// then up to two runner-up lines.
function recordsFrame({ heading, headingSize, big, bigColor, context, runners, range }) {
  const runnerLines = (runners || [])
    .slice(0, 2)
    .map((r, i) => sub(462 + i * 46, r))
    .join('');
  return frame(
    title(heading, headingSize)
    + sub(168, `Milwaukee Brewers · ${range}`)
    + headline(big, bigColor)
    + line(408, context, WHITE, 34)
    + runnerLines
  );
}

// slug + data from records-core computeSuperlatives(); mirrors records.js copy.
export function buildRecordsSvg(slug, data) {
  const range = `${data.seasonRange.first}–${data.seasonRange.last}`;
  switch (slug) {
    case 'best-starts': {
      const [top, ...rest] = data.bestStarts;
      return recordsFrame({
        heading: 'BEST SEASON STARTS', range,
        big: `${top.games}–0`, context: `to open the ${top.season} season`,
        runners: [rest.map((b) => `${b.games}–0 in ${b.season}`).join('  ·  ')],
      });
    }
    case 'world-series-appearances': {
      const [top, ...rest] = data.worldSeriesAppearances;
      if (!top) {
        return frame(title('WORLD SERIES APPEARANCES') + sub(168, `Milwaukee Brewers · ${range}`)
          + line(360, 'None. Yet.', WHITE, 60));
      }
      return recordsFrame({
        heading: 'WORLD SERIES APPEARANCES', range,
        big: `${top.result} ${top.record}`,
        context: `${top.season} · vs the ${top.opponent}`,
        runners: rest.length
          ? [rest.map((p) => `${p.season}: ${p.result} ${p.record} vs ${p.opponent}`).join('  ·  ')]
          : ['The only one in franchise history.'],
      });
    }
    case 'playoff-appearances': {
      const [top, ...rest] = data.playoffAppearances;
      if (!top) {
        return frame(title('PLAYOFF APPEARANCES') + sub(168, `Milwaukee Brewers · ${range}`)
          + line(360, 'None. Yet.', WHITE, 60));
      }
      const seriesLine = (s) => `${s.result} ${s.roundLabel} (${s.record}) vs ${s.opponent}`;
      const summary = `${top.series.length} series in ${top.season}: ${top.series.map(seriesLine).join('  ·  ')}`;
      return recordsFrame({
        heading: 'PLAYOFF APPEARANCES', range,
        big: String(data.playoffAppearances.length),
        context: `most recent ${top.season} · ${top.series.length} series`,
        runners: [summary, rest.length ? `also: ${rest.map((p) => p.season).join(', ')}` : ''].filter(Boolean),
      });
    }
    case 'win-streaks': {
      const [top, ...rest] = data.winStreaks;
      return recordsFrame({
        heading: 'LONGEST WIN STREAKS', range,
        big: `${top.games} straight`,
        context: `${formatDate(top.startDate)} – ${formatDate(top.endDate)}`,
        runners: [rest.map((s) => `${s.games} in ${streakSpan(s)}`).join('  ·  ')],
      });
    }
    case 'worst-starts': {
      const [top, ...rest] = data.worstStarts;
      return recordsFrame({
        heading: 'WORST SEASON STARTS', range,
        big: `0–${top.games}`, bigColor: WHITE,
        context: `to open the ${top.season} season`,
        runners: [rest.map((w) => `0–${w.games} in ${w.season}`).join('  ·  ')],
      });
    }
    case 'lopsided-wins':
    case 'worst-losses': {
      const win = slug === 'lopsided-wins';
      const [top, ...rest] = win ? data.lopsidedWins : data.lopsidedLosses;
      const flag = (g) => (g.worldseries ? ', World Series' : g.playoff ? ', playoffs' : '');
      return recordsFrame({
        heading: win ? 'MOST LOPSIDED WINS' : 'WORST LOSSES', range,
        big: `${top.pf}–${top.pa}`, bigColor: win ? GOLD : WHITE,
        context: `vs the ${top.opponent} · ${formatDate(top.date)}${top.worldseries ? ' · World Series' : top.playoff ? ' · Playoffs' : ''}`,
        runners: rest.slice(0, 2).map((g) => `${g.pf}–${g.pa} vs the ${g.opponent} (${g.season}${flag(g)})`),
      });
    }
    case 'triple-plays': {
      const t = data.triplePlays || [];
      const [latest] = t;
      return recordsFrame({
        heading: 'TRIPLE PLAYS', range,
        big: String(t.length),
        context: latest ? `most recent: vs the ${latest.opponent} · ${formatDate(latest.date)}` : 'never happened',
        runners: ['Triple plays turned by the Brewers'],
      });
    }
    case 'most-hr-game': {
      const h = data.mostTeamHrGames || [];
      const [top, ...rest] = h;
      if (!top) {
        return frame(title('MOST HOME RUNS IN A GAME') + sub(168, `Milwaukee Brewers · ${range}`)
          + line(360, 'No data', WHITE, 60));
      }
      return recordsFrame({
        heading: 'MOST HOME RUNS IN A GAME', range,
        big: `${top.hr} HR`,
        context: `vs the ${top.opponent} · ${formatDate(top.date)}`,
        runners: [rest.slice(0, 3).map((g) => `${g.hr} vs ${g.opponent} (${g.season})`).join('  ·  ')],
      });
    }
    case 'player-hr-game': {
      const h = data.playerHrGames || [];
      const [top, ...rest] = h;
      if (!top) {
        return frame(title('MOST HR IN A GAME · PLAYER') + sub(168, `Milwaukee Brewers · ${range}`)
          + line(360, 'No data', WHITE, 60));
      }
      return recordsFrame({
        heading: 'MOST HR IN A GAME · PLAYER', range,
        big: `${top.hr} HR`,
        context: `${top.player} vs the ${top.opponent} · ${formatDate(top.date)}`,
        runners: [rest.slice(0, 3).map((g) => `${g.player} (${g.season})`).join('  ·  ')].filter(Boolean),
      });
    }
    case 'cycles': {
      const c = data.cycles || [];
      const [latest, ...rest] = c;
      if (!latest) {
        return frame(title('CYCLES') + sub(168, `Milwaukee Brewers · ${range}`)
          + line(360, 'None. Yet.', WHITE, 60));
      }
      return recordsFrame({
        heading: 'CYCLES', range,
        big: String(c.length),
        context: `most recent: ${latest.player} vs the ${latest.opponent} · ${formatDate(latest.date)}`,
        runners: [rest.slice(0, 3).map((x) => `${x.player} (${x.season})`).join('  ·  ')].filter(Boolean),
      });
    }
    case 'ties': {
      const [latest] = data.ties;
      return recordsFrame({
        heading: 'TIES', range,
        big: String(data.ties.length),
        context: latest ? `most recent: ${latest.pf}–${latest.pa} vs the ${latest.opponent} · ${formatDate(latest.date)}` : 'never happened',
        runners: [`Ties are extremely rare in MLB`],
      });
    }
    default: {
      const b = data.bestStarts[0], s = data.winStreaks[0],
        w = data.worstStarts[0], g = data.lopsidedWins[0], x = data.lopsidedLosses[0];
      const ws = data.worldSeriesAppearances, po = data.playoffAppearances;
      const rows = [
        `Best start — ${b.games}–0 (${b.season})`,
        `Longest win streak — ${s.games} straight (${streakSpan(s)})`,
        `Worst start — 0–${w.games} (${w.season})`,
        `Most lopsided win — ${g.pf}–${g.pa} vs ${g.opponent} (${g.season})`,
        `Worst loss — ${x.pf}–${x.pa} vs ${x.opponent} (${x.season})`,
        `World Series appearances — ${ws.length ? ws.map((p) => `${p.season} (${p.result} ${p.record})`).join(', ') : 'none'}`,
        `Playoff appearances — ${po.length ? po.length : 'none'}, most recent ${po[0] ? po[0].season : 'never'}`,
      ];
      return frame(
        title('RECORDS & SUPERLATIVES')
        + sub(168, `Milwaukee Brewers · ${range}`)
        + rows.map((r, i) => line(240 + i * 48, r, i % 2 ? WHITE : GOLD, 34)).join('')
      );
    }
  }
}

export function renderRecordsPng(slug, data) {
  return toPng(buildRecordsSvg(slug, data));
}

// --- Head-to-head cards ---

export function buildH2hSvg(slug, data) {
  const o = data.bySlug.get(slug);
  if (!o) {
    const [a, b] = data.opponents;
    return recordsFrame({
      heading: 'HEAD-TO-HEAD', range: 'all-time',
      big: String(data.opponents.length),
      context: 'opponents faced since 1969',
      runners: [
        `most played: ${a.name} — ${a.record} in ${a.games} meetings`,
        `then ${b.name} — ${b.record} in ${b.games}`,
      ],
    });
  }
  const { result, count } = o.streak;
  const verb = result === 'WIN' ? 'won' : result === 'LOSS' ? 'lost' : 'tied';
  const streakLine = count >= 2
    ? `${verb} the last ${count} meetings`
    : `last meeting: ${o.last.pf}–${o.last.pa} ${result === 'WIN' ? 'win' : result === 'LOSS' ? 'loss' : 'tie'}, ${formatDate(o.last.date)}`;
  const bigWinLine = o.biggestWin
    ? `biggest win: ${o.biggestWin.pf}–${o.biggestWin.pa} (${o.biggestWin.season})`
    : 'still chasing the first win';
  const heading = `VS THE ${o.name.toUpperCase()}`;
  return recordsFrame({
    heading, headingSize: heading.length > 24 ? 44 : 58,
    range: 'all-time head-to-head',
    big: o.record,
    context: `${meetings(o.games)} · first met ${o.first.season}`,
    runners: [streakLine, bigWinLine],
  });
}

export function renderH2hPng(slug, data) {
  return toPng(buildH2hSvg(slug, data));
}

// --- Franchise-history card: the actual chart, one point per season ---

export function buildHistorySvg(history) {
  const first = history[0].season, last = history[history.length - 1].season;
  const titles = history.filter((s) => s.champion).length;
  const winning = history.filter((s) => s.winPct > 0.5).length;
  const chart = buildChartSvg(history, {
    width: 1060, height: 300,
    axes: false, markers: true, emoji: false,
  }).replace('<svg ', '<svg x="70" y="200" ');
  return frame(
    title('MILWAUKEE BREWERS FRANCHISE HISTORY', 44)
    + sub(168, `Milwaukee Brewers · every season, ${first}–${last}`)
    + chart
    + line(548, `${titles} championships · ${winning} winning seasons · ${history.length} years`, WHITE, 30)
  );
}

export function renderHistoryPng(history) {
  return toPng(buildHistorySvg(history));
}

// --- Head coaches/managers card ---

export function buildCoachesSvg(data) {
  const { coaches } = data;
  const mostWins = [...coaches].sort((a, b) => b.wins - a.wins)[0];
  const bestPct = [...coaches].filter((c) => c.games >= 40).sort((a, b) => b.winPct - a.winPct)[0];
  const titles = coaches.reduce((s, c) => s + c.titles, 0);
  return recordsFrame({
    heading: 'MANAGERS', range: `${coaches[0].firstSeason}–present`,
    big: String(coaches.length),
    context: `managers · ${titles} championships between them`,
    runners: [
      `most wins: ${mostWins.name} — ${mostWins.record}`,
      bestPct ? `best win %: ${bestPct.name} — ${bestPct.record} (min. 40 games)` : '',
    ].filter(Boolean),
  });
}

export function renderCoachesPng(data) {
  return toPng(buildCoachesSvg(data));
}
