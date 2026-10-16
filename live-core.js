// The live game card's detail, boiled down from ESPN's game summary: the
// score and base-out state, each team's pitcher with his line and pitch
// count, the batter with his day and his record against this pitcher, the
// current at-bat pitch by pitch, and the last couple of plays.
//
// ESPN's summary is half a megabyte early in a game and a megabyte by the
// end; the live card polls it every fifteen seconds, which is too much to
// send a phone each time. The server reduces it here and sends a few KB.
// Pure functions — no fetch/DOM — tested against snapshots of a real game.
//
// Pitch locations are ESPN's own grid, seen from the pitcher's side — the
// way the TV's center-field camera shows it: a left-handed hitter, who
// stands on the first-base side, was hit by pitches at x 7 and 27, the low
// edge. The strike zone on that grid was measured from 448 called pitches
// in three Brewers games (October 2026): the called-strike rate crosses
// half at about x 85 and 146, y 147 and 192.
export const STRIKE_ZONE = { left: 85, right: 146, top: 147, bottom: 192 };

const num = (v) => {
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
};

/** A pitch's result as the list shows it: "Called strike", "Swinging
 *  strike", "Foul", "Ball", or for a ball in play what happened ("Single",
 *  "Fly Out"), from ESPN's play type. */
export function pitchResult(play, call = pitchCall(play)) {
	const type = (play.type?.text || '').replace(/\s*-\s*overturned$/i, '');
	if (call === 'inplay') return type || 'In play';
	if (call === 'hbp') return 'Hit by pitch';
	if (call === 'foul') return /tip/i.test(type) ? 'Foul tip' : 'Foul';
	if (call === 'ball') return /intent/i.test(type) ? 'Intentional ball' : 'Ball';
	if (/swinging/i.test(type)) return 'Swinging strike';
	if (/looking/i.test(type)) return 'Called strike';
	return 'Strike';
}

/** How a pitch ended: 'ball', 'strike', 'foul', 'inplay' or 'hbp'. ESPN's
 *  pitch text reads "Pitch 3 : Ball 2", "Pitch 4 : Strike 2 Foul",
 *  "Pitch 1 : Ball In Play"; a hit batter is also "Ball In Play", told
 *  apart by the play's type. */
export function pitchCall(play) {
	const type = play.type?.text || '';
	const text = play.text || '';
	if (/hit by pitch/i.test(type)) return 'hbp';
	if (/ball in play/i.test(text)) return 'inplay';
	if (/foul/i.test(type) || /\bfoul\b/i.test(text)) return 'foul';
	if (/:\s*strike/i.test(text) || /^strike/i.test(type)) return 'strike';
	if (/:\s*ball/i.test(text) || /^ball/i.test(type) || /intent/i.test(type)) return 'ball';
	return 'strike';
}

// Plays worth a line in the play log: results, scoring plays, pitching
// changes, and the untagged events between pitches (a stolen base, a wild
// pitch). Pitches ('P'), at-bat starts ('A') and inning markers ('I', and
// the untagged End Inning / End Batter rows) are not.
const LOGGED = new Set(['N', 'S', 'C']);
function logged(play) {
	if (!play.text) return false;
	if (LOGGED.has(play.summaryType)) return true;
	if (play.summaryType) return false;
	return !/^end /i.test(play.type?.text || '');
}

const inningLabel = (period) => (period?.type && period?.number
	? `${period.type === 'Bottom' ? 'Bot' : period.type} ${ordinal(period.number)}`
	: '');
