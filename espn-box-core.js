// A current-season game's box score, from ESPN's game summary, in the shape
// the box score page (game.js) draws from Retrosheet: game info, line score,
// scoring summary, and each team's batting, pitching and fielding. Past
// seasons come from boxscore-core.js; this covers the season being played,
// live or final, until Retrosheet publishes it.
//
// ESPN's per-player lines are thinner than Retrosheet's — batting has H-AB,
// R, RBI, HR, BB, K and pitches seen, with no doubles, steals or sacrifices
// by player — but its team "details" carry the box score notes already
// written (2B, HR with inning and pitcher, RBI, LOB, RISP, HBP, wild
// pitches, first-pitch strikes...). Those go through as the notes, in place
// of the ones game.js would compute from Retrosheet's fuller lines.
// Pure functions — no fetch/DOM.

const num = (v) => {
	const n = Number(v);
	return Number.isFinite(n) ? n : 0;
};
const statLine = (labels, stats) => Object.fromEntries((labels || []).map((l, i) => [l, stats?.[i] ?? '']));

// "6.1" innings -> 19 outs.
const ipOuts = (ip) => {
	const [whole, part] = String(ip || '0').split('.');
	return num(whole) * 3 + num(part);
};

const UMPIRE_POS = { 'Home Plate Umpire': 'HP', 'First Base Umpire': '1B', 'Second Base Umpire': '2B', 'Third Base Umpire': '3B', 'Left Field Umpire': 'LF', 'Right Field Umpire': 'RF' };

// The game's date where it was played: ESPN gives UTC, and an evening game
// in Los Angeles is already tomorrow in UTC. Central time is close enough
// for every park, and it is the Brewers' own.
function localDate(iso) {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
	const get = (t) => parts.find((p) => p.type === t)?.value;
	return `${get('year')}-${get('month')}-${get('day')}`;
}

// ESPN's terser labels, as the Retrosheet box score page words them.
const NOTE_LABEL = {
	'FPS-BF': 'First-pitch strikes/BF',
	'CS-SS-FB-IPS': 'Called-Swinging-Foul-In play strikes',
	'GB-FB': 'Ground balls-Fly balls',
	GS: 'Game Score',
	PN: 'Note',
	'2Out RBI': '2-out RBI',
	PO: 'Picked off',
};

/** ESPN's notes for some groups ("battingDetails", "baserunningDetails",
 *  "pitchingDetails", "fieldingDetails") as [label, text] pairs, in order,
 *  blank ones left out. */
function detailNotes(team, ...groups) {
	return groups.flatMap((group) => {
		const g = (team?.details || []).find((d) => d.name === group);
		return (g?.stats || []).map((s) => {
			const label = s.abbreviation || s.shortDisplayName || s.displayName || '';
			return [NOTE_LABEL[label] || label, String(s.displayValue || '').trim().replace(/\s*\n\s*/g, ' ')];
		});
	}).filter(([label, text]) => label && text);
}

/** The box score for the game page from ESPN's summary body, or null when
 *  it has no game in it. */
