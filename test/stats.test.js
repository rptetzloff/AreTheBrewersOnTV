import test from 'node:test'
import assert from 'node:assert/strict'
import { seasonBatting, seasonPitching, seasonFielding, regularGidsBySeason } from '../stats-core.js'
import { game } from './helpers/rows.js'

const MIL = new Set(['MIL'])
const names = new Map([['yount', 'Robin Yount'], ['vuck', 'Pete Vuckovich']])
// One index line, with every field the index carries defaulting to zero.
const bat = (id, team, f = {}) => ({ id, team, pa: 0, ab: 0, r: 0, h: 0, d: 0, t: 0, hr: 0, rbi: 0, bb: 0, k: 0, sb: 0, cs: 0, hbp: 0, sf: 0, sh: 0, gdp: 0, ...f })
const pit = (id, team, f = {}) => ({ id, team, ipouts: 0, bf: 0, h: 0, hr: 0, r: 0, er: 0, bb: 0, k: 0, hbp: 0, wp: 0, bk: 0, gs: false, gf: false, isWp: false, isLp: false, isSave: false, ...f })

test('batting totals sum across games, and rates come from the totals', () => {
	const index = new Map([
		['g1', [bat('yount', 'MIL', { pa: 5, ab: 4, h: 2, d: 1, hr: 1, bb: 1, rbi: 3 }), bat('opp', 'NYA', { ab: 4, h: 4 })]],
		['g2', [bat('yount', 'MIL', { pa: 4, ab: 3, h: 1, t: 1, hbp: 1 })]],
		['g3', [bat('yount', 'MIL', { pa: 4, ab: 4, h: 0, k: 2 })]],
	])
	const [y] = seasonBatting(index, ['g1', 'g2', 'g3'], names, MIL)
	assert.equal(y.name, 'Robin Yount')
	assert.equal(y.g, 3)
	assert.deepEqual([y.ab, y.h, y.d, y.t, y.hr, y.tb], [11, 3, 1, 1, 1, 9])
	assert.equal(y.avg, 3 / 11)
	assert.equal(y.obp, (3 + 1 + 1) / (11 + 1 + 1 + 0)) // (H+BB+HBP)/(AB+BB+HBP+SF)
	assert.equal(y.slg, 9 / 11)
	assert.equal(y.ops, y.obp + y.slg)
})

test('a player with no at-bats has no average, not .000', () => {
	const index = new Map([['g1', [bat('yount', 'MIL', { pa: 1, bb: 1 })]]])
	const [y] = seasonBatting(index, ['g1'], names, MIL)
	assert.equal(y.avg, null)
	assert.equal(y.slg, null)
	assert.equal(y.ops, null)
	assert.equal(y.obp, 1)
})

test('pitching sums innings, decisions and ERA from the lines', () => {
	const index = new Map([
		['g1', [pit('vuck', 'MIL', { ipouts: 27, er: 2, h: 7, bb: 2, k: 6, gs: true, isWp: true })]],
		['g2', [pit('vuck', 'MIL', { ipouts: 20, er: 4, h: 8, bb: 3, k: 3, gs: true, isLp: true })]],
		['g3', [pit('vuck', 'MIL', { ipouts: 3, isSave: true })]],
	])
	const [v] = seasonPitching(index, ['g1', 'g2', 'g3'], names, MIL)
	assert.deepEqual([v.g, v.gs, v.w, v.l, v.sv, v.ip], [3, 2, 1, 1, 1, '16.2'])
	assert.equal(v.era, (27 * 6) / 50)
	assert.equal(v.whip, (3 * (5 + 15)) / 50)
})

test('a pitcher with no outs recorded has no ERA', () => {
	const index = new Map([['g1', [pit('vuck', 'MIL', { er: 3, h: 3 })]]])
	assert.equal(seasonPitching(index, ['g1'], names, MIL)[0].era, null)
})

test('fielding is one line per position, and pinch roles have none', () => {
	const fld = (pos, f = {}) => ({ id: 'yount', team: 'MIL', pos, po: 0, a: 0, e: 0, dp: 0, gs: false, ...f })
	const index = new Map([
		['g1', [fld(6, { po: 2, a: 4, e: 1, gs: true })]],
		['g2', [fld(6, { po: 1, a: 3, dp: 1, gs: true }), fld(8, { po: 2 })]],
		['g3', [fld(11)]],
	])
	const lines = seasonFielding(index, ['g1', 'g2', 'g3'], names, MIL)
	assert.deepEqual(lines.map((l) => [l.pos, l.g, l.gs, l.po, l.a, l.e, l.dp]), [['SS', 2, 2, 3, 7, 1, 1], ['CF', 1, 0, 2, 0, 0, 0]])
	assert.equal(lines[0].fpct, 10 / 11)
})

// MLB counts a tiebreaker in regular-season stats. Without it Christian
// Yelich's 2018 came out .323 with 184 hits, not his official .326 and 187.
test('a tiebreaker game counts toward the season; a playoff game does not', () => {
	const rows = [
		{ ...game({ date: '2018-09-30' }), gid: 'reg' },
		{ ...game({ date: '2018-10-01', regular: false, gametype: 'T' }), gid: 'g163' },
		{ ...game({ date: '2018-10-04', regular: false, gametype: 'D' }), gid: 'nlds' },
	]
	assert.deepEqual(regularGidsBySeason(rows).get(2018), ['reg', 'g163'])
})

// Retrosheet gives every pitcher a batting line, so a DH-era season listed
// the whole staff at 0 PA under the hitters.
test('a player who never came to the plate has no batting line', () => {
	const index = new Map([['g1', [bat('yount', 'MIL', { pa: 4, ab: 4, h: 1 }), bat('vuck', 'MIL')]]])
	assert.deepEqual(seasonBatting(index, ['g1'], names, MIL).map((p) => p.name), ['Robin Yount'])
})