function ordinal(n) {
	const s = ['th', 'st', 'nd', 'rd'];
	const v = n % 100;
	return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** A line from a box score's labels and stats arrays: { IP: '1.1', ... }. */
const statLine = (labels, stats) => Object.fromEntries((labels || []).map((l, i) => [l, stats?.[i] ?? '']));

/** The live card's detail from ESPN's summary body, or null when it is not
 *  a game in progress or just finished. `recent` is how many plays the log
 *  keeps. */
export function liveDetail(summary, { recent = 2 } = {}) {
	const comp = summary?.header?.competitions?.[0];
	if (!comp) return null;
	const status = comp.status?.type || {};
	const teams = (comp.competitors || []).map((c) => ({
		id: String(c.team?.id ?? ''), abbr: c.team?.abbreviation || '', homeAway: c.homeAway,
		score: num(c.score),
	}));
	const abbrOf = new Map(teams.map((t) => [t.id, t.abbr]));

	// Names from the rosters, which list everyone dressed, so a pinch-hitter
	// who has not yet reached the box score still has one.
	const names = new Map();
	for (const t of summary.rosters || []) {
		for (const e of t.roster || []) {
			const a = e.athlete;
			if (a?.id) names.set(String(a.id), { name: a.displayName || a.fullName || '', short: a.shortName || a.lastName || '' });
		}
	}

	// Box score lines by player: pitching for every pitcher used, in the
	// order they came in; batting for the batter's day.
	const pitchingByTeam = new Map();
	const batting = new Map();
	for (const t of summary.boxscore?.players || []) {
		const teamId = String(t.team?.id ?? '');
		for (const s of t.statistics || []) {
			for (const a of s.athletes || []) {
				const id = String(a.athlete?.id ?? '');
				const line = statLine(s.labels, a.stats);
				if (!names.has(id) && a.athlete) names.set(id, { name: a.athlete.displayName || '', short: a.athlete.shortName || '' });
				if (s.type === 'pitching') {
					if (!pitchingByTeam.has(teamId)) pitchingByTeam.set(teamId, []);
					pitchingByTeam.get(teamId).push({ id, line });
				} else if (s.type === 'batting') {
					batting.set(id, line);
				}
			}
		}
	}

	const sit = summary.situation || {};
	const onMound = sit.pitcher?.playerId != null ? String(sit.pitcher.playerId) : null;
	const atBat = sit.batter?.playerId != null ? String(sit.batter.playerId) : null;

	// Each team's pitcher: the one on the mound for the team in the field,
	// the last one used for the other.
	const pitchers = teams.map((t) => {
		const used = pitchingByTeam.get(t.id) || [];
		const p = used.find((x) => x.id === onMound) || used[used.length - 1];
		if (!p) return null;
		const l = p.line;
		return {
			team: t.abbr, homeAway: t.homeAway, id: p.id,
			name: names.get(p.id)?.name || '', short: names.get(p.id)?.short || '',
			onMound: p.id === onMound,
			ip: l.IP || '', h: num(l.H), r: num(l.R), er: num(l.ER), bb: num(l.BB), k: num(l.K),
			// "PC-ST" is pitches-strikes; "PC" alone is the count.
			pitches: num(l.PC) ?? num(String(l['PC-ST'] || '').split('-')[0]),
			strikes: num(String(l['PC-ST'] || '').split('-')[1]),
		};
	}).filter(Boolean);

	const plays = summary.plays || [];
	let batter = null;
	let pitches = [];
	// Between batters ESPN keeps the last one at the plate, with his final
	// count (a strikeout reads 2-3), until the next one steps in. Such an
	// at-bat is over: its pitches show as the last at-bat and the count goes.
	let atBatOver = false;
	if (atBat && status.state === 'in') {
		const line = batting.get(atBat);
		const note = (sit.situationNotes || []).find((n) => n.type === 'BVP_STATS')?.text || null;
		const team = (summary.boxscore?.players || []).find((t) => (t.statistics || []).some((s) => (s.athletes || []).some((a) => String(a.athlete?.id) === atBat)));
		batter = {
			id: atBat, name: names.get(atBat)?.name || '', short: names.get(atBat)?.short || '',
			team: team ? abbrOf.get(String(team.team?.id)) || team.team?.abbreviation || '' : '',
			today: line ? line['H-AB'] || '' : '', avg: line?.AVG || '',
			vsPitcher: note,
		};
		// This at-bat: the latest at-bat id with him at the plate.
		const isHim = (p) => (p.participants || []).some((x) => x.type === 'batter' && String(x.athlete?.id) === atBat);
		const current = [...plays].reverse().find((p) => p.atBatId && isHim(p))?.atBatId;
		if (current) {
			// Over once ESPN closes it with "End Batter/Pitcher". Not on a
			// result row: a pinch-hitter sent up mid at-bat ("Muncy hit for
			// Rojas") is a result row under the same at-bat id, with the
			// at-bat still going.
			atBatOver = plays.some((p) => p.atBatId === current && /^end batter/i.test(p.type?.text || ''));
			pitches = plays
				.filter((p) => p.atBatId === current && p.summaryType === 'P')
				.map((p, i) => ({
					n: i + 1,
					type: p.pitchType?.text || '',
					mph: num(p.pitchVelocity),
					x: num(p.pitchCoordinate?.x), y: num(p.pitchCoordinate?.y),
					call: pitchCall(p),
					result: pitchResult(p),
				}));
		}
	}

	const log = plays.filter(logged).slice(-recent).reverse().map((p) => ({
		inning: inningLabel(p.period),
		text: p.text,
		scoring: Boolean(p.scoringPlay),
		away: num(p.awayScore), home: num(p.homeScore),
	}));

	return {
		id: String(summary.header?.id ?? ''),
		state: status.state || '', detail: status.detail || status.shortDetail || '',
		teams,
		situation: {
			balls: atBatOver ? null : num(sit.balls), strikes: atBatOver ? null : num(sit.strikes), outs: num(sit.outs),
			onFirst: Boolean(sit.onFirst), onSecond: Boolean(sit.onSecond), onThird: Boolean(sit.onThird),
		},
		pitchers, batter, pitches, atBatOver, log,
	};
}

// --- The live card's HTML ---

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// The zone drawing: ESPN's grid cropped around the zone, x 55-175 and
// y 115-245 (a pitch further out is drawn at the edge), and stretched
// taller — on that grid the zone is 61 wide by 45 high, where the real one
// is about square — so it looks the way it does on TV. Circles are placed
// in the stretched space, so they stay round.
const CROP = { x0: 55, x1: 175, y0: 115, y1: 245 };
const SX = 100 / (CROP.x1 - CROP.x0);
const SY = SX * ((STRIKE_ZONE.right - STRIKE_ZONE.left) / (STRIKE_ZONE.bottom - STRIKE_ZONE.top));
const px = (x) => (Math.min(Math.max(x, CROP.x0), CROP.x1) - CROP.x0) * SX;
const py = (y) => (Math.min(Math.max(y, CROP.y0), CROP.y1) - CROP.y0) * SY;
const CALL_LABEL = { ball: 'Ball', strike: 'Strike', foul: 'Foul', inplay: 'In play', hbp: 'Hit by pitch' };

/** The strike zone with this at-bat's pitches as numbered dots. */
export function pitchZoneSvg(pitches) {
	const w = 100;
	const h = Math.round((CROP.y1 - CROP.y0) * SY);
	const zone = `<rect class="zone-box" x="${px(STRIKE_ZONE.left).toFixed(1)}" y="${py(STRIKE_ZONE.top).toFixed(1)}" width="${(px(STRIKE_ZONE.right) - px(STRIKE_ZONE.left)).toFixed(1)}" height="${(py(STRIKE_ZONE.bottom) - py(STRIKE_ZONE.top)).toFixed(1)}"/>`;
	const dots = pitches.filter((p) => p.x !== null && p.y !== null).map((p) =>
		`<g class="zone-pitch zone-${p.call}"><circle cx="${px(p.x).toFixed(1)}" cy="${py(p.y).toFixed(1)}" r="8"/>` +
		`<text x="${px(p.x).toFixed(1)}" y="${(py(p.y) + 3.6).toFixed(1)}">${p.n}</text></g>`).join('');
	return `<svg class="live-zone" viewBox="0 0 ${w} ${h}" role="img" aria-label="Pitch locations, from the pitcher's side">${zone}${dots}</svg>`;
}

// IP, hits, earned runs, strikeouts and pitches; walks only when there are
// any, to keep the line on one row of a phone.
const pitcherLine = (p) => [
	`${p.ip} IP`, p.h !== null && `${p.h} H`, p.er !== null && `${p.er} ER`, p.bb ? `${p.bb} BB` : null, p.k !== null && `${p.k} K`,
	p.pitches !== null && `${p.pitches} P`,
].filter(Boolean).join(' · ');

/** The live card's detail block: the matchup, this at-bat pitch by pitch,
 *  the other team's pitcher, and the last plays. '' for nothing to show. */
export function liveDetailHtml(d) {
	if (!d || d.state !== 'in') return '';
	const mound = d.pitchers.find((p) => p.onMound);
	const other = d.pitchers.filter((p) => p !== mound);
	const parts = [];

	if (mound || d.batter) {
		const rows = [];
		if (mound) rows.push(`<div class="live-row"><span class="live-role">Pitching</span> <strong>${esc(mound.short || mound.name)}</strong> <span class="live-team">${esc(mound.team)}</span> <span class="live-stats">${esc(pitcherLine(mound))}</span></div>`);
		if (d.batter) {
			const day = [d.batter.today && `${d.batter.today} today`, d.batter.avg && `${d.batter.avg}`].filter(Boolean).join(' · ');
			rows.push(`<div class="live-row"><span class="live-role">${d.atBatOver ? 'Last up' : 'At bat'}</span> <strong>${esc(d.batter.short || d.batter.name)}</strong> <span class="live-team">${esc(d.batter.team)}</span> <span class="live-stats">${esc(day)}</span></div>`);
			if (d.batter.vsPitcher) rows.push(`<div class="live-note">${esc(d.batter.vsPitcher)}</div>`);
		}
		parts.push(`<div class="live-matchup">${rows.join('')}</div>`);
	}

	if (d.pitches.length) {
		const list = d.pitches.map((p) => `<li class="zone-${p.call}"><span class="live-pitch-n">${p.n}</span> ${esc(p.type || 'Pitch')}${p.mph ? ` <span class="live-mph">${p.mph}</span>` : ''} <span class="live-call">${esc(p.result || CALL_LABEL[p.call] || '')}</span></li>`).join('');
		parts.push(`<div class="live-atbat">${pitchZoneSvg(d.pitches)}<ol class="live-pitches" aria-label="${d.atBatOver ? 'Last at-bat' : 'This at-bat'}, pitch by pitch">${list}</ol></div>`);
	}

	for (const p of other) {
		parts.push(`<div class="live-row live-other"><span class="live-role">${esc(p.team)} pitcher</span> <strong>${esc(p.short || p.name)}</strong> <span class="live-stats">${esc(pitcherLine(p))}</span></div>`);
	}

	if (d.log.length) {
		parts.push(`<ol class="live-log" aria-label="Recent plays">${d.log.map((l) => `<li${l.scoring ? ' class="live-scoring"' : ''}><span class="live-inning">${esc(l.inning)}</span> ${esc(l.text)}</li>`).join('')}</ol>`);
	}
	return parts.length ? `<div class="live-detail">${parts.join('')}</div>` : '';
}

/** "Probables: Drohan (MIL) · Glasnow (LAD) 0-0, 1.93", or '' when unknown. */
export function probablesHtml(starters) {
	if (!starters.length) return '';
	const one = (s) => `<strong>${esc(s.short || s.name)}</strong> <span class="live-team">${esc(s.team)}</span>${s.record ? ` <span class="live-stats">${esc(s.record)}</span>` : ''}`;
	return `<div class="probables"><span class="live-role">Probables</span> ${starters.map(one).join('<span class="probables-sep"> vs </span>')}</div>`;
}

/** The next game's probable starters from a schedule or scoreboard event,
 *  or [] while they are unannounced (ESPN leaves `probables` off until
 *  then). The schedule names them only; the scoreboard, on game day, adds
 *  a record — "(0-0, 1.93)" — which comes back as "0-0, 1.93". */
export function probableStarters(event) {
	const comp = event?.competitions?.[0];
	// Away first, as a matchup reads ("Drohan vs Glasnow" for MIL at LAD).
	const ordered = [...(comp?.competitors || [])].sort((a, b) => (a.homeAway === 'away' ? -1 : 0) - (b.homeAway === 'away' ? -1 : 0));
	return ordered.map((c) => {
		const p = (c.probables || []).find((x) => x.name === 'probableStartingPitcher') || c.probables?.[0];
		if (!p?.athlete) return null;
		const record = typeof p.record === 'string' ? p.record.replace(/[()]/g, '').trim() || null : null;
		return {
			team: c.team?.abbreviation || '', homeAway: c.homeAway,
			name: p.athlete.displayName || '', short: p.athlete.shortName || '',
			record,
		};
	}).filter(Boolean);
}
