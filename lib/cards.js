// Open Graph social card generator (1200x630) for arethepackersundefeated.com
// Renders SVG -> PNG with bundled fonts so output is identical everywhere.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import * as OT from 'opentype.js';
import { formatDate, streakSpan, esc } from '../records-core.js';
import { meetings } from '../h2h-core.js';

const opentype = OT.default ?? OT;
const __dirname = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = join(__dirname, '..', 'fonts');
const BOLD = join(FONT_DIR, 'LiberationSans-Bold.ttf');
const REGULAR = join(FONT_DIR, 'LiberationSans-Regular.ttf');

const boldFont = opentype.parse(readFileSync(BOLD).buffer);

const GREEN_DARK = '#152A1E';
const GREEN = '#203731';
const GOLD = '#FFB612';
const WHITE = '#FFFFFF';
const SUB = '#CFE8D6';
const FONT = 'Liberation Sans';
const CAP_RATIO = 106 / 150; // cap height / font size for Liberation Sans Bold

function football(cx, cy, w = 118, h = 72) {
  return `<g transform="translate(${cx},${cy})">
    <ellipse rx="${w}" ry="${h}" fill="${GOLD}" stroke="${GREEN_DARK}" stroke-width="6"/>
    <path d="M -${w - 16} 0 A ${w - 6} ${h - 6} 0 0 1 ${w - 16} 0" fill="none" stroke="${GREEN_DARK}" stroke-width="5" opacity="0.35"/>
    <path d="M -${w - 16} 0 A ${w - 6} ${h - 6} 0 0 0 ${w - 16} 0" fill="none" stroke="${GREEN_DARK}" stroke-width="5" opacity="0.35"/>
    <line x1="-42" y1="0" x2="42" y2="0" stroke="${GREEN_DARK}" stroke-width="7"/>
    <line x1="-30" y1="-14" x2="-30" y2="14" stroke="${GREEN_DARK}" stroke-width="7"/>
    <line x1="-10" y1="-14" x2="-10" y2="14" stroke="${GREEN_DARK}" stroke-width="7"/>
    <line x1="10" y1="-14" x2="10" y2="14" stroke="${GREEN_DARK}" stroke-width="7"/>
    <line x1="30" y1="-14" x2="30" y2="14" stroke="${GREEN_DARK}" stroke-width="7"/>
  </g>`;
}

// Big centered word. Letters (ignoring trailing . or !) are centered on x=600,
// with `gap` px between the football's bottom edge and the letter cap-tops.
function bigWord(text, color, footballCy, { gap = 40, size = 150 } = {}) {
  const letters = text.replace(/[.!]+$/, '');
  const w = boldFont.getAdvanceWidth(letters, size);
  const xLeft = 600 - w / 2;
  const baseline = footballCy + 72 + 3 + gap + CAP_RATIO * size;
  const svg = `<text x="${xLeft.toFixed(1)}" y="${baseline.toFixed(1)}" font-family="${FONT}" `
    + `font-size="${size}" font-weight="bold" fill="${color}" text-anchor="start">${esc(text)}</text>`;
  return { svg, baseline };
}

