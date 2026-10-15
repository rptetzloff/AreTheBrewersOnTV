import test from 'node:test'
import assert from 'node:assert/strict'
import { computeTeamstatsRecords, computeSuperlatives } from '../records-core.js'
import { game, season } from './helpers/rows.js'

// When does a season enter Best and Worst Seasons? It waited for December,
// so 2026's 103-59 — the best record in franchise history, final since game
// 162 — was missing all October. Now: postseason started, or 162 games, or
// December, whichever comes first.

const TEAMSTATS = 'gid,team,p_h,p_ipouts'
const OCTOBER = new Date(2026, 9, 14)
const best = (rows, now = OCTOBER) => computeTeamstatsRecords(rows, TEAMSTATS, { now }).bestSeasons.map((s) => s.season)

// A finished past season to compete against: .500.
const past = season(2025, 'WL'.repeat(81))

test('a season with a postseason game counts in October', () => {
	const rows = [...past, ...season(2026, 'WWWL'), game({ date: '2026-10-04', regular: false, gametype: 'D' })]
	assert.deepEqual(best(rows), [2026, 2025])
})

test('a season of 162 games counts without a postseason', () => {
	const rows = [...past, ...season(2026, 'W'.repeat(100) + 'L'.repeat(62))]
	assert.deepEqual(best(rows), [2026, 2025])
})

test('a season still being played does not, however good its record', () => {
	const rows = [...past, ...season(2026, 'W'.repeat(120))]
	assert.deepEqual(best(rows, new Date(2026, 7, 20)), [2025])
})

test('December still settles a season that fell short of 162', () => {
	const rows = [...past, ...season(2026, 'W'.repeat(100) + 'L'.repeat(61))]
	assert.deepEqual(best(rows), [2025])
	assert.deepEqual(best(rows, new Date(2026, 11, 2)), [2026, 2025])
})

// The current season's teamstats lines are placeholders: gid, team, manager,
// gametype, and no stats. Nothing on the box score side may read them as
// zeros — with no innings recorded, no game is a no-hitter.
test('placeholder teamstats lines for this season produce no box score records', () => {
	const rows = season(2026, 'WWW').map((g, i) => ({ ...g, gid: `MIL2026040${5 + i}0` }))
	const ts = `gid,team,mgr,stattype,gametype,p_h,p_ipouts,p_w,p_hbp,p_bfp,d_tp,b_hr,d_e\n${rows.map((g) => `${g.gid},MIL,murpp001,value,regular,,,,,,,,`).join('\n')}`
	const r = computeTeamstatsRecords(rows, ts, { now: OCTOBER })
	assert.equal(r.noHitters.length, 0)
	assert.equal(r.triplePlays.length, 0)
	assert.equal(r.mostTeamHrGames.length, 0)
	assert.equal(r.mostTeamErrorGames.length, 0)
})

// Playoff appearances called a series won on more wins than losses, so the
// 2026 NLCS read "Won LCS ... (2-0)" after two games of seven.
test('a series still being played leads, trails or is tied; a finished one is won or lost', () => {
	const post = (date, gametype, result, opponent) => game({ date, regular: false, gametype, result, opponent })
	const rows = [
		...season(2026, 'WWW'),
		...['WIN', 'WIN', 'LOSS', 'WIN'].map((r, i) => post(`2026-10-0${4 + i}`, 'D', r, 'San Diego Padres')),
		post('2026-10-12', 'L', 'WIN', 'Los Angeles Dodgers'),
		post('2026-10-13', 'L', 'WIN', 'Los Angeles Dodgers'),
	]
	const [y] = computeSuperlatives(rows, { now: OCTOBER }).playoffAppearances
	assert.deepEqual(y.series.map((s) => `${s.result} ${s.roundLabel} ${s.record}`),
		['Won Division Series 3–1', 'Leads LCS 2–0'])
	// The same games once the season is over: still 2-0, but nothing left to play.
	const [after] = computeSuperlatives(rows, { now: new Date(2027, 2, 1) }).playoffAppearances
	assert.equal(after.series[1].result, 'Won')
})