export function espnBoxscore(summary) {
	const comp = summary?.header?.competitions?.[0];
	if (!comp) return null;
	const vis = comp.competitors?.find((c) => c.homeAway === 'away');
	const home = comp.competitors?.find((c) => c.homeAway === 'home');
	if (!vis || !home) return null;
	const abbr = (c) => c.team?.abbreviation || '';
	const visteam = abbr(vis);
	const hometeam = abbr(home);
	const brewIsHome = hometeam === 'MIL';
	const status = comp.status?.type || {};

	// Line score: runs by inning, with each inning's hits and errors summed.
	const side = (c) => {
		const ls = c.linescores || [];
		return {
			name: c.team?.displayName || abbr(c),
			inns: ls.map((e) => String(e.displayValue ?? e.value ?? '')),
			r: num(c.score),
			h: ls.reduce((s, e) => s + num(e.hits), 0),
			e: ls.reduce((s, e) => s + num(e.errors), 0),
		};
	};
	const hasLines = (vis.linescores || []).length > 0;

	const details = new Map((summary.boxscore?.teams || []).map((t) => [abbr(t), t]));

	// Batters faced, which ESPN's pitching line leaves out: the at-bats each
	// pitcher threw in, from the plays.
	const plays = summary.plays || [];
	const battersFaced = new Map();
	const seenAtBat = new Set();
	for (const p of plays) {
		if (!p.atBatId || seenAtBat.has(p.atBatId)) continue;
		const pitcher = (p.participants || []).find((x) => x.type === 'pitcher')?.athlete?.id;
		if (!pitcher) continue;
		seenAtBat.add(p.atBatId);
		battersFaced.set(String(pitcher), (battersFaced.get(String(pitcher)) || 0) + 1);
	}
	const featured = new Map((comp.status?.featuredAthletes || []).map((f) => [f.name, String(f.athlete?.id ?? '')]));

	const batting = {};
	const pitching = {};
	const fielding = {};
	for (const t of summary.boxscore?.players || []) {
		const team = abbr(t);
		const bat = (t.statistics || []).find((s) => s.type === 'batting');
		const pit = (t.statistics || []).find((s) => s.type === 'pitching');
		if (bat) {
			const players = (bat.athletes || []).map((a) => {
				const l = statLine(bat.labels, a.stats);
				return {
					id: String(a.athlete?.id ?? ''), name: a.athlete?.displayName || '',
					pos: a.position?.abbreviation || '', order: num(a.batOrder) || null,
					isStarter: a.starter !== false, isPh: false, isPr: false, letter: '',
					ab: num(l.AB), r: num(l.R), h: num(l.H), rbi: num(l.RBI), hr: num(l.HR), bb: num(l.BB), k: num(l.K),
					pitches: num(l['#P']),
				};
			});
			const totals = players.reduce((acc, p) => {
				for (const k of ['ab', 'r', 'h', 'rbi', 'hr', 'bb', 'k']) acc[k] += p[k];
				return acc;
			}, { ab: 0, r: 0, h: 0, rbi: 0, hr: 0, bb: 0, k: 0 });
			batting[team] = { players, totals, phNotes: [], notes: detailNotes(details.get(team), 'battingDetails', 'baserunningDetails') };
		}
		if (pit) {
			const pitchers = (pit.athletes || []).map((a) => {
				const l = statLine(pit.labels, a.stats);
				const id = String(a.athlete?.id ?? '');
				const [np, nps] = String(l['PC-ST'] || '').split('-').map((v) => (v === '' ? null : num(v)));
				const decision = (a.notes || []).find((n) => n.type === 'pitchingDecision')?.text || '';
				return {
					id, name: a.athlete?.displayName || '', ip: String(l.IP || '0.0'), ipouts: ipOuts(l.IP),
					bf: battersFaced.get(id) || 0, h: num(l.H), r: num(l.R), er: num(l.ER), bb: num(l.BB), k: num(l.K), hr: num(l.HR),
					isWp: featured.get('winningPitcher') === id || /^W\b/.test(decision),
					isLp: featured.get('losingPitcher') === id || /^L\b/.test(decision),
					isSave: featured.get('savingPitcher') === id || /^S\b/.test(decision),
					np: np || 0, nps: nps ?? null,
					fps: null, fpsPa: null, gb: 0, fb: 0, gsc: null,
				};
			});
			const totals = pitchers.reduce((acc, p) => {
				for (const k of ['ipouts', 'bf', 'h', 'r', 'er', 'bb', 'k', 'hr', 'np']) acc[k] += p[k];
				if (p.nps === null) acc.npsOk = false; else acc.nps += p.nps;
				return acc;
			}, { ipouts: 0, bf: 0, h: 0, r: 0, er: 0, bb: 0, k: 0, hr: 0, np: 0, nps: 0, npsOk: true });
			pitching[team] = {
				pitchers,
				totals: { ...totals, ip: `${Math.floor(totals.ipouts / 3)}.${totals.ipouts % 3}`, nps: totals.npsOk ? totals.nps : null },
				notes: detailNotes(details.get(team), 'pitchingDetails'),
			};
		}
		fielding[team] = { players: [], notes: detailNotes(details.get(team), 'fieldingDetails') };
	}

	// Scoring summary: each run-scoring play once (ESPN flags a wild-pitch
	// run twice, the event and a result row in the same words).
	const seen = new Set();
	const scoring = plays
		.filter((p) => p.scoringPlay && p.summaryType !== 'P' && p.text)
		.map((p) => ({
			inning: num(p.period?.number), top: p.period?.type !== 'Bottom',
			team: p.period?.type === 'Bottom' ? hometeam : visteam,
			desc: p.text, runs: num(p.scoreValue),
			visScore: num(p.awayScore), homeScore: num(p.homeScore),
		}))
		.filter((p) => {
			const key = `${p.desc}|${p.visScore}|${p.homeScore}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});

	const info = summary.gameInfo || {};
	const name = (key) => {
		const id = featured.get(key);
		if (!id) return '';
		for (const t of Object.values(pitching)) {
			const p = t.pitchers.find((x) => x.id === id);
			if (p) return p.name;
		}
		return '';
	};
	const innings = Math.max((vis.linescores || []).length, (home.linescores || []).length);

	return {
		gid: String(summary.header?.id ?? ''),
		source: 'espn',
		final: Boolean(status.completed),
		status: status.detail || status.shortDetail || '',
		nav: null,
		game: {
			date: localDate(comp.date),
			season: num(summary.header?.season?.year) || num(localDate(comp.date).slice(0, 4)),
			visteam, hometeam,
			visName: vis.team?.displayName || visteam, homeName: home.team?.displayName || hometeam,
			visScore: num(vis.score), homeScore: num(home.score),
			parkName: info.venue?.fullName || '',
			attendance: num(info.attendance) || null,
			innings: status.completed && innings && innings !== 9 ? innings : null,
			wp: name('winningPitcher'), lp: name('losingPitcher'), save: name('savingPitcher'),
			brewAbbr: brewIsHome ? hometeam : visteam, brewIsHome,
			umpires: (info.officials || [])
				.sort((a, b) => num(a.order) - num(b.order))
				.map((o) => ({ pos: UMPIRE_POS[o.position?.name] || o.position?.displayName || '', name: o.displayName || '' })),
		},
		scoring,
		linescore: hasLines ? { visitor: side(vis), home: side(home) } : null,
		batting: Object.keys(batting).length ? batting : null,
		pitching: Object.keys(pitching).length ? pitching : null,
		fielding: Object.keys(fielding).length ? fielding : null,
		hasBatting: Object.keys(batting).length > 0,
		hasFielding: Object.keys(fielding).length > 0,
	};
}
