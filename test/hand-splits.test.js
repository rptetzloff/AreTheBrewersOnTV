import test from 'node:test'
import assert from 'node:assert/strict'
import { createHandSplitsCollector, battingSide, splitLine, playerHandSplits } from '../hand-splits-core.js'

const MIL = new Set(['MIL'])
const HEADER = ['gid', 'batteam', 'pitteam', 'batter', 'pitcher', 'bathand', 'pithand', 'pa', 'ab',
	'single', 'double', 'triple', 'hr', 'walk', 'iw', 'k', 'hbp', 'sf', 'sh', 'rbi', 'gametype']
// One play: a plate appearance unless pa says otherwise; the outcome flags
// set from `did`.
const play = ({ gid = 'MIL201804010', bat = 'MIL', pit = 'CHN', batter = 'yelic001', pitcher = 'lester01', bh = 'L', ph = 'R', pa = '1', ab = '1', did = [], rbi = '0', type = 'regular' }) => {
	const v = Object.fromEntries(HEADER.map((h) => [h, '0']))
	Object.assign(v, { gid, batteam: bat, pitteam: pit, batter, pitcher, bathand: bh, pithand: ph, pa, ab, rbi, gametype: type })
	for (const d of did) v[d] = '1'
	return HEADER.map((h) => v[h]).join(',')
}
const run = (lines) => {
	const c = createHandSplitsCollector(MIL)
	for (const l of [HEADER.join(','), ...lines]) c.line(l)
	return c.result().handSplits
}

test('a switch hitter is counted on the side opposite the pitcher; a listed hand stands', () => {
	assert.equal(battingSide('B', 'R'), 'L')
	assert.equal(battingSide('B', 'L'), 'R')
	assert.equal(battingSide('R', 'R'), 'R')
	assert.equal(battingSide('B', '?'), null)
})

test("a Brewers batter's plate appearances by the pitcher's arm, a Brewers pitcher's by the batter's side", () => {
	const hs = run([
		play({ ph: 'R', did: ['single'], rbi: '1' }),
		play({ ph: 'L', did: ['hr'], rbi: '2' }),
		play({ ph: 'R', ab: '0', did: ['walk', 'iw'] }),
		// A Brewers pitcher facing a switch hitter, who bats left against him.
		play({ bat: 'CHN', pit: 'MIL', batter: 'swit001', pitcher: 'burnc002', bh: 'B', ph: 'R', did: ['k'] }),
	])
	const y = hs.get('bat|yelic001').get(2018)
	assert.deepEqual([y.R.pa, y.R.ab, y.R.h, y.R.bb, y.R.ibb, y.R.rbi], [2, 1, 1, 1, 1, 1])
	assert.deepEqual([y.L.pa, y.L.h, y.L.hr, y.L.rbi], [1, 1, 1, 2])
	const b = hs.get('pit|burnc002').get(2018)
	assert.deepEqual([b.L.pa, b.L.k, b.R.pa], [1, 1, 0])
	// The opposing batter is not a Brewer: no batting line for him.
	assert.equal(hs.has('bat|swit001'), false)
})

test('regular season and tiebreakers only; rows that are not plate appearances are skipped', () => {
	const hs = run([
		play({ did: ['single'] }),
		play({ gid: 'CHN201810010', type: 'playoff', did: ['single'] }),
		play({ gid: 'MIL201810040', type: 'divisionseries', did: ['hr'] }),
		play({ pa: '0', ab: '0' }),
	])
	const y = hs.get('bat|yelic001').get(2018)
	assert.deepEqual([y.R.pa, y.R.h, y.R.hr], [2, 2, 0])
})

test('rates from the counts; a career sums the seasons', () => {
	const l = splitLine({ pa: 5, ab: 4, h: 2, d: 1, t: 0, hr: 1, bb: 1, ibb: 0, k: 1, hbp: 0, sf: 0, sh: 0, rbi: 3 })
	assert.equal(l.avg, 0.5)
	assert.equal(l.obp, 3 / 5)
	assert.equal(l.slg, 6 / 4)
	assert.equal(splitLine({ pa: 1, ab: 0, h: 0, d: 0, t: 0, hr: 0, bb: 1, ibb: 0, k: 0, hbp: 0, sf: 0, sh: 0, rbi: 0 }).avg, null)
	const hs = run([play({ did: ['single'] }), play({ gid: 'MIL201904010', did: ['hr'] }), play({ gid: 'MIL201904010', ph: 'L', did: ['k'] })])
	const p = playerHandSplits(hs, 'yelic001')
	assert.deepEqual(p.batting.rows.map((r) => [r.season, r.vs, r.pa]), [[2018, 'R', 1], [2019, 'R', 1], [2019, 'L', 1]])
	assert.deepEqual([p.batting.career.R.pa, p.batting.career.R.h, p.batting.career.L.k], [2, 2, 1])
	assert.equal(p.pitching, null)
	assert.equal(playerHandSplits(hs, 'nobody01'), null)
	assert.equal(playerHandSplits(undefined, 'yelic001'), null)
})
