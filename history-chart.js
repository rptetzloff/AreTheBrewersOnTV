// Shared (browser + node) SVG builder for the franchise-history chart: one
// point per season. Pure string output, no DOM — the /history page, the
// homepage sparkline, and the server-rendered social card all use it.

const GOLD = '#FFB612';
const WHITE = '#FFFFFF';
const DARK = '#152A1E';

// Coaching-era bands for the full chart (notable tenures only).
export const ERAS = [
	{ label: 'Lambeau', from: 1921, to: 1949 },
	{ label: 'Lombardi', from: 1959, to: 1967 },
	{ label: 'Holmgren', from: 1992, to: 1998 },
	{ label: 'McCarthy', from: 2006, to: 2018 },
	{ label: 'LaFleur', from: 2019, to: 9999 },
];

// history: computeSeasonHistory() output. Options:
//   width/height  — SVG pixel size (also the viewBox)
//   metric        — 'winPct' | 'wins'
//   axes          — draw y-axis labels and gridlines
//   eras          — era bands (array like ERAS) or null
//   markers       — championship dots
//   hitAreas      — invisible per-season hover/click columns (data-season)
//   highlight     — a season number to mark with a distinct dot, or null
//   emoji         — trophy glyphs above championship dots (browser only;
//                   the PNG renderer has no emoji font)
export function buildChartSvg(history, {
	width = 1000, height = 420,
	metric = 'winPct',
	axes = true,
	eras = null,
	markers = true,
	hitAreas = false,
	highlight = null,
	emoji = false,
} = {}) {
	const pad = axes
		? { l: 46, r: 16, t: emoji ? 26 : 16, b: 30 }
		: { l: 4, r: 4, t: emoji ? 16 : 6, b: 6 };
	const plotW = width - pad.l - pad.r;
	const plotH = height - pad.t - pad.b;
	const first = history[0].season, last = history[history.length - 1].season;
	const maxY = metric === 'wins' ? Math.max(...history.map((s) => s.wins)) : 1;
	const x = (season) => pad.l + ((season - first) / (last - first)) * plotW;
	const y = (v) => pad.t + (1 - v / maxY) * plotH;
	const val = (s) => (metric === 'wins' ? s.wins : s.winPct);

	const parts = [];

	if (eras) {
		for (const era of eras) {
			const from = Math.max(era.from, first), to = Math.min(era.to, last);
			if (to < from) continue;
			parts.push(`<rect x="${x(from).toFixed(1)}" y="${pad.t}" width="${(x(to) - x(from)).toFixed(1)}" height="${plotH}" fill="${GOLD}" opacity="0.07"/>`);
			parts.push(`<text x="${((x(from) + x(to)) / 2).toFixed(1)}" y="${pad.t + 14}" font-size="12" fill="${GOLD}" opacity="0.7" text-anchor="middle">${era.label}</text>`);
		}
	}

	if (axes) {
		const ticks = metric === 'wins'
			? [0, Math.round(maxY / 2), maxY]
			: [0, 0.25, 0.5, 0.75, 1];
		for (const tv of ticks) {
			const ty = y(tv);
			const mid = metric === 'winPct' && tv === 0.5;
			parts.push(`<line x1="${pad.l}" y1="${ty.toFixed(1)}" x2="${width - pad.r}" y2="${ty.toFixed(1)}" stroke="${WHITE}" opacity="${mid ? 0.3 : 0.08}"${mid ? ' stroke-dasharray="4 4"' : ''}/>`);
			parts.push(`<text x="${pad.l - 8}" y="${(ty + 4).toFixed(1)}" font-size="12" fill="${WHITE}" opacity="0.55" text-anchor="end">${metric === 'wins' ? tv : tv === 0 || tv === 1 ? `${tv}` : `.${tv * 100}`}</text>`);
		}
		for (let decade = Math.ceil(first / 20) * 20; decade <= last; decade += 20) {
			parts.push(`<text x="${x(decade).toFixed(1)}" y="${height - 8}" font-size="12" fill="${WHITE}" opacity="0.55" text-anchor="middle">${decade}</text>`);
		}
	} else if (metric === 'winPct') {
		parts.push(`<line x1="${pad.l}" y1="${y(0.5).toFixed(1)}" x2="${width - pad.r}" y2="${y(0.5).toFixed(1)}" stroke="${WHITE}" opacity="0.25" stroke-dasharray="3 3"/>`);
	}

	const pts = history.map((s) => `${x(s.season).toFixed(1)},${y(val(s)).toFixed(1)}`).join(' ');
	parts.push(`<polyline points="${pts}" fill="none" stroke="${GOLD}" stroke-width="${axes ? 2 : 1.5}" stroke-linejoin="round"/>`);

	if (markers) {
		for (const s of history) {
			if (s.undefeated && !s.champion) {
				parts.push(`<circle cx="${x(s.season).toFixed(1)}" cy="${y(val(s)).toFixed(1)}" r="${axes ? 6 : 3.5}" fill="none" stroke="${WHITE}" stroke-width="1.5"/>`);
			}
			if (!s.champion) continue;
			parts.push(`<circle cx="${x(s.season).toFixed(1)}" cy="${y(val(s)).toFixed(1)}" r="${axes ? 5 : 2.5}" fill="${GOLD}" stroke="${DARK}" stroke-width="1.5"/>`);
			if (emoji) {
				parts.push(`<text x="${x(s.season).toFixed(1)}" y="${(y(val(s)) - (axes ? 10 : 6)).toFixed(1)}" font-size="${axes ? 14 : 9}" text-anchor="middle">🏆</text>`);
			}
		}
	}

	if (highlight != null) {
		const s = history.find((h) => h.season === highlight);
		if (s) parts.push(`<circle cx="${x(s.season).toFixed(1)}" cy="${y(val(s)).toFixed(1)}" r="${axes ? 6 : 3.5}" fill="${WHITE}" stroke="${DARK}" stroke-width="1.5"/>`);
	}

	if (hitAreas) {
		const step = plotW / (last - first);
		for (const s of history) {
			parts.push(`<rect data-season="${s.season}" x="${(x(s.season) - step / 2).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${height}" fill="transparent" style="cursor:pointer"/>`);
		}
	}

	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${parts.join('')}</svg>`;
}
