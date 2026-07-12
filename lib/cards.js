// Open Graph social card generator (1200x630) for arethepackersundefeated.com
// Renders SVG -> PNG with bundled fonts so output is identical everywhere.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import * as OT from 'opentype.js';

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

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

export function renderPng(state) {
  const resvg = new Resvg(buildSvg(state), {
    fitTo: { mode: 'width', value: 1200 },
    font: { fontFiles: [BOLD, REGULAR], defaultFontFamily: FONT, loadSystemFonts: false },
  });
  return resvg.render().asPng();
}