function frame(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><radialGradient id="bg" cx="50%" cy="38%" r="80%">
    <stop offset="0%" stop-color="${GREEN}"/><stop offset="100%" stop-color="${GREEN_DARK}"/>
  </radialGradient></defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="0" y="0" width="1200" height="14" fill="${GOLD}"/>
  <rect x="0" y="616" width="1200" height="14" fill="${GOLD}"/>
  ${inner}
  <text x="600" y="586" font-family="${FONT}" font-size="30" font-weight="bold" fill="${GOLD}" text-anchor="middle" letter-spacing="2">arethepackersundefeated.com</text>
</svg>`;
}

const sub = (y, text) =>
  `<text x="600" y="${y}" font-family="${FONT}" font-size="30" fill="${SUB}" text-anchor="middle">${esc(text)}</text>`;
const line = (y, text, color, size = 42) =>
  `<text x="600" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="bold" fill="${color}" text-anchor="middle" letter-spacing="1">${esc(text)}</text>`;

// state: { kind, season, record, superBowlName }
export function buildSvg(state) {
  const seasonLine = `Green Bay Packers · ${state.season} season`;
  switch (state.kind) {
    case 'undefeated': {
      const { svg, baseline } = bigWord('YES.', GOLD, 150);
      return frame(football(600, 150) + svg + line(baseline + 60, `UNDEFEATED — ${state.record}`, WHITE) + sub(baseline + 118, seasonLine));
    }
    case 'champions': {
      const { svg, baseline } = bigWord('CHAMPIONS', GOLD, 140, { size: 120 });
      const m = (state.superBowlName || '').match(/Super Bowl\s+([IVXLCDM]+)$/i);
      const sb = m ? `SUPER BOWL ${m[1].toUpperCase()}` : 'SUPER BOWL CHAMPIONS';
      return frame(football(600, 140) + svg + line(baseline + 58, sb, WHITE, 40) + sub(baseline + 112, seasonLine));
    }
    case 'offseason': {
      const { svg, baseline } = bigWord('OFFSEASON', GOLD, 175, { size: 120 });
      return frame(football(600, 175) + svg + sub(baseline + 58, `The ${state.season} season hasn't started yet`));
    }
    case 'no': {
      const { svg, baseline } = bigWord('NO.', WHITE, 150);
      return frame(football(600, 150) + svg + line(baseline + 60, state.record, GOLD) + sub(baseline + 118, seasonLine));
    }
    default: {
      const title = `<text x="600" y="370" font-family="${FONT}" font-size="66" font-weight="bold" fill="${WHITE}" text-anchor="middle" letter-spacing="1">ARE THE PACKERS</text>`
        + `<text x="600" y="448" font-family="${FONT}" font-size="66" font-weight="bold" fill="${WHITE}" text-anchor="middle" letter-spacing="1">UNDEFEATED?</text>`;
      return frame(football(600, 210) + title);
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
    + sub(168, `Green Bay Packers · ${range}`)
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
    case 'perfect-seasons': {
      const [top, ...rest] = data.perfectSeasons;
      if (!top) {
        return frame(title('PERFECT SEASONS') + sub(168, `Green Bay Packers · ${range}`)
          + line(360, 'None. Yet.', WHITE, 60));
      }
      return recordsFrame({
        heading: 'PERFECT SEASONS', range,
        big: top.record, context: `the ${top.season} season — no losses`,
        runners: rest.length
          ? [rest.map((p) => `${p.record} in ${p.season}`).join('  ·  ')]
          : ['The only one in franchise history.'],
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
      const flag = (g) => (g.superbowl ? ', Super Bowl' : g.playoff ? ', playoffs' : '');
      return recordsFrame({
        heading: win ? 'MOST LOPSIDED WINS' : 'WORST LOSSES', range,
        big: `${top.pf}–${top.pa}`, bigColor: win ? GOLD : WHITE,
        context: `vs the ${top.opponent} · ${formatDate(top.date)}${top.superbowl ? ' · Super Bowl' : top.playoff ? ' · Playoffs' : ''}`,
        runners: rest.slice(0, 2).map((g) => `${g.pf}–${g.pa} vs the ${g.opponent} (${g.season}${flag(g)})`),
      });
    }
    case 'ties': {
      const [latest] = data.ties;
      const preOT = data.ties.filter((t) => t.season < 1974).length;
      return recordsFrame({
        heading: 'TIES', range,
        big: String(data.ties.length),
        context: latest ? `most recent: ${latest.pf}–${latest.pa} vs the ${latest.opponent} · ${formatDate(latest.date)}` : 'never happened',
        runners: [`${preOT} of them came before overtime arrived in 1974`],
      });
    }
    default: {
      const b = data.bestStarts[0], p = data.perfectSeasons[0], s = data.winStreaks[0],
        w = data.worstStarts[0], g = data.lopsidedWins[0], x = data.lopsidedLosses[0];
      const rows = [
        `Best start — ${b.games}–0 (${b.season})`,
        p ? `Perfect season — ${p.record} (${p.season})` : 'Perfect season — none. Yet.',
        `Longest win streak — ${s.games} straight (${streakSpan(s)})`,
        `Worst start — 0–${w.games} (${w.season})`,
        `Most lopsided win — ${g.pf}–${g.pa} vs ${g.opponent} (${g.season})`,
        `Worst loss — ${x.pf}–${x.pa} vs ${x.opponent} (${x.season})`,
        `Ties — ${data.ties.length}, most recent in ${data.ties[0] ? data.ties[0].season : 'never'}`,
      ];
      return frame(
        title('RECORDS & SUPERLATIVES')
        + sub(168, `Green Bay Packers · ${range}`)
        + rows.map((r, i) => line(240 + i * 48, r, i % 2 ? WHITE : GOLD, 34)).join('')
      );
    }
  }
}

export function renderRecordsPng(slug, data) {
  return toPng(buildRecordsSvg(slug, data));
}

// --- Head-to-head cards ---

// slug + data from h2h-core computeHeadToHead(); unknown/'overview' slug gets
// the landing card.
export function buildH2hSvg(slug, data) {
  const o = data.bySlug.get(slug);
  if (!o) {
    const [a, b] = data.opponents;
    return recordsFrame({
      heading: 'HEAD-TO-HEAD', range: 'all-time',
      big: String(data.opponents.length),
      context: 'opponents faced since 1921',
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
